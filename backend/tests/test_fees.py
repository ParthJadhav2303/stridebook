"""Money rules. Today is frozen at 15 Nov 2026; tracking starts June 2026.
Fee groups: 1 = Big (₹1,200), 2 = Small (₹1,000)."""


def add_student(client, headers, name="Aarav", group=1, joining="2026-11-20", **extra):
    r = client.post(
        "/api/students",
        headers=headers,
        json={"full_name": name, "fee_group_id": group, "joining_date": joining, **extra},
    )
    assert r.status_code == 201, r.text
    return r.json()


def pay(client, headers, student_id, amount, mode="cash", months=None):
    body = {"student_id": student_id, "amount": amount, "mode": mode}
    if months:
        body["months"] = months
    return client.post("/api/payments", headers=headers, json=body)


def set_rate(client, headers, amount, month, group=1):
    return client.post(
        f"/api/fee-groups/{group}/rates",
        headers=headers,
        json={"monthly_amount": amount, "effective_from": month},
    )


def ledger(client, headers, sid, year=2026):
    months = client.get(f"/api/students/{sid}/ledger?year={year}", headers=headers).json()["months"]
    return {m["period"][:7]: m for m in months}


def test_fee_groups_seeded(client, coach):
    groups = client.get("/api/fee-groups", headers=coach).json()
    assert [(g["name"], g["current_amount"]) for g in groups] == [("Big group", 1200), ("Small group", 1000)]


def test_full_fee_for_joining_month_even_late_in_month(client, coach):
    s = add_student(client, coach, joining="2026-11-28", group=2)
    assert s["month_status"] == "unpaid"
    assert s["month_due"] == 1000
    assert s["outstanding_months"] == 1


def test_dues_from_joining_month_but_not_before_tracking_start(client, coach):
    old = add_student(client, coach, name="Old timer", joining="2019-04-10")
    sep = add_student(client, coach, name="September", joining="2026-09-05")
    assert old["outstanding_months"] == 6  # June–November 2026
    assert sep["outstanding_months"] == 3  # Sep, Oct, Nov
    led = ledger(client, coach, sep["id"])
    assert led["2026-08"]["status"] is None
    assert led["2026-09"]["status"] == "unpaid"
    assert led["2026-12"]["status"] is None  # future months aren't charged yet


def test_payment_fills_oldest_months_first(client, coach):
    s = add_student(client, coach, joining="2026-09-01")  # Sep, Oct, Nov at 1200
    r = pay(client, coach, s["id"], 1800, mode="upi")
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["receipt_no"] == "SB-2026-00001"
    assert [(m["period"][:7], m["amount"]) for m in p["months"]] == [("2026-09", 1200), ("2026-10", 600)]
    led = ledger(client, coach, s["id"])
    assert (led["2026-09"]["status"], led["2026-10"]["status"], led["2026-11"]["status"]) == (
        "paid",
        "partial",
        "unpaid",
    )
    detail = client.get(f"/api/students/{s['id']}", headers=coach).json()
    assert detail["outstanding_amount"] == 3600 - 1800
    assert detail["outstanding_months"] == 2


def test_chosen_months_are_paid_first(client, coach):
    s = add_student(client, coach, joining="2026-09-01")
    p = pay(client, coach, s["id"], 1200, months=["2026-11"]).json()
    assert [m["period"][:7] for m in p["months"]] == ["2026-11"]
    led = ledger(client, coach, s["id"])
    assert led["2026-09"]["status"] == "unpaid" and led["2026-11"]["status"] == "paid"


def test_advance_payment_creates_future_months(client, coach):
    s = add_student(client, coach, joining="2026-11-01", group=2)
    p = pay(client, coach, s["id"], 3000).json()  # Nov + Dec + Jan
    assert [m["period"][:7] for m in p["months"]] == ["2026-11", "2026-12", "2027-01"]
    assert ledger(client, coach, s["id"], 2027)["2027-01"]["status"] == "paid"


def test_overpayment_beyond_a_year_is_rejected(client, coach):
    s = add_student(client, coach, joining="2026-11-01", group=2)
    r = pay(client, coach, s["id"], 20000)
    assert r.status_code == 422
    # Nothing was saved.
    assert client.get(f"/api/payments?student_id={s['id']}", headers=coach).json() == []


def test_custom_fee_overrides_group(client, coach):
    s = add_student(client, coach, joining="2026-11-01", custom_monthly_fee=800)
    assert s["month_due"] == 800 and s["monthly_fee"] == 800


def test_rate_change_applies_from_chosen_month_only(client, admin):
    s = add_student(client, admin, joining="2026-10-01")
    r = set_rate(client, admin, 1300, "2026-11")
    assert r.status_code == 200
    led = ledger(client, admin, s["id"])
    assert led["2026-10"]["amount_due"] == 1200
    assert led["2026-11"]["amount_due"] == 1300


