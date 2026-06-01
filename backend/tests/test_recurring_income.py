"""
Recurring Monthly Income — full lifecycle regression.

Covers:
  1. One-time income appears only in the month matching its `date`.
  2. Recurring income appears in EVERY month from start onward (no end).
  3. Recurring + end_year/end_month → stops appearing after end month.
  4. Per-month override (`edit_mode=this_month`) changes only one month.
  5. Forward edit splits the template — original ends prev month, new template starts current.
  6. `edit_mode=all` updates the template directly (every future month sees new amount).
  7. Delete with `delete_mode=this_month` → zero override only that month.
  8. Delete with `delete_mode=forward` → ends template at prev month.
  9. /budget/summary uses recurring → income_total + by_owner.income reflect template.
  10. /budget/forecast uses recurring → forecast.income_total matches active template.

Each test creates an isolated family via /api/auth/register so cross-test leakage
is impossible. SMTP is auto-cleared via the conftest autouse fixture.
"""

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 20


# ─── helpers ────────────────────────────────────────────────────────────
def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_family(tag):
    from tests.conftest import verify_account_email
    email = f"qa-rec-{tag}-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "email": email,
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "family_name": f"QA-Rec-{tag}",
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    verify_account_email(email)
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": payload["password"]},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _add_member(tok, name="Parent"):
    r = requests.post(
        f"{API}/family/members",
        json={"name": name, "pin": "1234", "is_family_admin": True, "role": "parent"},
        headers=_h(tok),
        timeout=TIMEOUT,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def _select_member(account_tok, member_id):
    r = requests.post(
        f"{API}/auth/member/select",
        json={"member_id": member_id, "pin": "1234"},
        headers=_h(account_tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["member_token"]


def _bootstrap(tag):
    """Returns (member_token, member_id) for a fresh family."""
    reg = _register_family(tag)
    acc = reg["access_token"]
    m = _add_member(acc, f"Parent-{tag}")
    return _select_member(acc, m["id"]), m["id"]


def _list_income(tok, year=None, month=None):
    params = {}
    if year is not None and month is not None:
        params = {"year": year, "month": month}
    r = requests.get(f"{API}/budget/income", params=params, headers=_h(tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


def _income_total(tok, year, month):
    return sum(float(x["amount"]) for x in _list_income(tok, year, month))


# ─── tests ──────────────────────────────────────────────────────────────

def test_one_time_appears_only_in_matching_month():
    tok, _ = _bootstrap("one")
    r = requests.post(
        f"{API}/budget/income",
        json={
            "description": "Bonus",
            "amount": 500,
            "category": "extra",
            "date": "2026-03-15",
            "type": "one_time",
        },
        headers=_h(tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    # Appears in March
    assert _income_total(tok, 2026, 3) == 500
    # Does NOT appear in April or February
    assert _income_total(tok, 2026, 4) == 0
    assert _income_total(tok, 2026, 2) == 0


def test_primary_without_explicit_type_defaults_to_recurring():
    """API contract: posting a `primary` income without `type` field must
    default to recurring, matching the migration policy. Bonuses (extra /
    external) keep the one_time default — they're typically not monthly.
    """
    tok, _ = _bootstrap("def")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "Salary", "amount": 2200, "category": "primary",
              "date": "2026-06-01"},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "recurring", f"primary default should be recurring, got {body}"
    assert body["start_year"] == 2026 and body["start_month"] == 6
    # extra/external keep one_time default
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "Refund", "amount": 100, "category": "extra",
              "date": "2026-06-15"},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "one_time", "non-primary should stay one_time"


def test_recurring_appears_in_every_future_month():
    tok, _ = _bootstrap("rec")
    r = requests.post(
        f"{API}/budget/income",
        json={
            "description": "Salary",
            "amount": 2168,
            "category": "primary",
            "type": "recurring",
            "start_year": 2026,
            "start_month": 6,
        },
        headers=_h(tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "recurring"
    assert body["start_year"] == 2026 and body["start_month"] == 6
    # Six future months all show the same amount
    for m in [6, 7, 8, 9, 10, 11]:
        assert _income_total(tok, 2026, m) == 2168, f"month {m} missing salary"
    # And it does NOT leak into months BEFORE start
    assert _income_total(tok, 2026, 5) == 0
    assert _income_total(tok, 2025, 12) == 0


def test_recurring_with_end_stops_after_end_month():
    tok, _ = _bootstrap("end")
    r = requests.post(
        f"{API}/budget/income",
        json={
            "description": "Contract",
            "amount": 1000,
            "category": "primary",
            "type": "recurring",
            "start_year": 2026, "start_month": 1,
            "end_year": 2026, "end_month": 3,
        },
        headers=_h(tok),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    # Active Jan, Feb, Mar
    for m in [1, 2, 3]:
        assert _income_total(tok, 2026, m) == 1000
    # Inactive Apr onwards
    assert _income_total(tok, 2026, 4) == 0
    assert _income_total(tok, 2026, 6) == 0


def test_edit_this_month_only_inserts_override():
    tok, _ = _bootstrap("ovr")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 1},
        headers=_h(tok), timeout=TIMEOUT,
    )
    income_id = r.json()["id"]
    # Change March only to 2500
    r = requests.put(
        f"{API}/budget/income/{income_id}",
        json={"amount": 2500, "edit_mode": "this_month", "year": 2026, "month": 3},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert _income_total(tok, 2026, 2) == 2000  # untouched
    assert _income_total(tok, 2026, 3) == 2500  # override applied
    assert _income_total(tok, 2026, 4) == 2000  # untouched


def test_edit_forward_splits_template():
    tok, _ = _bootstrap("fwd")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 1},
        headers=_h(tok), timeout=TIMEOUT,
    )
    income_id = r.json()["id"]
    # From May 2026 onwards salary becomes 2500
    r = requests.put(
        f"{API}/budget/income/{income_id}",
        json={"amount": 2500, "edit_mode": "forward", "year": 2026, "month": 5},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    # Original template now ends April 2026
    assert _income_total(tok, 2026, 1) == 2000
    assert _income_total(tok, 2026, 4) == 2000
    # New template active May onwards
    assert _income_total(tok, 2026, 5) == 2500
    assert _income_total(tok, 2026, 10) == 2500
    # No double-counting in May (would be 4500 if both templates fire)
    assert _income_total(tok, 2026, 5) != 4500


def test_edit_all_updates_template_amount():
    tok, _ = _bootstrap("all")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 1},
        headers=_h(tok), timeout=TIMEOUT,
    )
    income_id = r.json()["id"]
    r = requests.put(
        f"{API}/budget/income/{income_id}",
        json={"amount": 2300, "edit_mode": "all", "year": 2026, "month": 6},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    # Every month now reads 2300
    for m in [1, 5, 6, 12]:
        assert _income_total(tok, 2026, m) == 2300, f"month {m} not updated"


def test_delete_this_month_only_skips_that_month():
    tok, _ = _bootstrap("delm")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 1},
        headers=_h(tok), timeout=TIMEOUT,
    )
    income_id = r.json()["id"]
    r = requests.delete(
        f"{API}/budget/income/{income_id}",
        params={"delete_mode": "this_month", "year": 2026, "month": 7},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert _income_total(tok, 2026, 6) == 2000
    assert _income_total(tok, 2026, 7) == 0  # skipped
    assert _income_total(tok, 2026, 8) == 2000


def test_delete_forward_ends_template():
    tok, _ = _bootstrap("delf")
    r = requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 1},
        headers=_h(tok), timeout=TIMEOUT,
    )
    income_id = r.json()["id"]
    # Stop from August onwards
    r = requests.delete(
        f"{API}/budget/income/{income_id}",
        params={"delete_mode": "forward", "year": 2026, "month": 8},
        headers=_h(tok), timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    assert _income_total(tok, 2026, 7) == 2000
    assert _income_total(tok, 2026, 8) == 0
    assert _income_total(tok, 2026, 12) == 0


def test_summary_includes_recurring_income():
    tok, mid = _bootstrap("sum")
    requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 3000, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 6,
              "owner": mid},
        headers=_h(tok), timeout=TIMEOUT,
    )
    # Pick a forward month so recurring kicks in
    r = requests.get(f"{API}/budget/summary", params={"year": 2026, "month": 9},
                     headers=_h(tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["income_total"] == 3000, f"summary income wrong: {body}"
    assert body["by_owner"]["income"].get(mid) == 3000


def test_forecast_uses_recurring_template():
    tok, _ = _bootstrap("fcs")
    requests.post(
        f"{API}/budget/income",
        json={"description": "S", "amount": 2168, "category": "primary",
              "type": "recurring", "start_year": 2026, "start_month": 6},
        headers=_h(tok), timeout=TIMEOUT,
    )
    r = requests.get(f"{API}/budget/forecast", params={"year": 2027, "month": 1},
                     headers=_h(tok), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    body = r.json()
    forecast = body.get("forecast") or body
    assert forecast.get("year") == 2027 and forecast.get("month") == 1
    # Forecast should reflect the recurring template, not an averaged guess
    assert forecast["income_total"] == 2168, f"forecast not driven by recurring: {body}"
