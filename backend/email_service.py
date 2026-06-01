"""SMTP email sender + localized templates for My Life My Time.

The admin configures SMTP credentials in the `email_settings` singleton
collection (Admin → Email Settings). When SMTP is not yet configured the
helpers log the message + link instead of failing, so developers can see
the verification/reset link in `/var/log/supervisor/backend.err.log`.

Templates are stored in this module (one dict per language) to keep
translations close to the rendering code. Subject + plain-text body +
HTML body are produced for every supported locale (EN / AR / DE).
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger("mfml.email")


# -------- Localized templates --------

BRAND_NAME = "My Life My Time"
BRAND_URL = "https://mylife-mytime.com"
# Two-letter wordmark used for the circular badge at the top of every email.
# Three letters keep it readable even at 64px on mobile and degrade
# gracefully in clients that drop border-radius (Outlook 2016).
BRAND_MONOGRAM = "MLT"

VERIFY_TEMPLATES = {
    "en": {
        "subject": f"Verify your {BRAND_NAME} email",
        "subtitle": "Your family's digital hub",
        "greeting": "Hello {name},",
        "intro": (
            "Thank you for creating your family account. Please verify your "
            "email address to activate all features. The link is valid for "
            "24 hours."
        ),
        "cta": "Verify my email",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "footer": (
            f"You received this email because you signed up at {BRAND_NAME}. "
            "If this was not you, simply ignore this message."
        ),
        "regards": f"— The {BRAND_NAME} team",
        "footer_legal": f"© {BRAND_NAME}. All rights reserved.",
    },
    "ar": {
        "subject": f"تأكيد بريدك الإلكتروني في {BRAND_NAME}",
        "subtitle": "المركز الرقمي لعائلتك",
        "greeting": "مرحباً {name}،",
        "intro": (
            "شكراً لإنشائك حساب عائلتك. يُرجى تأكيد بريدك الإلكتروني لتفعيل "
            "جميع الميزات. الرابط صالح لمدة 24 ساعة."
        ),
        "cta": "تأكيد بريدي",
        "fallback": "إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:",
        "footer": (
            f"تلقّيت هذه الرسالة لأنك سجّلت في {BRAND_NAME}. إن لم تكن أنت، "
            "تجاهل هذه الرسالة."
        ),
        "regards": f"— فريق {BRAND_NAME}",
        "footer_legal": f"© {BRAND_NAME}. جميع الحقوق محفوظة.",
    },
    "de": {
        "subject": f"Bestätige deine {BRAND_NAME}-E-Mail",
        "subtitle": "Die digitale Zentrale deiner Familie",
        "greeting": "Hallo {name},",
        "intro": (
            "Vielen Dank, dass du dein Familienkonto erstellt hast. Bitte "
            "bestätige deine E-Mail-Adresse, um alle Funktionen zu aktivieren. "
            "Der Link ist 24 Stunden gültig."
        ),
        "cta": "E-Mail bestätigen",
        "fallback": "Wenn der Button nicht funktioniert, kopiere diesen Link in den Browser:",
        "footer": (
            f"Du erhältst diese E-Mail, weil du dich bei {BRAND_NAME} registriert "
            "hast. Falls nicht: einfach ignorieren."
        ),
        "regards": f"— Das {BRAND_NAME} Team",
        "footer_legal": f"© {BRAND_NAME}. Alle Rechte vorbehalten.",
    },
}

RESET_TEMPLATES = {
    "en": {
        "subject": f"Reset your {BRAND_NAME} password",
        "subtitle": "Your family's digital hub",
        "greeting": "Hello {name},",
        "intro": (
            "We received a request to reset your password. Tap the button "
            "below to choose a new one. The link is valid for 30 minutes."
        ),
        "cta": "Reset my password",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "footer": (
            "If you did not ask for a password reset, you can safely ignore "
            "this email — your password will not change."
        ),
        "regards": f"— The {BRAND_NAME} team",
        "footer_legal": f"© {BRAND_NAME}. All rights reserved.",
    },
    "ar": {
        "subject": f"إعادة تعيين كلمة المرور في {BRAND_NAME}",
        "subtitle": "المركز الرقمي لعائلتك",
        "greeting": "مرحباً {name}،",
        "intro": (
            "وصلنا طلب لإعادة تعيين كلمة المرور. اضغط الزر أدناه لاختيار كلمة "
            "مرور جديدة. الرابط صالح لمدة 30 دقيقة."
        ),
        "cta": "إعادة تعيين كلمة المرور",
        "fallback": "إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:",
        "footer": (
            "إن لم تكن أنت من طلب إعادة التعيين، يمكنك تجاهل هذه الرسالة — لن "
            "تتغير كلمة المرور."
        ),
        "regards": f"— فريق {BRAND_NAME}",
        "footer_legal": f"© {BRAND_NAME}. جميع الحقوق محفوظة.",
    },
    "de": {
        "subject": f"Passwort für {BRAND_NAME} zurücksetzen",
        "subtitle": "Die digitale Zentrale deiner Familie",
        "greeting": "Hallo {name},",
        "intro": (
            "Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. "
            "Tippe auf den Button, um ein neues Passwort zu wählen. Der Link "
            "ist 30 Minuten gültig."
        ),
        "cta": "Passwort zurücksetzen",
        "fallback": "Wenn der Button nicht funktioniert, kopiere diesen Link in den Browser:",
        "footer": (
            "Falls du keine Anfrage gestellt hast, kannst du diese E-Mail "
            "ignorieren — dein Passwort bleibt unverändert."
        ),
        "regards": f"— Das {BRAND_NAME} Team",
        "footer_legal": f"© {BRAND_NAME}. Alle Rechte vorbehalten.",
    },
}


def _normalize_lang(lang: Optional[str]) -> str:
    code = (lang or "en").lower().strip()[:2]
    return code if code in {"en", "ar", "de"} else "en"


def _render_html(tpl: dict, link: str, lang: str) -> str:
    """Render a brand-aligned HTML email — circular logo badge, soft warm
    palette, white card with rounded corners, prominent CTA, fallback link
    box, and a legal footer. Built with table-based layout + inline CSS
    only so Outlook 2016 / Gmail / Apple Mail all render it consistently.

    `tpl` must define: subject, subtitle, greeting, intro, cta, fallback,
    footer, regards, footer_legal."""
    dir_attr = "rtl" if lang == "ar" else "ltr"
    align = "right" if lang == "ar" else "left"
    # Slightly heavier font weight on Latin scripts; AR/DE use the same
    # system stack so the email looks native in every locale.
    return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="{lang}" dir="{dir_attr}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{tpl['subject']}</title>
</head>
<body style="margin:0;padding:0;background:#F3F0EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#2D2A26;">
  <!-- Preheader (hidden, sets the inbox preview snippet) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">{tpl['subtitle']}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F0EA;">
    <tr>
      <td align="center" style="padding:40px 16px 32px 16px;">

        <!-- ─── Brand header (circular badge + name + subtitle) ─────────── -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px auto;">
          <tr>
            <td align="center" style="padding-bottom:14px;">
              <!-- Circular monogram badge. Falls back to a square in clients
                   that drop border-radius — still readable. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" valign="middle" width="72" height="72" bgcolor="#2D2A26"
                      style="background:#2D2A26;border-radius:36px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:0.08em;line-height:72px;width:72px;height:72px;">
                    {BRAND_MONOGRAM}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:20px;font-weight:600;color:#2D2A26;letter-spacing:-0.01em;line-height:1.2;">
              {BRAND_NAME}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#7A7571;letter-spacing:0.08em;text-transform:uppercase;">
              {tpl['subtitle']}
            </td>
          </tr>
        </table>

        <!-- ─── White card ──────────────────────────────────────────────── -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:24px;border:1px solid #E5E2DC;">
          <tr>
            <td style="padding:36px 36px 28px 36px;text-align:{align};">
              <p style="margin:0 0 12px 0;font-size:16px;font-weight:500;color:#2D2A26;line-height:1.4;">
                {tpl['greeting']}
              </p>
              <p style="margin:0 0 28px 0;font-size:14px;line-height:1.7;color:#4A4742;">
                {tpl['intro']}
              </p>

              <!-- ─── CTA button ─────────────────────────────────────── -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="#2D2A26" style="background:#2D2A26;border-radius:999px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                                 href="{link}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="100%" stroke="f" fillcolor="#2D2A26">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.02em;">{tpl['cta']}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="{link}" target="_blank"
                       style="display:inline-block;padding:14px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;border-radius:999px;line-height:1;">
                      {tpl['cta']}
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- ─── Fallback link box ──────────────────────────────── -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
                <tr>
                  <td style="padding:16px 18px;background:#FAF9F6;border-radius:14px;border:1px solid #EFEBE4;text-align:{align};">
                    <p style="margin:0 0 8px 0;font-size:11px;color:#7A7571;line-height:1.5;">
                      {tpl['fallback']}
                    </p>
                    <a href="{link}" target="_blank" style="font-size:11px;color:#2D2A26;text-decoration:underline;word-break:break-all;line-height:1.6;">{link}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- ─── Footer (security note + sign-off + © legal) ─────────────── -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#A09B95;line-height:1.6;">
              <p style="margin:0 0 8px 0;">{tpl['footer']}</p>
              <p style="margin:0 0 14px 0;">{tpl['regards']}</p>
              <p style="margin:0;padding-top:14px;border-top:1px solid #E5E2DC;font-size:10px;color:#A09B95;letter-spacing:0.02em;">
                {tpl['footer_legal']}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>"""


