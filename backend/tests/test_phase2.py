"""Phase 2: cancelling payments (undo), activity log, Excel export and import.
Today is frozen at 15 Nov 2026; tracking starts June 2026. Group 1 = Big ₹1,200, 2 = Small ₹1,000."""

import io
from datetime import date, datetime

import pytest
from openpyxl import Workbook, load_workbook
from sqlalchemy import text

from app.core.db import engine
from app.modules.imports.parser import parse_amount, parse_month
from tests.test_fees import add_student, ledger, pay


def age_payment(payment_id: int, minutes: int) -> None:
    with engine.begin() as c:
        c.execute(
            text("UPDATE payments SET created_at = now() - make_interval(mins => :m) WHERE id = :id"),
            {"m": minutes, "id": payment_id},
        )


# ---------- cancel / undo ----------
def test_recorder_can_undo_within_ten_minutes(client, coach):
    s = add_student(client, coach, joining="2026-11-01")
    p = pay(client, coach, s["id"], 1200).json()
    assert p["can_void"] is True
    r = client.post(f"/api/payments/{p['id']}/void", headers=coach, json={"reason": "Wrong student"})
    assert r.status_code == 200, r.text
    assert r.json()["is_voided"] is True
    assert ledger(client, coach, s["id"])["2026-11"]["status"] == "unpaid"
    assert client.get(f"/api/payments?student_id={s['id']}", headers=coach).json() == []


def test_coach_cannot_cancel_after_ten_minutes_but_admin_can(client, coach, admin):
    s = add_student(client, coach, joining="2026-11-01")
    p = pay(client, coach, s["id"], 1200).json()
    age_payment(p["id"], 11)
    assert client.get(f"/api/payments/{p['id']}", headers=coach).json()["can_void"] is False
    assert client.post(f"/api/payments/{p['id']}/void", headers=coach, json={}).status_code == 403
    assert (
        client.post(f"/api/payments/{p['id']}/void", headers=admin, json={"reason": "Bounced"}).status_code
        == 200
    )
    assert client.post(f"/api/payments/{p['id']}/void", headers=admin, json={}).status_code == 409


def test_coach_cannot_undo_someone_elses_payment(client, coach, admin):
    s = add_student(client, admin, joining="2026-11-01")
    p = pay(client, admin, s["id"], 1200).json()
    assert client.post(f"/api/payments/{p['id']}/void", headers=coach, json={}).status_code == 403


def test_cancelling_partial_and_advance_payment_restores_months(client, coach):
    s = add_student(client, coach, joining="2026-10-01", group=2)  # Oct + Nov owed
    first = pay(client, coach, s["id"], 1500).json()  # Oct paid, Nov part
    second = pay(client, coach, s["id"], 2500).json()  # Nov rest (500) + Dec + Jan advance
    assert [m["period"][:7] for m in second["months"]] == ["2026-11", "2026-12", "2027-01"]
    client.post(f"/api/payments/{second['id']}/void", headers=coach, json={})
    led = ledger(client, coach, s["id"])
    assert (led["2026-10"]["status"], led["2026-11"]["status"]) == ("paid", "partial")
    assert led["2026-12"]["status"] is None  # advance month removed, not shown as owed
    assert ledger(client, coach, s["id"], 2027)["2027-01"]["status"] is None
    assert client.get(f"/api/students/{s['id']}", headers=coach).json()["outstanding_amount"] == 500
    assert first["id"]


def test_dashboard_ignores_cancelled_payments(client, admin):
    s = add_student(client, admin, joining="2026-11-01")
    p = pay(client, admin, s["id"], 1200, mode="upi").json()
    client.post(f"/api/payments/{p['id']}/void", headers=admin, json={})
    d = client.get("/api/reports/dashboard?month=2026-11", headers=admin).json()
    assert (d["collected_in_month"], d["received_for_month"], d["students_unpaid"]) == (0, 0, 1)
    assert d["recent_payments"] == []


# ---------- activity log ----------
def test_activity_log_records_actions_in_plain_words(client, admin, coach):
    s = add_student(client, coach, name="Aarav Patil", joining="2026-11-01")
    p = pay(client, coach, s["id"], 1200).json()
    client.post(f"/api/payments/{p['id']}/void", headers=admin, json={"reason": "Entered twice"})
    client.patch(f"/api/students/{s['id']}", headers=coach, json={"status": "paused"})
    entries = client.get("/api/activity", headers=admin).json()
    summaries = [e["summary"] for e in entries]
    assert summaries[0] == "Marked Aarav Patil as paused."
    assert summaries[1] == "Cancelled ₹1,200 from Aarav Patil (receipt SB-2026-00001): Entered twice"
    assert summaries[2].startswith("Recorded ₹1,200 (cash) from Aarav Patil for Nov 2026")
    assert summaries[3] == "Added Aarav Patil to Big group."
    assert entries[2]["user_name"] == "Coach1"
    assert client.get("/api/activity", headers=coach).status_code == 403


# ---------- export ----------
def test_month_export_is_a_real_workbook(client, coach):
    a = add_student(client, coach, name="Aarav", joining="2026-11-01")
    add_student(client, coach, name="Ishita", joining="2026-11-01", group=2)
    pay(client, coach, a["id"], 1200, mode="upi")
    r = client.get("/api/reports/export.xlsx?month=2026-11", headers=coach)
    assert r.status_code == 200
    assert "stridebook-fees-2026-11.xlsx" in r.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(r.content))
    fees, payments = wb.worksheets
    assert fees.title == "Fees Nov 2026"
    rows = list(fees.iter_rows(min_row=2, max_row=3, values_only=True))
    assert rows[0][:7] == ("Aarav", "Big group", None, 1200, 1200, 0, "Paid")
    assert rows[1][:7] == ("Ishita", "Small group", None, 1000, 0, 1000, "Unpaid")
    pay_row = next(payments.iter_rows(min_row=2, max_row=2, values_only=True))
    assert pay_row[2:6] == ("Aarav", 1200, "UPI", "Nov 2026")


