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

VERIFY_TEMPLATES = {
    "en": {
        "subject": f"Verify your {BRAND_NAME} email",
        "greeting": "Hello {name},",
        "intro": (
            f"Welcome to {BRAND_NAME}! Please confirm your email address by "
            "clicking the button below. The link is valid for 24 hours."
        ),
        "cta": "Verify my email",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "footer": (
            f"You received this email because you signed up at {BRAND_NAME}. "
            "If this was not you, simply ignore this message."
        ),
        "regards": f"— The {BRAND_NAME} team",
    },
    "ar": {
        "subject": f"تأكيد بريدك الإلكتروني في {BRAND_NAME}",
        "greeting": "مرحباً {name}،",
        "intro": (
            f"أهلاً بك في {BRAND_NAME}! يُرجى تأكيد بريدك الإلكتروني بالضغط على "
            "الزر أدناه. الرابط صالح لمدة 24 ساعة."
        ),
        "cta": "تأكيد بريدي",
        "fallback": "إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:",
        "footer": (
            f"تلقّيت هذه الرسالة لأنك سجّلت في {BRAND_NAME}. إن لم تكن أنت، "
            "تجاهل هذه الرسالة."
        ),
        "regards": f"— فريق {BRAND_NAME}",
    },
    "de": {
        "subject": f"Bestätige deine {BRAND_NAME}-E-Mail",
        "greeting": "Hallo {name},",
        "intro": (
            f"Willkommen bei {BRAND_NAME}! Bitte bestätige deine E-Mail-Adresse "
            "über den unten stehenden Button. Der Link ist 24 Stunden gültig."
        ),
        "cta": "E-Mail bestätigen",
        "fallback": "Wenn der Button nicht funktioniert, kopiere diesen Link in den Browser:",
        "footer": (
            f"Du erhältst diese E-Mail, weil du dich bei {BRAND_NAME} registriert "
            "hast. Falls nicht: einfach ignorieren."
        ),
        "regards": f"— Das {BRAND_NAME} Team",
    },
}

RESET_TEMPLATES = {
    "en": {
        "subject": f"Reset your {BRAND_NAME} password",
        "greeting": "Hello {name},",
        "intro": (
            "We received a request to reset your password. Click the button "
            "below to choose a new one. The link is valid for 30 minutes."
        ),
        "cta": "Reset my password",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "footer": (
            "If you did not ask for a password reset, you can safely ignore "
            "this email — your password will not change."
        ),
        "regards": f"— The {BRAND_NAME} team",
    },
    "ar": {
        "subject": f"إعادة تعيين كلمة المرور في {BRAND_NAME}",
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
    },
    "de": {
        "subject": f"Passwort für {BRAND_NAME} zurücksetzen",
        "greeting": "Hallo {name},",
        "intro": (
            "Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. "
            "Klicke auf den Button, um ein neues Passwort zu wählen. Der Link "
            "ist 30 Minuten gültig."
        ),
        "cta": "Passwort zurücksetzen",
        "fallback": "Wenn der Button nicht funktioniert, kopiere diesen Link in den Browser:",
        "footer": (
            "Falls du keine Anfrage gestellt hast, kannst du diese E-Mail "
            "ignorieren — dein Passwort bleibt unverändert."
        ),
        "regards": f"— Das {BRAND_NAME} Team",
    },
}


def _normalize_lang(lang: Optional[str]) -> str:
    code = (lang or "en").lower().strip()[:2]
    return code if code in {"en", "ar", "de"} else "en"


def _render_html(tpl: dict, link: str, lang: str) -> str:
    """Render a minimal-but-presentable HTML email. Inline CSS only — many
    clients drop <style> blocks. RTL set on the body for Arabic."""
    dir_attr = "rtl" if lang == "ar" else "ltr"
    align = "right" if lang == "ar" else "left"
    return f"""<!DOCTYPE html>
<html lang="{lang}" dir="{dir_attr}">
<body style="margin:0;padding:0;background:#F3F0EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D2A26;">
  <div style="max-width:520px;margin:24px auto;background:#FFFFFF;border-radius:20px;border:1px solid #E5E2DC;padding:32px 28px;text-align:{align};">
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px 0;color:#2D2A26;letter-spacing:-0.01em;">{BRAND_NAME}</h1>
    <p style="font-size:15px;margin:18px 0 8px 0;color:#2D2A26;">{tpl['greeting']}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 22px 0;color:#4A4742;">{tpl['intro']}</p>
    <p style="margin:0 0 22px 0;">
      <a href="{link}" style="display:inline-block;background:#2D2A26;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:500;">{tpl['cta']}</a>
    </p>
    <p style="font-size:12px;color:#7A7571;margin:0 0 6px 0;">{tpl['fallback']}</p>
    <p style="font-size:12px;color:#7A7571;word-break:break-all;margin:0 0 24px 0;"><a href="{link}" style="color:#7A7571;">{link}</a></p>
    <hr style="border:0;border-top:1px solid #EFEBE4;margin:24px 0;">
    <p style="font-size:11px;color:#A09B95;line-height:1.5;margin:0 0 6px 0;">{tpl['footer']}</p>
    <p style="font-size:11px;color:#A09B95;margin:0;">{tpl['regards']}</p>
  </div>
</body>
</html>"""


def _render_text(tpl: dict, link: str) -> str:
    return (
        f"{tpl['greeting']}\n\n"
        f"{tpl['intro']}\n\n"
        f"{tpl['cta']}: {link}\n\n"
        f"{tpl['fallback']}\n{link}\n\n"
        f"{tpl['footer']}\n{tpl['regards']}\n"
    )


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
