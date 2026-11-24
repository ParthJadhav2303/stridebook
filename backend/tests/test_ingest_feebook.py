"""Fee book ingestion. Uses a synthetic workbook with the same layout as the academy's FEE BOOK
(title row, month date, SMALL GROUP / BIG GROUP side by side, SR.NO | NAME | PAID/UNPAID | AMOUNT)."""

from datetime import datetime

import pytest
from openpyxl import Workbook

from app.core.db import SessionLocal
from app.ingest_feebook import apply, club_name_from_title, main, parse_workbook, tidy_name
from app.models import User
from tests.conftest import make_user
from tests.test_fees import ledger


def make_feebook(path, sheets: dict[str, tuple[datetime, list, list]]):
    wb = Workbook()
    wb.remove(wb.active)
    for title, (month, small, big) in sheets.items():
        ws = wb.create_sheet(title)
        ws["A1"] = "LAXMANBHAU JAGTAP KALA AND KRIDA ACADEMY FEE REPORT "
        ws["A4"] = month
        ws["A6"], ws["F6"] = "SMALL GROUP", "BIG GROUP "
        for c, h in zip("ABCDFGHI", ["SR.NO ", "NAME ", "PAID/UNPAID ", "AMOUNT "] * 2, strict=True):
            ws[f"{c}8"] = h
        for i in range(max(len(small), len(big), 3)):
            r = 9 + i
            ws[f"A{r}"], ws[f"F{r}"] = i + 1, i + 1  # numbered rows continue past the names
            if i < len(small):
                ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"] = small[i]
            if i < len(big):
                ws[f"G{r}"], ws[f"H{r}"], ws[f"I{r}"] = big[i]
    wb.save(path)
    return path


NOV = datetime(2026, 11, 1)


@pytest.fixture
def book(tmp_path):
    return make_feebook(
        tmp_path / "FEE_BOOK.xlsx",
        {
            "NOVEMBER 2026": (
                NOV,
                [("OVI BOBADE ", "P", None), ("ANSHIKA SHINDE ", None, None), ("SAVI  chaudhary", "p", 500)],
                [
                    ("SHIVANI  Pisal ", "P", None),
                    ("MRUDULA ", None, None),
                    ("Aarya Nagare", "PAID", "₹1,200"),
                ],
            ),
            "DECEMEBER 2026 ": (datetime(2026, 12, 1), [], []),
        },
    )


def test_parse_layout(book):
    data = parse_workbook(book)
    nov, dec = data.sheets
    assert (nov.title, nov.month.isoformat()) == ("NOVEMBER 2026", "2026-11-01")
    assert dec.entries == []
    assert [(e.group, e.name, e.paid, e.amount) for e in nov.entries] == [
        ("Small group", "Ovi Bobade", True, None),
        ("Small group", "Anshika Shinde", False, None),
        ("Small group", "Savi Chaudhary", True, 500),
        ("Big group", "Shivani Pisal", True, None),
        ("Big group", "Mrudula", False, None),
        ("Big group", "Aarya Nagare", True, 1200),
    ]
    assert club_name_from_title(data.club_title) == "Laxmanbhau Jagtap Kala and Krida Academy"


def test_tidy_name():
    assert tidy_name("  SHIVANI  Pisal ") == "Shivani Pisal"


def run(book, **kw):
    with SessionLocal() as db:
        user = db.query(User).filter_by(username="mom").one()
        res = apply(db, parse_workbook(book), user, **kw)
        db.commit()
        return res


def test_ingest_creates_students_and_payments(client, admin, book):
    res = run(book)
    assert (res.students_created, res.payments_created, res.total_amount) == (6, 4, 1000 + 500 + 1200 + 1200)

    students = {s["full_name"]: s for s in client.get("/api/students", headers=admin).json()}
    assert set(students) == {
        "Ovi Bobade",
        "Anshika Shinde",
        "Savi Chaudhary",
        "Shivani Pisal",
        "Mrudula",
        "Aarya Nagare",
    }
    assert students["Ovi Bobade"]["fee_group_name"] == "Small group"
    assert students["Ovi Bobade"]["joining_date"] == "2026-11-01"
    assert students["Mrudula"]["month_status"] == "unpaid"
    # Tests run with "today" = 15 Nov 2026, so November is the current month.
    assert students["Savi Chaudhary"]["month_status"] == "partial"  # ₹500 of ₹1,000
    assert students["Shivani Pisal"]["month_status"] == "paid"
    # Nothing is charged before November even though tracking starts earlier in tests.
    assert ledger(client, admin, students["Mrudula"]["id"])["2026-10"]["status"] is None

    assert (
        client.get("/api/settings/public").json()["club_name"] == "Laxmanbhau Jagtap Kala and Krida Academy"
    )
    dash = client.get("/api/reports/dashboard?month=2026-11", headers=admin).json()
    assert dash["received_for_month"] == 3900 and dash["expected"] == 3 * 1000 + 3 * 1200


def test_ingest_is_safe_to_run_twice(client, admin, book):
    run(book)
    again = run(book)
    assert (again.students_created, again.payments_created) == (0, 0)
    assert again.payments_skipped == 4  # including Savi's part-paid month: not paid a second time
    savi = client.get("/api/students?q=savi", headers=admin).json()[0]
    assert (savi["month_status"], savi["month_paid"]) == ("partial", 500)


def test_ingest_skips_months_paid_in_the_app(client, admin, book):
    from tests.test_fees import add_student, pay

    s = add_student(client, admin, name="Shivani Pisal", group=1, joining="2026-11-01")
    pay(client, admin, s["id"], 1200)
    res = run(book)
    assert res.students_created == 5 and res.payments_created == 3


def test_cli_dry_run_changes_nothing(client, admin, book, capsys):
    assert main([str(book), "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "NOVEMBER 2026" in out and "Dry run: nothing was saved." in out
    assert client.get("/api/students", headers=admin).json() == []


def test_cli_needs_an_admin(book, capsys):
    assert main([str(book)]) == 1
    assert "No admin user found" in capsys.readouterr().out


def test_cli_upi_and_date(client, book):
    make_user("mom", "admin")
    assert main([str(book), "--mode", "upi", "--paid-on", "2026-11-05"]) == 0
    from tests.conftest import login

    h = login(client, "mom")
    payments = client.get("/api/payments?limit=100", headers=h).json()
    assert {p["mode"] for p in payments} == {"upi"}
    assert {p["paid_on"] for p in payments} == {"2026-11-05"}