def _render_text(tpl: dict, link: str) -> str:
    """Plain-text fallback shown by clients that don't render HTML. Kept
    deliberately short so it doesn't trip spam scoring."""
    return (
        f"{BRAND_NAME}\n"
        f"{tpl['subtitle']}\n\n"
        f"{tpl['greeting']}\n\n"
        f"{tpl['intro']}\n\n"
        f"{tpl['cta']}: {link}\n\n"
        f"{tpl['fallback']}\n{link}\n\n"
        f"{tpl['footer']}\n{tpl['regards']}\n\n"
        f"{tpl['footer_legal']}\n"
    )


# ----- Broadcast (Admin Email Center) -----

BROADCAST_FOOTER_BY_LANG = {
    "en": {
        "tagline": "Connecting Families, Simplifying Life",
        "team": f"{BRAND_NAME} Team",
        "legal": f"© {BRAND_NAME}. All rights reserved.",
        "subtitle": "Your family's digital hub",
    },
    "ar": {
        "tagline": "نربط العائلات ونُبسّط الحياة",
        "team": f"فريق {BRAND_NAME}",
        "legal": f"© {BRAND_NAME}. جميع الحقوق محفوظة.",
        "subtitle": "المركز الرقمي لعائلتك",
    },
    "de": {
        "tagline": "Familien verbinden, das Leben vereinfachen",
        "team": f"{BRAND_NAME} Team",
        "legal": f"© {BRAND_NAME}. Alle Rechte vorbehalten.",
        "subtitle": "Die digitale Zentrale deiner Familie",
    },
}


