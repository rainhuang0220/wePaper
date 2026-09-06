from wepaper.sanitize import safe_storage_name, sanitize_filename


def test_strips_path_components() -> None:
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("a/b/c.pdf") == "c.pdf"


def test_rejects_empty_and_dots() -> None:
    assert sanitize_filename("") == "file.pdf"
    assert sanitize_filename(".") == "file.pdf"
    assert sanitize_filename("..") == "file.pdf"


def test_preserves_unicode_and_spaces() -> None:
    name = sanitize_filename("Xu 等 - 2026 - A-mem agentic memory.pdf")
    assert name.endswith(".pdf")
    assert "A-mem" in name
    assert "/" not in name
    assert "\\" not in name


def test_null_bytes_and_control_chars() -> None:
    assert "\x00" not in sanitize_filename("bad\x00name.pdf")
    assert "\n" not in sanitize_filename("bad\nname.pdf")


def test_storage_name_is_hash_plus_ext() -> None:
    assert safe_storage_name("deadbeef" * 8, "Paper Title.pdf") == ("deadbeef" * 8) + ".pdf"
    assert ".." not in safe_storage_name("abc", "../../../x.exe")
    assert safe_storage_name("abc", "noext") == "abc.bin"
