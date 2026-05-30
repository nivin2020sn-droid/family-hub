# Auth Testing Playbook — My Family My Life

Custom JWT auth for the multi-tenant family system. Two tokens are issued:
1. **Account token** — proves ownership of a family (issued by `/api/auth/login`).
2. **Member token** — proves which member is using the device (issued by
   `/api/auth/member/select`). Most family-level data endpoints later will
   require both via `Authorization: Bearer <member_token>`.

## Step 1 — DB sanity

```
mongosh
use test_database
db.families.find().pretty()
db.accounts.find({}, {password_hash: 0}).pretty()
db.family_members.find({}, {pin_hash: 0}).pretty()
db.recovery_codes.find().pretty()
```

Verify:
- bcrypt hash starts with `$2b$`
- index on `accounts.email` is unique
- TTL index on `recovery_codes.expires_at`

## Step 2 — End-to-end curl flow

```
API=http://localhost:8001/api

# Register a new family
curl -s -X POST $API/auth/register -H "Content-Type: application/json" -d '{
  "family_name": "Test Family",
  "email": "demo@example.com",
  "password": "Demo1234!",
  "confirm_password": "Demo1234!",
  "recovery_email": "recovery@example.com"
}'

# Login
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Demo1234!"}' | jq -r .access_token)

# Add a parent member with a PIN (only parents can add members)
curl -s -X POST $API/family/members -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Bahaa","role":"parent","pin":"1234"}'

# Select that member to obtain the member token
curl -s -X POST $API/auth/member/select -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"member_id":"<id from previous>","pin":"1234"}'

# Forgot password — code is logged to backend logs only.
curl -s -X POST $API/auth/forgot -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com"}'
```

## Step 3 — Admin

```
ADMIN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@myfamilymylife.app","password":"ChangeMe2026!"}' | jq -r .access_token)

curl -s $API/admin/families -H "Authorization: Bearer $ADMIN" | jq
```

Admin must **not** be able to see any family-internal data: budgets, locations,
photos, routines, messages. Admin only sees account-level metadata.
