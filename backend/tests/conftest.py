"""Shared pytest fixtures for the backend test suite."""

import os
import re
import time

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(autouse=True)
def _clear_smtp_between_tests():
    """Strip any leftover SMTP host from the DB before each test so the
    email-helper falls back to the dev-log path. Without this, a previous
    test that wrote `smtp.gmail.com` (or any non-resolvable host) would
    make every later test hang on a 10-second SMTP timeout."""
    try:
        admin = requests.post(
            f"{API}/auth/login",
            json={"email": "bsn.1988@hotmail.com", "password": "11qqQQ!!"},
            timeout=10,
        )
        if admin.status_code == 200:
            tok = admin.json()["access_token"]
            requests.put(
                f"{API}/admin/email-settings",
                headers={"Authorization": f"Bearer {tok}"},
                json={"smtp_host": "", "smtp_password": ""},
                timeout=5,
            )
    except Exception:  # noqa: BLE001
        # Don't fail the test just because the admin reset didn't work — the
        # individual test will surface a clearer error if it actually depends
        # on a clean SMTP state.
        pass
    yield


def read_email_token_from_logs(email: str, kind: str = "verify") -> str:
    """Read the dev-fallback link the email service prints when SMTP isn't
    configured. Used by tests so they don't need a real SMTP server.

    Polls a few times because log writes are async.
    """
    log_path = "/var/log/supervisor/backend.err.log"
    # Backend lowercases all emails on insert, so the log uses the lowered
    # form — compare lowercase to avoid case-mismatch misses.
    email = email.lower()
    # Match both the dev-log fallback AND the post-failure log. Either way
    # the verification link is printed verbatim with `link=...`.
    patterns = [
        rf"\[EMAIL DEV-LOG\] {re.escape(kind)} \| to={re.escape(email)} \| link=(\S+)",
        rf"\[EMAIL SEND FAILED\] {re.escape(kind)} \| to={re.escape(email)} .* link=(\S+)",
    ]
    for _ in range(20):
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except FileNotFoundError:
            content = ""
        for pat in patterns:
            matches = re.findall(pat, content)
            if matches:
                url = matches[-1]
                return url.split("token=")[1]
        time.sleep(0.3)
    raise AssertionError(f"No {kind} log entry found for {email}")


def verify_account_email(email: str) -> None:
    """Pull the verification token out of the backend log and POST it back
    so the account becomes `email_verified=true` and login is unlocked."""
    token = read_email_token_from_logs(email, "verify")
    r = requests.post(f"{API}/auth/verify-email", json={"token": token}, timeout=15)
    assert r.status_code == 200, r.text
