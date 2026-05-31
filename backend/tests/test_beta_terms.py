"""Backend tests for the Beta Terms gate at registration."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://family-timeplan.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _email(tag: str) -> str:
    return f"qa-beta-{tag}-{int(time.time()*1000)}@example.com"


# /api/auth/app/info
class TestAppInfo:
    def test_app_info_shape(self):
        r = requests.get(f"{API}/auth/app/info", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("name") == "My Life My Time"
        assert d.get("version") == "0.9.0-beta"
        assert d.get("stage") == "beta"


# /api/auth/register consent enforcement
class TestRegisterConsents:
    def _payload(self, email, **flags):
        return {
            "family_name": "TEST_Beta_Family",
            "email": email,
            "password": "Pass1234!",
            "confirm_password": "Pass1234!",
            "accepted_beta_terms": flags.get("t", False),
            "accepted_privacy_policy": flags.get("p", False),
            "accepted_disclaimer": flags.get("d", False),
        }

    def test_register_no_consents(self):
        r = requests.post(f"{API}/auth/register", json=self._payload(_email("none")), timeout=15)
        assert r.status_code == 400
        assert "Beta Terms" in r.json().get("detail", "")

    def test_register_two_consents(self):
        r = requests.post(
            f"{API}/auth/register",
            json=self._payload(_email("two"), t=True, p=True, d=False),
            timeout=15,
        )
        assert r.status_code == 400
        assert "Beta Terms" in r.json().get("detail", "")

    def test_register_only_privacy(self):
        r = requests.post(
            f"{API}/auth/register",
            json=self._payload(_email("priv"), t=False, p=True, d=False),
            timeout=15,
        )
        assert r.status_code == 400

    def test_register_all_three_consents_succeeds(self):
        from tests.conftest import verify_account_email
        email = _email("ok")
        r = requests.post(
            f"{API}/auth/register",
            json=self._payload(email, t=True, p=True, d=True),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # New flow: register no longer returns tokens — it returns the
        # "verification_sent" envelope. The audit trail still lives on the
        # account; verify post-login.
        assert body.get("verification_sent") is True
        assert body.get("email") == email.lower()
        # Verify the email then login — should succeed without re-prompting for consents
        verify_account_email(email.lower())
        login = requests.post(
            f"{API}/auth/login",
            json={"email": email, "password": "Pass1234!"},
            timeout=15,
        )
        assert login.status_code == 200, login.text
        assert "access_token" in login.json()


# Consents persisted on accounts doc — verified via login (no migration break)
class TestExistingAccountLogin:
    def test_admin_login_no_consent_field(self):
        # The seeded admin account has no consents field but must still log in.
        r = requests.post(
            f"{API}/auth/login",
            json={"email": "bsn.1988@hotmail.com", "password": "11qqQQ!!"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["account"]["role"] == "admin"
