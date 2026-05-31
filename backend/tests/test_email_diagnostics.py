"""Tests for the structured SMTP error classification surface used by the
Admin → Email Settings → "Send test email" diagnostic.

We don't talk to a real SMTP server here — the helper functions are unit-
tested directly so the test stays deterministic and fast (no network).
"""

import asyncio
import os
import socket
import ssl
import smtplib
import sys

sys.path.insert(0, "/app/backend")

from email_service import _classify_smtp_error, send_localized_email


def test_classify_auth_error():
    exc = smtplib.SMTPAuthenticationError(
        535, b"5.7.8 Username and Password not accepted"
    )
    out = _classify_smtp_error(exc, "login")
    assert out.reason == "auth_failed"
    assert out.stage == "login"
    assert out.smtp_code == 535
    assert "not accepted" in out.smtp_message
    assert out.hint_key == "hint.auth"


def test_classify_helo_error():
    exc = smtplib.SMTPHeloError(554, b"5.7.1 not allowed")
    out = _classify_smtp_error(exc, "connect")
    assert out.reason == "helo_failed"
    assert out.stage == "connect"
    assert out.smtp_code == 554
    assert out.hint_key == "hint.helo"


def test_classify_sender_refused():
    exc = smtplib.SMTPSenderRefused(550, b"address blocked", "me@bad.example")
    out = _classify_smtp_error(exc, "send")
    assert out.reason == "sender_refused"
    assert out.stage == "send"
    assert out.smtp_code == 550
    assert out.hint_key == "hint.sender"


def test_classify_recipient_refused():
    exc = smtplib.SMTPRecipientsRefused({"you@bad.example": (550, b"no such user")})
    out = _classify_smtp_error(exc, "send")
    assert out.reason == "recipient_refused"
    assert out.smtp_code == 550
    assert "no such user" in out.smtp_message
    assert out.hint_key == "hint.recipient"


def test_classify_dns_error():
    exc = socket.gaierror(-2, "Name or service not known")
    out = _classify_smtp_error(exc, "connect")
    assert out.reason == "host_unknown"
    assert out.stage == "connect"
    assert out.hint_key == "hint.host"


def test_classify_connection_refused():
    exc = ConnectionRefusedError(111, "Connection refused")
    out = _classify_smtp_error(exc, "connect")
    assert out.reason == "connection_refused"
    assert out.hint_key == "hint.connection"


def test_classify_timeout():
    exc = socket.timeout("timed out")
    out = _classify_smtp_error(exc, "connect")
    assert out.reason == "timeout"
    assert out.hint_key == "hint.timeout"


def test_classify_tls_error():
    exc = ssl.SSLError("certificate verify failed")
    out = _classify_smtp_error(exc, "starttls")
    assert out.reason == "tls_failed"
    assert out.stage == "starttls"
    assert out.hint_key == "hint.tls"


def test_classify_tls_not_supported():
    exc = smtplib.SMTPNotSupportedError("STARTTLS extension not supported by server")
    out = _classify_smtp_error(exc, "starttls")
    assert out.reason == "tls_not_supported"
    assert out.hint_key == "hint.tls"


def test_classify_server_disconnected():
    exc = smtplib.SMTPServerDisconnected("please run connect() first")
    out = _classify_smtp_error(exc, "send")
    assert out.reason == "server_disconnected"
    assert out.hint_key == "hint.disconnect"


def test_classify_connect_error():
    exc = smtplib.SMTPConnectError(421, b"service not available")
    out = _classify_smtp_error(exc, "connect")
    assert out.reason == "connection_refused"
    assert out.smtp_code == 421
    assert out.hint_key == "hint.connection"


def test_classify_generic_smtp_error():
    exc = smtplib.SMTPException("something unexpected")
    out = _classify_smtp_error(exc, "send")
    assert out.reason == "smtp_error"


def test_classify_unknown_falls_back_gracefully():
    out = _classify_smtp_error(RuntimeError("¯\\_(ツ)_/¯"), "send")
    assert out.reason == "unknown"
    assert out.message.startswith("RuntimeError:")


# --- Higher-level integration with send_localized_email -------------------

class _FakeColl:
    def __init__(self, settings):
        self._settings = settings

    async def find_one(self, *_args, **_kwargs):
        return self._settings


class _FakeDB:
    def __init__(self, settings):
        self.email_settings = _FakeColl(settings)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_send_localized_email_returns_structured_error_on_dns_failure():
    """Drive the full helper end-to-end with a guaranteed-bad hostname.
    Verifies the dict shape the frontend depends on without hitting a real
    SMTP server."""
    settings = {
        "smtp_host": "smtp.this-domain-must-not-exist.invalid",
        "smtp_port": 587,
        "smtp_username": "x",
        "smtp_password": "y",
        "use_tls": True,
        "sender_email": "noreply@example.com",
        "sender_name": "Test",
    }
    db = _FakeDB(settings)
    out = _run(send_localized_email(
        db,
        kind="verify",
        to_email="me@example.com",
        name="Me",
        link="https://example.com/verify?token=abc",
        lang="en",
    ))
    assert out["sent"] is False
    # Either DNS lookup (host_unknown) or timeout — both acceptable here, as
    # long as the dict shape is correct and we get a usable hint.
    assert out["reason"] in {"host_unknown", "timeout", "network_error"}
    assert "stage" in out
    assert "error" in out
    assert out["link"] == "https://example.com/verify?token=abc"


def test_send_localized_email_returns_smtp_not_configured_when_blank():
    db = _FakeDB({"smtp_host": "", "sender_email": ""})
    out = _run(send_localized_email(
        db,
        kind="verify",
        to_email="me@example.com",
        name="Me",
        link="https://example.com/x",
        lang="en",
    ))
    assert out["sent"] is False
    assert out["reason"] == "smtp_not_configured"
    assert out["link"] == "https://example.com/x"