def test_rate_change_does_not_touch_paid_months(client, admin):
    s = add_student(client, admin, joining="2026-11-01")
    pay(client, admin, s["id"], 1200)
    set_rate(client, admin, 1300, "2026-11")
    nov = ledger(client, admin, s["id"])["2026-11"]
    assert (nov["amount_due"], nov["status"]) == (1200, "paid")


def test_left_student_owes_only_until_leaving_month(client, coach):
    s = add_student(client, coach, joining="2026-06-01")  # June–Nov dues exist
    r = client.patch(
        f"/api/students/{s['id']}", headers=coach, json={"status": "left", "leaving_date": "2026-08-10"}
    )
    assert r.status_code == 200
    assert r.json()["outstanding_months"] == 3  # June, July, August
    led = ledger(client, coach, s["id"])
    assert [k for k, v in led.items() if v["status"]] == ["2026-06", "2026-07", "2026-08"]
    active = client.get("/api/students", headers=coach).json()
    assert all(x["id"] != s["id"] for x in active)


def test_paid_months_after_leaving_are_kept(client, coach):
    s = add_student(client, coach, joining="2026-11-01")
    pay(client, coach, s["id"], 2400)  # Nov + advance Dec
    client.patch(
        f"/api/students/{s['id']}", headers=coach, json={"status": "left", "leaving_date": "2026-11-20"}
    )
    assert ledger(client, coach, s["id"])["2026-12"]["status"] == "paid"


def test_students_filter_by_month_status(client, coach):
    a = add_student(client, coach, name="Paid kid", joining="2026-11-01")
    add_student(client, coach, name="Unpaid kid", joining="2026-11-01")
    pay(client, coach, a["id"], 1200)
    names = [s["full_name"] for s in client.get("/api/students?month_status=pending", headers=coach).json()]
    assert names == ["Unpaid kid"]
    names = [s["full_name"] for s in client.get("/api/students?q=paid", headers=coach).json()]
    assert names == ["Paid kid", "Unpaid kid"]


def test_dues_list_and_dashboard(client, coach):
    a = add_student(client, coach, name="A", joining="2026-11-01")  # 1200
    b = add_student(client, coach, name="B", joining="2026-11-01", group=2)  # 1000
    add_student(client, coach, name="C", joining="2026-10-01", group=2)  # Oct + Nov 1000
    pay(client, coach, a["id"], 1200, mode="cash")
    pay(client, coach, b["id"], 500, mode="upi")

    dues = client.get("/api/dues?month=2026-11", headers=coach).json()
    assert dues["counts"] == {"unpaid": 1, "partial": 1, "paid": 1, "waived": 0}
    pending = client.get("/api/dues?month=2026-11&status=pending", headers=coach).json()["rows"]
    assert [(r["student_name"], r["outstanding_months"]) for r in pending] == [("B", 1), ("C", 2)]

    d = client.get("/api/reports/dashboard?month=2026-11", headers=coach).json()
    assert d["expected"] == 3200
    assert d["received_for_month"] == 1700
    assert d["pending_for_month"] == 1500
    assert (d["students_paid"], d["students_partial"], d["students_unpaid"]) == (1, 1, 1)
    assert (d["collected_in_month"], d["collected_cash"], d["collected_upi"]) == (1700, 1200, 500)
    assert d["total_outstanding"] == 500 + 2000
    assert d["active_students"] == 3
    assert len(d["recent_payments"]) == 2


def test_payment_validation(client, coach):
    s = add_student(client, coach)
    assert pay(client, coach, s["id"], 0).status_code == 422
    assert pay(client, coach, s["id"], 100, mode="cheque").status_code == 422
    r = client.post(
        "/api/payments",
        headers=coach,
        json={"student_id": s["id"], "amount": 100, "mode": "cash", "paid_on": "2026-12-01"},
    )
    assert r.status_code == 422


def test_club_name_editable_by_admin_only(client, admin, coach):
    assert client.patch("/api/settings", headers=coach, json={"club_name": "X Club"}).status_code == 403
    r = client.patch("/api/settings", headers=admin, json={"club_name": "Pune Striders", "club_short": "PS"})
    assert r.json()["club_name"] == "Pune Striders"
    assert client.get("/api/settings/public").json()["club_short"] == "PS"


def test_invalid_phone_rejected(client, coach):
    r = client.post(
        "/api/students", headers=coach, json={"full_name": "Kid", "fee_group_id": 1, "parent_phone": "12345"}
    )
    assert r.status_code == 422
