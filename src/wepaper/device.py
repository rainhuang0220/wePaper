from __future__ import annotations

import re
from collections.abc import Mapping

NATIVE_PDF = "native_pdf"
MOBILE_VIEWER = "mobile_viewer"

_MOBILE_HINT = re.compile(r"^\s*\?1\s*$")
_DESKTOP_HINT = re.compile(r"^\s*\?0\s*$")
_PHONE_UA = re.compile(
    r"Mobile|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|webOS|Opera Mini",
    re.I,
)
_TABLET_UA = re.compile(r"iPad|Android(?!.*Mobile)|Tablet|Silk", re.I)


def reading_surface(headers: Mapping[str, str] | None) -> str:
    """Choose DesktopNativePdf vs MobilePaperViewer.

    Prefer Sec-CH-UA-Mobile when present. Fall back to User-Agent.
    Unknown / tool clients (curl, Zotero) stay on native PDF.
    """
    fields = {str(key).lower(): str(value) for key, value in (headers or {}).items()}
    hint = fields.get("sec-ch-ua-mobile", "").strip()
    if hint:
        if _MOBILE_HINT.match(hint):
            return MOBILE_VIEWER
        if _DESKTOP_HINT.match(hint):
            return NATIVE_PDF
    ua = fields.get("user-agent", "")
    if not ua:
        return NATIVE_PDF
    if _PHONE_UA.search(ua) or _TABLET_UA.search(ua):
        return MOBILE_VIEWER
    return NATIVE_PDF


def wants_mobile_viewer(headers: Mapping[str, str] | None) -> bool:
    return reading_surface(headers) == MOBILE_VIEWER
