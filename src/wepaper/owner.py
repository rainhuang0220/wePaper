from __future__ import annotations

import hashlib
import hmac
import secrets
import time

COOKIE_NAME = "wepaper_owner"
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60


def password_matches(expected: str, provided: str) -> bool:
    if not expected:
        return False
    left = hashlib.sha256(expected.encode()).digest()
    right = hashlib.sha256((provided or "").encode()).digest()
    return secrets.compare_digest(left, right)


def issue_session(secret: str, now: int | None = None) -> str:
    expires = (now or int(time.time())) + SESSION_TTL_SECONDS
    payload = str(expires)
    return f"{payload}.{_sign(secret, payload)}"


def session_valid(secret: str, token: str | None, now: int | None = None) -> bool:
    if not secret or not token or "." not in token:
        return False
    payload, signature = token.split(".", 1)
    if not secrets.compare_digest(_sign(secret, payload), signature):
        return False
    try:
        expires = int(payload)
    except ValueError:
        return False
    return expires > (now or int(time.time()))


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