def _escape_html(text: str) -> str:
    """Minimal HTML-escape for admin-provided body text. We intentionally do
    NOT allow arbitrary HTML from the admin form so a typo can't break the
    template — newlines are converted to <br>, hyperlinks are kept as
    plain-text URLs (clients auto-link them)."""
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_broadcast_html(subject: str, body: str, lang: str = "en") -> str:
    """Render a branded broadcast email — same visual language as the
    verify/reset templates, but without the CTA button. The body is the
    admin's free-text message, displayed as a series of paragraphs."""
    lang = _normalize_lang(lang)
    footer = BROADCAST_FOOTER_BY_LANG[lang]
    dir_attr = "rtl" if lang == "ar" else "ltr"
    align = "right" if lang == "ar" else "left"
    # Split admin text into paragraphs. Two newlines = paragraph break,
    # single newlines render as <br/> inside the same paragraph so the
    # admin can compose short signatures naturally.
    paragraphs = [p.strip() for p in (body or "").split("\n\n") if p.strip()]
    body_html_parts = []
    for p in paragraphs:
        escaped = _escape_html(p).replace("\n", "<br/>")
        body_html_parts.append(
            f'<p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:#4A4742;">{escaped}</p>'
        )
    body_html = "".join(body_html_parts) or (
        '<p style="margin:0;font-size:14px;color:#A09B95;font-style:italic;">'
        '(empty message)</p>'
    )
    safe_subject = _escape_html(subject or BRAND_NAME)
    site_url = "https://mylife-mytime.com"
    return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="{lang}" dir="{dir_attr}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{safe_subject}</title>