# ---------- import ----------
def make_xlsx(rows: list[list], headers=("Student Name", "Month", "Date", "Amount Paid")) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["Club fee register"])  # a title row above the headings, as real sheets often have
    ws.append(list(headers))
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload(client, headers, content: bytes, name="fees.xlsx"):
    return client.post(
        "/api/import/preview",
        headers=headers,
        files={"file": (name, content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Nov 2026", date(2026, 11, 1)),
        ("November 2026", date(2026, 11, 1)),
        ("nov-26", date(2026, 11, 1)),
        ("2026-11", date(2026, 11, 1)),
        ("11/2026", date(2026, 11, 1)),
        (datetime(2026, 11, 20), date(2026, 11, 1)),
        ("Oct", date(2026, 10, 1)),  # year taken from the payment date
    ],
)
def test_month_formats(value, expected):
    assert parse_month(value, 2026) == expected


def test_amount_formats():
    assert parse_amount("₹1,200") == 1200
    assert parse_amount(1200.0) == 1200
    with pytest.raises(ValueError):
        parse_amount("abc")


def test_import_preview_then_commit(client, admin):
    existing = add_student(client, admin, name="Aarav Patil", joining="2026-06-01")
    content = make_xlsx(
        [
            ["aarav  patil", "Oct 2026", "05/10/2026", "₹1,200"],  # existing, name spacing/case differ
            ["Ishita Kulkarni", "Sep 2026", datetime(2026, 9, 3), 1000],  # new student
            ["Ishita Kulkarni", "Oct 2026", "04-10-2026", 1000],
            ["Bad Row", "Smarch", "01/10/2026", 500],  # bad month
            ["", "", "", ""],  # blank line ignored
            ["Late Kid", "Dec 2026", "01/12/2026", 1000],  # future date
        ]
    )
    r = upload(client, admin, content)
    assert r.status_code == 200, r.text
    pv = r.json()
    statuses = [(row["student_name"], row["status"]) for row in pv["rows"]]
    assert statuses == [
        ("Aarav Patil", "ok"),
        ("Ishita Kulkarni", "new_student"),
        ("Ishita Kulkarni", "new_student"),
        ("Bad Row", "error"),
        ("Late Kid", "error"),
    ]
    assert pv["rows"][0]["student_id"] == existing["id"]
    assert pv["new_students"] == [
        {"name": "Ishita Kulkarni", "first_month": "2026-09-01", "rows": 2, "total": 2000}
    ]
    assert (pv["ok_rows"], pv["error_rows"], pv["total_amount"]) == (3, 2, 3200)

    good = [row for row in pv["rows"] if row["status"] in ("ok", "new_student")]
    body = {
        "filename": "fees.xlsx",
        "rows": [{k: row[k] for k in ("student_name", "month", "paid_on", "amount", "mode")} for row in good],
        "new_students": [{"name": "Ishita Kulkarni", "fee_group_id": 2}],
    }
    r = client.post("/api/import/commit", headers=admin, json=body)
    assert r.status_code == 200, r.text
    assert r.json() == {"payments_created": 3, "students_created": 1, "total_amount": 3200}

    assert ledger(client, admin, existing["id"])["2026-10"]["status"] == "paid"
    ishita = client.get("/api/students?q=ishita", headers=admin).json()[0]
    assert ishita["joining_date"] == "2026-09-01" and ishita["fee_group_name"] == "Small group"
    led = ledger(client, admin, ishita["id"])
    assert (led["2026-09"]["status"], led["2026-10"]["status"], led["2026-11"]["status"]) == (
        "paid",
        "paid",
        "unpaid",
    )

    # Uploading the same file again: everything already recorded is flagged, nothing double-counted.
    again = upload(client, admin, content).json()
    assert [row["status"] for row in again["rows"]][:3] == ["duplicate", "duplicate", "duplicate"]
    assert again["ok_rows"] == 0


def test_import_needs_fee_group_for_new_students(client, admin):
    body = {
        "rows": [
            {
                "student_name": "New Kid",
                "month": "2026-10-01",
                "paid_on": "2026-10-02",
                "amount": 1000,
                "mode": "cash",
            }
        ]
    }
    r = client.post("/api/import/commit", headers=admin, json=body)
    assert r.status_code == 422
    assert "fee group" in r.json()["detail"]
    assert client.get("/api/students", headers=admin).json() == []  # nothing half-saved


def test_import_rejects_wrong_file(client, admin):
    r = upload(client, admin, b"not excel", name="notes.txt")
    assert r.status_code == 422
    r = upload(client, admin, make_xlsx([["A", "B"]], headers=("Foo", "Bar")))
    assert r.status_code == 422
    assert "column headings" in r.json()["detail"]


def test_import_reads_csv_with_mode_column(client, admin):
    add_student(client, admin, name="Riya Mane", joining="2026-06-01", group=2)
    csv_text = "Name,Month,Date,Amount,Mode\nRiya Mane,Nov 2026,10/11/2026,1000,GPay\n"
    r = upload(client, admin, csv_text.encode(), name="fees.csv")
    assert r.status_code == 200, r.text
    row = r.json()["rows"][0]
    assert (row["status"], row["mode"]) == ("ok", "upi")


def test_coach_cannot_import(client, coach):
    assert upload(client, coach, make_xlsx([])).status_code == 403
