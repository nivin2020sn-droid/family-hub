"""Bootstrap a fresh family + Alice member, dump tokens to /tmp/fam.json
so the Playwright UI test can load them into localStorage."""
import json, os, sys, time, uuid, requests
sys.path.insert(0, "/app/backend")
from tests.conftest import verify_account_email  # noqa

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE + "/api"
T = 20
email = f"priv-ui-{int(time.time())}-{uuid.uuid4().hex[:6]}@example.com"
pwd = "Pass1234!"

r = requests.post(f"{API}/auth/register", json={
    "email": email, "password": pwd, "confirm_password": pwd,
    "family_name": f"PrivUI-{int(time.time())}",
    "accepted_beta_terms": True, "accepted_privacy_policy": True,
    "accepted_disclaimer": True,
}, timeout=T)
assert r.ok, r.text
verify_account_email(email)
r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=T)
assert r.ok, r.text
login_data = r.json()
acc_tok = login_data["access_token"]

# Add Alice
r = requests.post(f"{API}/family/members",
    json={"name": "Alice", "pin": "1234", "is_family_admin": True, "role": "parent"},
    headers={"Authorization": f"Bearer {acc_tok}"}, timeout=T)
assert r.ok, r.text
alice = r.json()
# Select Alice
r = requests.post(f"{API}/auth/member/select",
    json={"member_id": alice["id"], "pin": "1234"},
    headers={"Authorization": f"Bearer {acc_tok}"}, timeout=T)
assert r.ok, r.text
sel = r.json()
out = {
    "BACKEND": BASE,
    "email": email,
    "account_token": acc_tok,
    "member_token": sel["member_token"],
    "account": login_data.get("account"),
    "family": login_data.get("family"),
    "member": sel.get("member"),
}
with open("/tmp/fam.json", "w") as f:
    json.dump(out, f, indent=2)
print("OK", email, alice["id"])