</head>
<body style="margin:0;padding:0;background:#F3F0EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#2D2A26;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">{safe_subject}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F0EA;">
    <tr>
      <td align="center" style="padding:40px 16px 32px 16px;">

        <!-- Brand header -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px auto;">
          <tr>
            <td align="center" style="padding-bottom:14px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" valign="middle" width="72" height="72" bgcolor="#2D2A26"
                      style="background:#2D2A26;border-radius:36px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:0.08em;line-height:72px;width:72px;height:72px;">
                    {BRAND_MONOGRAM}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="font-size:20px;font-weight:600;color:#2D2A26;letter-spacing:-0.01em;line-height:1.2;">
              {BRAND_NAME}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:4px;font-size:11px;color:#7A7571;letter-spacing:0.08em;text-transform:uppercase;">
              {footer['subtitle']}
            </td>
          </tr>
        </table>

        <!-- White card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:24px;border:1px solid #E5E2DC;">
          <tr>
            <td style="padding:36px 36px 28px 36px;text-align:{align};">
              <h1 style="margin:0 0 18px 0;font-size:20px;font-weight:600;color:#2D2A26;line-height:1.3;">{safe_subject}</h1>
              {body_html}
            </td>
          </tr>
        </table>

        <!-- Footer block (team + tagline + url + legal) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;font-size:11px;color:#A09B95;line-height:1.7;">
              <p style="margin:0;font-weight:600;color:#2D2A26;">{footer['team']}</p>
              <p style="margin:2px 0 0 0;font-style:italic;color:#7A7571;">{footer['tagline']}</p>
              <p style="margin:8px 0 0 0;"><a href="{site_url}" style="color:#7A7571;text-decoration:underline;">{site_url}</a></p>
              <p style="margin:0;padding-top:14px;margin-top:14px;border-top:1px solid #E5E2DC;font-size:10px;color:#A09B95;letter-spacing:0.02em;">
                {footer['legal']}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>"""


def render_broadcast_text(subject: str, body: str, lang: str = "en") -> str:
    """Plain-text fallback for broadcasts."""
    lang = _normalize_lang(lang)
    footer = BROADCAST_FOOTER_BY_LANG[lang]
    return (
        f"{BRAND_NAME}\n{footer['subtitle']}\n\n"
        f"{subject or ''}\n"
        f"{'-' * len(subject or '')}\n\n"
        f"{body or ''}\n\n"
        f"{footer['team']}\n"
        f"{footer['tagline']}\n"
        f"https://mylife-mytime.com\n\n"
        f"{footer['legal']}\n"
    )


async def send_broadcast_email(
    db,
    *,
    to_email: str,
    subject: str,
    body: str,
    lang: str = "en",
) -> dict:
    """Send a single rendered broadcast email. Used by the Admin Email
    Center; wraps the existing SMTP layer so error classification + per-step
    timing logs are reused unchanged."""
    import asyncio

    settings = await db.email_settings.find_one({"_key": "global"}, {"_id": 0}) or {}
    html_body = render_broadcast_html(subject, body, lang)
    text_body = render_broadcast_text(subject, body, lang)

    if not settings.get("smtp_host") or not settings.get("sender_email"):
        logger.warning(
            "[BROADCAST DEV-LOG] to=%s | subject=%s | (SMTP not configured)",
            to_email, subject,
        )
        return {"sent": False, "reason": "smtp_not_configured"}

    try:
        loop = asyncio.get_event_loop()
        send_info = await loop.run_in_executor(
            None,
            _smtp_send,
            settings, to_email, subject, text_body, html_body,
        )
        logger.info("[BROADCAST SENT] to=%s | subject=%s", to_email, subject)
        return {
            "sent": True,
            "to": to_email,
            "step_durations": (send_info or {}).get("step_durations"),
        }
    except SmtpDeliveryError as exc:
        logger.warning(
            "[BROADCAST FAILED] to=%s | stage=%s | reason=%s | err=%s",
            to_email, exc.stage, exc.reason, exc.message,
        )
        return {
            "sent": False,
            "reason": exc.reason,
            "stage": exc.stage,
            "error": exc.message,
            "smtp_code": exc.smtp_code,
            "smtp_message": exc.smtp_message,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[BROADCAST FAILED] to=%s | reason=unknown | err=%s",
            to_email, exc, exc_info=True,
        )
        return {"sent": False, "reason": "unknown", "error": str(exc)}


# -------- SMTP send --------

class EmailNotConfigured(Exception):
    """Raised when no usable SMTP settings exist. Caller decides what to do
    (typically: log the link and continue)."""


class SmtpDeliveryError(Exception):
    """Wraps a low-level smtplib failure with a classification so the admin
    UI can show a precise reason (auth / tls / connection / recipient /
    timeout / unknown) and a localizable hint."""

    def __init__(self, *, reason: str, stage: str, message: str,
                 smtp_code: Optional[int] = None,
                 smtp_message: Optional[str] = None,
                 hint_key: Optional[str] = None,
                 step_durations: Optional[dict] = None):
        self.reason = reason
        self.stage = stage
        self.message = message
        self.smtp_code = smtp_code
        self.smtp_message = smtp_message
        self.hint_key = hint_key
        # Mapping of step → seconds, populated by `_smtp_send` so the admin
        # can see exactly which phase consumed the budget when a timeout
        # fires.
        self.step_durations: dict = step_durations or {}
        super().__init__(message)


def _classify_smtp_error(exc: BaseException, stage: str) -> SmtpDeliveryError:
    """Translate a raw smtplib / socket / ssl exception into a structured
    SmtpDeliveryError. Keeps the original message for the audit log while
    giving the admin a concrete reason + hint to act on."""
    import socket as _socket

    # smtplib exceptions carry SMTP server response codes for the auth/
    # protocol failure paths. We surface them so the admin can match the
    # error against their provider docs (e.g., "535 5.7.8 authentication
    # failed" → Gmail App Password).
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return SmtpDeliveryError(
            reason="auth_failed", stage="login",
            message=str(exc),
            smtp_code=exc.smtp_code,
            smtp_message=exc.smtp_error.decode("utf-8", errors="replace")
                if isinstance(exc.smtp_error, (bytes, bytearray)) else str(exc.smtp_error),
            hint_key="hint.auth",
        )
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return SmtpDeliveryError(
            reason="tls_not_supported", stage="starttls",
            message=str(exc), hint_key="hint.tls",
        )
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return SmtpDeliveryError(
            reason="sender_refused", stage="send",
            message=str(exc),
            smtp_code=exc.smtp_code,
            smtp_message=exc.smtp_error.decode("utf-8", errors="replace")
                if isinstance(exc.smtp_error, (bytes, bytearray)) else str(exc.smtp_error),
            hint_key="hint.sender",
        )
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        # `recipients` is a dict of {addr: (code, msg)}.
        first = next(iter(exc.recipients.values()), (None, b""))
        return SmtpDeliveryError(
            reason="recipient_refused", stage="send",
            message=str(exc),
            smtp_code=first[0],
            smtp_message=first[1].decode("utf-8", errors="replace")
                if isinstance(first[1], (bytes, bytearray)) else str(first[1]),
            hint_key="hint.recipient",
        )
    if isinstance(exc, smtplib.SMTPHeloError):
        return SmtpDeliveryError(
            reason="helo_failed", stage="connect",
            message=str(exc),
            smtp_code=exc.smtp_code,
            smtp_message=exc.smtp_error.decode("utf-8", errors="replace")
                if isinstance(exc.smtp_error, (bytes, bytearray)) else str(exc.smtp_error),
            hint_key="hint.helo",
        )
    if isinstance(exc, smtplib.SMTPServerDisconnected):
        return SmtpDeliveryError(
            reason="server_disconnected", stage=stage,
            message=str(exc) or "Server unexpectedly disconnected",
            hint_key="hint.disconnect",
        )
    if isinstance(exc, smtplib.SMTPConnectError):
        return SmtpDeliveryError(
            reason="connection_refused", stage="connect",
            message=str(exc),
            smtp_code=exc.smtp_code,
            smtp_message=exc.smtp_error.decode("utf-8", errors="replace")
                if isinstance(exc.smtp_error, (bytes, bytearray)) else str(exc.smtp_error),
            hint_key="hint.connection",
        )
    if isinstance(exc, ssl.SSLError):
        return SmtpDeliveryError(
            reason="tls_failed", stage="starttls",
            message=str(exc), hint_key="hint.tls",
        )
    if isinstance(exc, _socket.gaierror):
        return SmtpDeliveryError(
            reason="host_unknown", stage="connect",
            message=str(exc), hint_key="hint.host",
        )
    if isinstance(exc, _socket.timeout) or isinstance(exc, TimeoutError):
        return SmtpDeliveryError(
            reason="timeout", stage=stage,
            message=str(exc) or "Connection timed out",
            hint_key="hint.timeout",
        )
    if isinstance(exc, ConnectionRefusedError):
        return SmtpDeliveryError(
            reason="connection_refused", stage="connect",
            message=str(exc), hint_key="hint.connection",
        )
    # IMPORTANT: SMTPException inherits from OSError in stdlib, so this
    # branch must run BEFORE the OSError catch-all below — otherwise every
    # protocol-level SMTP error degrades to "network_error".
    if isinstance(exc, smtplib.SMTPException):
        return SmtpDeliveryError(
            reason="smtp_error", stage=stage,
            message=str(exc), hint_key=None,
        )
    if isinstance(exc, OSError):
        # Catch-all for low-level socket errors not covered above.
        return SmtpDeliveryError(
            reason="network_error", stage="connect",
            message=str(exc), hint_key="hint.connection",
        )
    return SmtpDeliveryError(
        reason="unknown", stage=stage,
        message=f"{type(exc).__name__}: {exc}",
        hint_key=None,
    )


def _log_runtime_config(label: str, settings: dict, sender_email: str = "", sender_name: str = "") -> None:
    """Print the EXACT values the SMTP code is about to use. We log BEFORE
    the connection attempt so a timeout/disconnection can't swallow these.
    SMTP password is intentionally masked to its set/empty state — never the
    actual secret."""
    host = (settings.get("smtp_host") or "").strip()
    port = int(settings.get("smtp_port") or 587)
    username = (settings.get("smtp_username") or "").strip()
    use_tls_flag = bool(settings.get("use_tls", True))
    timeout_s = max(5, int(settings.get("smtp_timeout_seconds") or 60))
    # `use_tls` toggles STARTTLS on standard ports; port 465 implies SSL
    # tunnel regardless of the use_tls flag.
    use_starttls = (port != 465) and use_tls_flag
    use_ssl = (port == 465)
    pw_state = "(set)" if settings.get("smtp_password") else "(empty)"
    logger.warning(
        "[SMTP RUNTIME CONFIG] %s | SMTP_HOST=%r | SMTP_PORT=%d | "
        "SMTP_USERNAME=%r | USE_STARTTLS=%s | USE_SSL=%s | "
        "SMTP_PASSWORD=%s | SENDER_EMAIL=%r | SENDER_NAME=%r | "
        "TIMEOUT=%ds",
        label, host, port, username, use_starttls, use_ssl,
        pw_state, sender_email, sender_name, timeout_s,
    )


def _smtp_send(
    settings: dict,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> dict:
    """Synchronous SMTP send used inside `run_in_executor` to keep the event
    loop free. Tracks per-step timing (DNS lookup, TCP connect, STARTTLS,
    AUTH, send) and either returns the timings on success or raises
    `SmtpDeliveryError` carrying the timings + the stage where it broke.

    The user-tunable timeout knob is `smtp_timeout_seconds` in `email_settings`
    (default 60s). This is the per-socket-op timeout — STARTTLS handshake,
    DNS, and AUTH each get their own budget."""
    import socket as _socket
    import time as _time

    host = (settings.get("smtp_host") or "").strip()
    port = int(settings.get("smtp_port") or 587)
    username = (settings.get("smtp_username") or "").strip()
    password = settings.get("smtp_password") or ""
    use_tls = bool(settings.get("use_tls", True))
    sender_email = (settings.get("sender_email") or username or "").strip()
    sender_name = (settings.get("sender_name") or BRAND_NAME).strip()
    # Per-step socket timeout in seconds. Generous default so slow EU
    # servers like IONOS get a real chance to respond.
    timeout_s = max(5, int(settings.get("smtp_timeout_seconds") or 60))

    if not host or not sender_email:
        raise EmailNotConfigured("SMTP host or sender_email missing")

    # Print the EXACT runtime values BEFORE any network call — guarantees the
    # admin can see them in Render's log stream even if the connect blocks
    # for the full timeout.
    _log_runtime_config("send", settings, sender_email=sender_email, sender_name=sender_name)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    stage = "dns"
    durations: dict = {}

    def _mark(step: str, t0: float) -> None:
        durations[step] = round(_time.perf_counter() - t0, 3)

    try:
        # ---- 1. DNS lookup (explicit, so we can attribute the latency) ----
        t_dns = _time.perf_counter()
        try:
            resolved = _socket.getaddrinfo(host, port, proto=_socket.IPPROTO_TCP)
            resolved_ip = resolved[0][4][0] if resolved else None
        finally:
            _mark("dns", t_dns)
        logger.info(
            "[SMTP STEP] dns_ok host=%s -> %s | %.3fs",
            host, resolved_ip, durations.get("dns", -1),
        )

        # ---- 2. TCP connect + EHLO ----
        stage = "connect"
        t_connect = _time.perf_counter()
        if port == 465:
            s = smtplib.SMTP_SSL(host, port, context=context, timeout=timeout_s)
        else:
            s = smtplib.SMTP(host, port, timeout=timeout_s)
            s.ehlo()
        _mark("connect", t_connect)
        logger.info("[SMTP STEP] connect_ok | %.3fs", durations.get("connect", -1))

        try:
            # ---- 3. STARTTLS (skip for port 465 — already wrapped in TLS) ----
            if port != 465 and use_tls:
                stage = "starttls"
                t_tls = _time.perf_counter()
                s.starttls(context=context)
                s.ehlo()
                _mark("starttls", t_tls)
                logger.info(
                    "[SMTP STEP] starttls_ok | %.3fs",
                    durations.get("starttls", -1),
                )

            # ---- 4. AUTH ----
            if username:
                stage = "login"
                t_login = _time.perf_counter()
                s.login(username, password)
                _mark("login", t_login)
                logger.info(
                    "[SMTP STEP] login_ok user=%s | %.3fs",
                    username, durations.get("login", -1),
                )

            # ---- 5. Send the message ----
            stage = "send"
            t_send = _time.perf_counter()
            s.send_message(msg)
            _mark("send", t_send)
            logger.info("[SMTP STEP] send_ok | %.3fs", durations.get("send", -1))
        finally:
            try:
                s.quit()
            except Exception:  # noqa: BLE001
                pass

        return {"step_durations": durations, "resolved_ip": resolved_ip}
    except SmtpDeliveryError:
        raise
    except BaseException as exc:  # noqa: BLE001
        err = _classify_smtp_error(exc, stage)
        err.step_durations = durations
        raise err from exc


def _smtp_connectivity_check(settings: dict) -> dict:
    """Quick "can the backend even reach this host" probe — does DNS + TCP
    connect (no STARTTLS / no AUTH). Used by the Admin → Email Settings
    page when the user clicks "Test connectivity" to differentiate between
    network reachability problems and credential problems."""
    import socket as _socket
    import time as _time

    host = (settings.get("smtp_host") or "").strip()
    port = int(settings.get("smtp_port") or 587)
    timeout_s = max(5, int(settings.get("smtp_timeout_seconds") or 60))

    if not host:
        raise EmailNotConfigured("SMTP host missing")

    # Print the EXACT runtime values BEFORE any network call so the admin
    # can confirm what the Backend is about to dial.
    _log_runtime_config("connectivity", settings)

    durations: dict = {}
    stage = "dns"
    try:
        t_dns = _time.perf_counter()
        try:
            resolved = _socket.getaddrinfo(host, port, proto=_socket.IPPROTO_TCP)
            family, socktype, _proto, _canon, sockaddr = resolved[0]
            resolved_ip = sockaddr[0]
        finally:
            durations["dns"] = round(_time.perf_counter() - t_dns, 3)

        stage = "connect"
        t_connect = _time.perf_counter()
        sock = _socket.socket(family, socktype)
        sock.settimeout(timeout_s)
        try:
            sock.connect(sockaddr)
            # Try to read the SMTP banner (`220 ...`) so we know the server
            # actually answered the protocol — a plain TCP open doesn't
            # prove an MTA is on the other side.
            banner = b""
            try:
                sock.settimeout(min(timeout_s, 10))
                banner = sock.recv(512)
            except Exception:  # noqa: BLE001
                banner = b""
        finally:
            try:
                sock.close()
            except Exception:  # noqa: BLE001
                pass
            durations["connect"] = round(_time.perf_counter() - t_connect, 3)

        return {
            "reachable": True,
            "resolved_ip": resolved_ip,
            "banner": banner.decode("utf-8", errors="replace").strip() or None,
            "step_durations": durations,
        }
    except BaseException as exc:  # noqa: BLE001
        err = _classify_smtp_error(exc, stage)
        err.step_durations = durations
        raise err from exc


async def send_localized_email(
    db,
    *,
    kind: str,           # "verify" or "reset"
    to_email: str,
    name: str,
    link: str,
    lang: str,
) -> dict:
    """Resolve SMTP settings + render the templates + send. Returns a small
    receipt dict that the caller can log or surface to the admin diagnostic.
    When SMTP is not configured we log a warning with the link so the dev
    can still complete the flow manually."""
    import asyncio

    lang = _normalize_lang(lang)
    if kind == "verify":
        tpl_raw = VERIFY_TEMPLATES[lang]
    elif kind == "reset":
        tpl_raw = RESET_TEMPLATES[lang]
    else:
        raise ValueError(f"Unknown email kind: {kind}")

    tpl = {k: v.format(name=name or "") if isinstance(v, str) else v for k, v in tpl_raw.items()}
    subject = tpl["subject"]
    text_body = _render_text(tpl, link)
    html_body = _render_html(tpl, link, lang)

    settings = await db.email_settings.find_one({"_key": "global"}, {"_id": 0}) or {}
    if not settings.get("smtp_host") or not settings.get("sender_email"):
        # Dev / pre-configuration fallback. Always logged with the link so
        # the user can still complete the flow manually.
        logger.warning(
            "[EMAIL DEV-LOG] %s | to=%s | link=%s | subject=%s",
            kind, to_email, link, subject,
        )
        return {"sent": False, "reason": "smtp_not_configured", "link": link}

    try:
        loop = asyncio.get_event_loop()
        send_info = await loop.run_in_executor(
            None,
            _smtp_send,
            settings, to_email, subject, text_body, html_body,
        )
        step_durations = (send_info or {}).get("step_durations") or {}
        resolved_ip = (send_info or {}).get("resolved_ip")
        logger.info(
            "[EMAIL SENT] %s | to=%s | ip=%s | steps=%s",
            kind, to_email, resolved_ip, step_durations,
        )
        return {
            "sent": True,
            "to": to_email,
            "step_durations": step_durations,
            "resolved_ip": resolved_ip,
        }
    except SmtpDeliveryError as exc:
        # Surface the classified failure to the caller. We log a full
        # traceback at WARNING so an operator can correlate the exception
        # with the admin UI message.
        logger.warning(
            "[EMAIL SEND FAILED] %s | to=%s | stage=%s | reason=%s | smtp=%s/%s | steps=%s | err=%s | link=%s",
            kind, to_email, exc.stage, exc.reason,
            exc.smtp_code, exc.smtp_message,
            exc.step_durations, exc.message, link,
            exc_info=True,
        )
        return {
            "sent": False,
            "reason": exc.reason,
            "stage": exc.stage,
            "error": exc.message,
            "smtp_code": exc.smtp_code,
            "smtp_message": exc.smtp_message,
            "hint_key": exc.hint_key,
            "step_durations": exc.step_durations,
            "link": link,
        }
    except EmailNotConfigured as exc:
        logger.warning(
            "[EMAIL SEND FAILED] %s | to=%s | reason=config_missing | err=%s | link=%s",
            kind, to_email, exc, link,
        )
        return {
            "sent": False,
            "reason": "smtp_not_configured",
            "error": str(exc),
            "link": link,
        }
    except Exception as exc:  # noqa: BLE001
        # True fallback — anything we didn't anticipate still gets a
        # structured response so the UI can render something useful.
        logger.warning(
            "[EMAIL SEND FAILED] %s | to=%s | reason=unknown | err=%s | link=%s",
            kind, to_email, exc, link, exc_info=True,
        )
        return {
            "sent": False,
            "reason": "unknown",
            "error": f"{type(exc).__name__}: {exc}",
            "link": link,
        }


async def smtp_connectivity_test(db) -> dict:
    """Backend connectivity probe — confirms DNS + TCP reachability to the
    configured SMTP host:port WITHOUT requiring valid credentials.

    Returns a rich receipt so the admin can quickly tell the difference
    between a network problem (Render → IONOS unreachable) and a credential
    problem (host reachable, login rejected)."""
    import asyncio
    settings = await db.email_settings.find_one({"_key": "global"}, {"_id": 0}) or {}
    if not settings.get("smtp_host"):
        return {"reachable": False, "reason": "smtp_not_configured",
                "error": "SMTP host missing"}
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _smtp_connectivity_check, settings)
        logger.info(
            "[SMTP CONNECTIVITY] host=%s ip=%s banner=%r steps=%s",
            settings.get("smtp_host"),
            result.get("resolved_ip"),
            result.get("banner"),
            result.get("step_durations"),
        )
        return result
    except SmtpDeliveryError as exc:
        logger.warning(
            "[SMTP CONNECTIVITY FAILED] host=%s stage=%s reason=%s steps=%s err=%s",
            settings.get("smtp_host"), exc.stage, exc.reason,
            exc.step_durations, exc.message,
        )
        return {
            "reachable": False,
            "reason": exc.reason,
            "stage": exc.stage,
            "error": exc.message,
            "hint_key": exc.hint_key,
            "step_durations": exc.step_durations,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[SMTP CONNECTIVITY FAILED] host=%s reason=unknown err=%s",
            settings.get("smtp_host"), exc, exc_info=True,
        )
        return {
            "reachable": False,
            "reason": "unknown",
            "error": f"{type(exc).__name__}: {exc}",
        }


# Default probe matrix — covers every common SMTP transport. When the admin
# triggers the network-diagnose endpoint we probe ALL of these from the host
# the Backend is running on, then return the matrix so the admin can see at
# a glance which ports / providers are reachable.
DEFAULT_NETWORK_DIAGNOSE_TARGETS = [
    ("smtp.gmail.com", 587),
    ("smtp.gmail.com", 465),
    ("smtp.gmail.com", 25),
    ("smtp.ionos.de", 587),
    ("smtp.ionos.de", 465),
    ("smtp.office365.com", 587),
    ("smtp-mail.outlook.com", 587),
    ("smtp.sendgrid.net", 587),
]


async def smtp_network_diagnose(targets: Optional[list] = None) -> dict:
    """Fan out a DNS + TCP probe to every target in `targets` and return
    the matrix. Runs entirely from the host the Backend is deployed on —
    when called against the Render instance it reveals which providers /
    ports Render's outbound firewall allows.

    A single short timeout per target keeps the total response under
    `len(targets) * timeout` even if every host is blocked. The probes are
    sequential (not concurrent) so per-target timing stays accurate."""
    import asyncio
    import platform as _platform
    import os as _os

    targets = targets or list(DEFAULT_NETWORK_DIAGNOSE_TARGETS)
    # Tight per-target timeout — 8 s is plenty to either complete a TCP
    # handshake or expose a deny-by-firewall behaviour. Configurable via env
    # for low-latency users who want a faster sweep.
    timeout_s = int(_os.environ.get("SMTP_DIAGNOSE_TIMEOUT", "8"))

    def _probe_one(host: str, port: int) -> dict:
        try:
            result = _smtp_connectivity_check({
                "smtp_host": host,
                "smtp_port": port,
                "smtp_timeout_seconds": timeout_s,
            })
            return {
                "host": host, "port": port, "reachable": True,
                "resolved_ip": result.get("resolved_ip"),
                "banner": result.get("banner"),
                "step_durations": result.get("step_durations"),
            }
        except SmtpDeliveryError as exc:
            return {
                "host": host, "port": port, "reachable": False,
                "reason": exc.reason, "stage": exc.stage,
                "error": exc.message,
                "step_durations": exc.step_durations,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "host": host, "port": port, "reachable": False,
                "reason": "unknown",
                "error": f"{type(exc).__name__}: {exc}",
            }

    loop = asyncio.get_event_loop()
    logger.warning(
        "[NET DIAGNOSE START] backend_host=%s python=%s targets=%d timeout=%ds",
        _platform.node(), _platform.python_version(), len(targets), timeout_s,
    )
    results = []
    for host, port in targets:
        res = await loop.run_in_executor(None, _probe_one, host, port)
        # Log EACH probe at WARNING so it always shows up in Render's log
        # stream (even on stricter log filters). Format chosen so the line
        # is greppable in any log viewer.
        if res["reachable"]:
            logger.warning(
                "[NET DIAGNOSE] %s:%d → REACHABLE ip=%s steps=%s",
                res["host"], res["port"], res.get("resolved_ip"),
                res.get("step_durations"),
            )
        else:
            logger.warning(
                "[NET DIAGNOSE] %s:%d → BLOCKED reason=%s stage=%s steps=%s err=%s",
                res["host"], res["port"], res.get("reason"),
                res.get("stage"), res.get("step_durations"), res.get("error"),
            )
        results.append(res)

    summary = {
        "backend_host": _platform.node(),
        "python_version": _platform.python_version(),
        "per_target_timeout_seconds": timeout_s,
        "reachable_count": sum(1 for r in results if r["reachable"]),
        "total": len(results),
        "results": results,
    }
    logger.warning(
        "[NET DIAGNOSE END] backend_host=%s reachable=%d/%d",
        _platform.node(), summary["reachable_count"], summary["total"],
    )
    return summary


async def smtp_test_send(db, to_email: str, lang: str = "en") -> dict:
    """Admin-only — send a sample message to verify SMTP credentials."""
    lang = _normalize_lang(lang)
    test_link = f"{BRAND_URL}"
    return await send_localized_email(
        db,
        kind="verify",
        to_email=to_email,
        name="Admin",
        link=test_link,
        lang=lang,
    )
