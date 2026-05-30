"""Regression for dynamic budget wallet owners (no more bahaa/theresa hardcoding).

What the prior bug looked like:
- /api/budget/summary always returned by_owner.income/expense/... keyed by
  {"bahaa","theresa","shared"} regardless of who was in the family.
- The frontend rendered "Bahaa's Wallet" and "Theresa's Wallet" for *every*
  family, even when the actual members were named differently.

What this test asserts:
- A freshly registered family with one parent "Hds" gets one wallet keyed by
  the actual member_id, plus "shared".
- Adding income with owner=<member_id> attributes the amount to that member
  in the summary's by_owner.income breakdown.
- wallet_owners[] in the summary returns the member's actual name + color.
- A second family is fully isolated: its wallet_owners do not contain Hds.
"""

import os
import time
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _register(suffix=""):
    ts = f"{int(time.time()*1000)}{suffix}"
    payload = {
        "family_name": f"Owner Test {ts}",
        "email": f"owner-{ts}@example.com",
        "password": "Pass1234!",
        "confirm_password": "Pass1234!",
        "accepted_beta_terms": True,
        "accepted_privacy_policy": True,
        "accepted_disclaimer": True,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _add_member(acc_token, name, pin="1234"):
    r = requests.post(
        f"{API}/family/members",
        headers={"Authorization": f"Bearer {acc_token}"},
        json={"name": name, "role": "parent", "pin": pin},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _member_token(acc_token, member_id, pin="1234"):
    r = requests.post(
        f"{API}/auth/member/select",
        headers={"Authorization": f"Bearer {acc_token}"},
        json={"member_id": member_id, "pin": pin},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["member_token"]


def test_dynamic_wallet_owners_per_family():
    # Family 1: Hds
    acc1 = _register("-a")
    hds = _add_member(acc1, "Hds")
    tok1 = _member_token(acc1, hds["id"])

    today = time.strftime("%Y-%m-%d")
    r = requests.post(
        f"{API}/budget/income",
        headers={"Authorization": f"Bearer {tok1}"},
        json={
            "description": "Salary",
            "amount": 3000,
            "category": "primary",
            "owner": hds["id"],
            "date": today,
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text

    summary = requests.get(
        f"{API}/budget/summary",
        headers={"Authorization": f"Bearer {tok1}"},
        timeout=10,
    ).json()

    # No legacy keys, only member_id + shared.
    income_keys = set(summary["by_owner"]["income"].keys())
    assert hds["id"] in income_keys
    assert "shared" in income_keys
    assert "bahaa" not in income_keys
    assert "theresa" not in income_keys

    # Amount attributed to actual member id.
    assert summary["by_owner"]["income"][hds["id"]] == 3000.0
    assert summary["income_total"] == 3000.0

    # wallet_owners carries the real name + a color.
    names = [w["name"] for w in summary["wallet_owners"]]
    assert names == ["Hds"]
    assert summary["wallet_owners"][0]["color"].startswith("#")
    assert summary["wallet_owners"][0]["id"] == hds["id"]

    # Family 2: Sara — fully isolated.
    acc2 = _register("-b")
    sara = _add_member(acc2, "Sara")
    tok2 = _member_token(acc2, sara["id"])

    summary2 = requests.get(
        f"{API}/budget/summary",
        headers={"Authorization": f"Bearer {tok2}"},
        timeout=10,
    ).json()

    names2 = [w["name"] for w in summary2["wallet_owners"]]
    assert names2 == ["Sara"], f"Expected only Sara, got {names2}"
    assert summary2["income_total"] == 0.0
    assert sara["id"] in summary2["by_owner"]["income"]
    assert hds["id"] not in summary2["by_owner"]["income"]


def test_two_members_each_get_their_own_wallet():
    acc = _register("-c")
    a = _add_member(acc, "Alice")
    tok = _member_token(acc, a["id"])
    # Second member added via member token (admin already bootstrapped).
    r = requests.post(
        f"{API}/family/members",
        headers={"Authorization": f"Bearer {tok}"},
        json={"name": "Bob", "role": "parent", "pin": "5678"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    b = r.json()

    today = time.strftime("%Y-%m-%d")
    for owner_id, amt in ((a["id"], 1000), (b["id"], 500), ("shared", 200)):
        rr = requests.post(
            f"{API}/budget/income",
            headers={"Authorization": f"Bearer {tok}"},
            json={
                "description": "x",
                "amount": amt,
                "category": "primary",
                "owner": owner_id,
                "date": today,
            },
            timeout=10,
        )
        assert rr.status_code == 200, rr.text

    summary = requests.get(
        f"{API}/budget/summary",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=10,
    ).json()

    by_owner = summary["by_owner"]["income"]
    assert by_owner[a["id"]] == 1000.0
    assert by_owner[b["id"]] == 500.0
    assert by_owner["shared"] == 200.0
    assert summary["income_total"] == 1700.0

    names = sorted(w["name"] for w in summary["wallet_owners"])
    assert names == ["Alice", "Bob"]
