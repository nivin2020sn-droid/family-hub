"""Frontend activity strip test using direct Playwright (bypass wrapper)."""
import asyncio, json, time, uuid
import urllib.request, urllib.error
from playwright.async_api import async_playwright

BASE = "https://family-timeplan.preview.emergentagent.com"


def http(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


SEED_JS = """
(args) => {
  localStorage.setItem('mfml_account_token', args[0]);
  localStorage.setItem('mfml_member_token', args[1]);
  localStorage.setItem('mfml_account', JSON.stringify(args[2]));
  localStorage.setItem('mfml_family', JSON.stringify(args[3]));
  localStorage.setItem('mfml_member', JSON.stringify(args[4]));
  localStorage.setItem('mfml_auth_ok', 'true');
  localStorage.setItem('mfml_lang', 'en');
}
"""

READ_ITEMS_JS = """
() => {
  const s = document.querySelector('[data-testid="recent-activity-strip"]');
  if (!s) return null;
  return Array.from(s.querySelectorAll('[data-testid^="activity-item-"]')).map(li => [li.getAttribute('data-testid'), li.innerText.trim()]);
}
"""

LEAK_JS = """
() => {
  const s = document.querySelector('[data-testid="recent-activity-strip"]');
  return s ? s.innerText.indexOf('activity.') >= 0 : null;
}
"""

INSIDE_JS = """
() => {
  const w = document.querySelector('[data-testid="wall-member-strip"]');
  const a = document.querySelector('[data-testid="recent-activity-strip"]');
  return !!(w && a && w.contains(a));
}
"""

EMPTY_STRIP_JS = """
() => {
  return document.querySelector('[data-testid="recent-activity-strip"]') !== null
    || document.querySelector('[data-testid="recent-activity-loading"]') !== null;
}
"""


async def main():
    # Seed activity via REST
    email = "qa-fe-" + str(int(time.time() * 1000)) + "-" + uuid.uuid4().hex[:5] + "@example.com"
    sc, reg = http("POST", "/api/auth/register", body={
        "family_name": "TFE", "email": email,
        "password": "Pass1234!", "confirm_password": "Pass1234!"
    })
    print("register:", sc)
    assert sc == 200, reg
    account_token = reg["access_token"]
    family = reg["family"]
    account = reg["account"]
    sc, alice = http("POST", "/api/family/members", token=account_token,
                     body={"name": "Alice", "role": "parent", "pin": "1234"})
    sc, sel = http("POST", "/api/auth/member/select", token=account_token,
                   body={"member_id": alice["id"], "pin": "1234"})
    alice_tok = sel["member_token"]
    sc, kid = http("POST", "/api/family/members", token=alice_tok,
                   body={"name": "Suleiman", "role": "child", "pin": "3333"})
    sc, ev = http("POST", "/api/events", token=alice_tok,
                  body={"title": "Morning work", "color": "#7BC8A4", "date": "2026-01-22"})
    sc, rec = http("GET", "/api/activity/recent?scope=self&limit=3", token=alice_tok)
    print("seeded kinds:", [it["kind"] for it in rec.get("items", [])])

    results = {"languages": {}}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 2000})
        page = await ctx.new_page()

        await page.goto(BASE + "/")
        await page.wait_for_load_state("domcontentloaded")
        await page.evaluate(SEED_JS, [account_token, alice_tok, account, family, alice])

        # Also test zero-items: create a separate fresh family WITHOUT seeding
        # any activity → the strip must NOT be rendered.
        # We'll do that in a second pass below using fam_a's empty admin flow.

        for lang in ["en", "ar", "de"]:
            await page.evaluate("(l) => localStorage.setItem('mfml_lang', l)", lang)
            await page.goto(BASE + "/wall-board")
            try:
                await page.wait_for_selector('[data-testid="recent-activity-strip"]',
                                              timeout=15000)
                rendered = True
            except Exception as e:
                rendered = False
                print(f"[{lang}] STRIP MISSING: {e}")

            items = await page.evaluate(READ_ITEMS_JS) if rendered else None
            leak = await page.evaluate(LEAK_JS) if rendered else None
            inside = await page.evaluate(INSIDE_JS) if rendered else None
            results["languages"][lang] = {
                "rendered": rendered,
                "items": items,
                "leak_raw_key": leak,
                "inside_wall_member_strip": inside,
            }
            await page.screenshot(path=f"/app/test_reports/wallboard_{lang}.jpg",
                                  quality=40, type="jpeg", full_page=False,
                                  clip={"x": 0, "y": 0, "width": 1440, "height": 900})

        # ---- Zero-items: fresh family, no seeded events ----
        email2 = "qa-fe-empty-" + str(int(time.time() * 1000)) + "@example.com"
        sc, reg2 = http("POST", "/api/auth/register", body={
            "family_name": "TFE_E", "email": email2,
            "password": "Pass1234!", "confirm_password": "Pass1234!"
        })
        acc2 = reg2["access_token"]; fam2 = reg2["family"]; act2 = reg2["account"]
        sc, b = http("POST", "/api/family/members", token=acc2,
                     body={"name": "Solo", "role": "parent", "pin": "1234"})
        sc, sel2 = http("POST", "/api/auth/member/select", token=acc2,
                        body={"member_id": b["id"], "pin": "1234"})
        bt = sel2["member_token"]
        await page.evaluate(SEED_JS, [acc2, bt, act2, fam2, b])
        await page.evaluate("(l) => localStorage.setItem('mfml_lang', l)", "en")
        await page.goto(BASE + "/wall-board")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
        strip_present = await page.evaluate(EMPTY_STRIP_JS)
        results["empty_state_strip_or_loading_present"] = strip_present

        await browser.close()

    print("RESULTS:", json.dumps(results, ensure_ascii=False, indent=2))
    with open("/app/test_reports/fe_activity_result.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
