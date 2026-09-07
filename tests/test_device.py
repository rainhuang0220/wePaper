from wepaper.device import reading_surface

DESKTOP_CHROME = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
DESKTOP_SAFARI = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
)
IPHONE_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)
IPAD_SAFARI = (
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
)
ANDROID_TABLET = (
    "Mozilla/5.0 (Linux; Android 14; SM-X810) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
CURL = "curl/8.7.1"
ZOTERO = "Zotero/7.0"


def test_sec_ch_ua_mobile_one_is_mobile_viewer() -> None:
    assert (
        reading_surface({"sec-ch-ua-mobile": "?1", "user-agent": DESKTOP_CHROME})
        == "mobile_viewer"
    )


def test_sec_ch_ua_mobile_zero_is_native_pdf() -> None:
    assert (
        reading_surface({"sec-ch-ua-mobile": "?0", "user-agent": IPHONE_SAFARI})
        == "native_pdf"
    )


def test_iphone_user_agent_is_mobile_viewer() -> None:
    assert reading_surface({"user-agent": IPHONE_SAFARI}) == "mobile_viewer"


def test_android_phone_user_agent_is_mobile_viewer() -> None:
    assert reading_surface({"user-agent": ANDROID_CHROME}) == "mobile_viewer"


def test_ipad_user_agent_is_mobile_viewer() -> None:
    assert reading_surface({"user-agent": IPAD_SAFARI}) == "mobile_viewer"


def test_android_tablet_without_mobile_token_is_mobile_viewer() -> None:
    assert reading_surface({"user-agent": ANDROID_TABLET}) == "mobile_viewer"


def test_desktop_chrome_is_native_pdf() -> None:
    assert reading_surface({"user-agent": DESKTOP_CHROME}) == "native_pdf"


def test_desktop_safari_is_native_pdf() -> None:
    assert reading_surface({"user-agent": DESKTOP_SAFARI}) == "native_pdf"


def test_curl_and_zotero_stay_on_native_pdf() -> None:
    assert reading_surface({"user-agent": CURL}) == "native_pdf"
    assert reading_surface({"user-agent": ZOTERO}) == "native_pdf"


def test_missing_headers_default_to_native_pdf() -> None:
    assert reading_surface({}) == "native_pdf"
