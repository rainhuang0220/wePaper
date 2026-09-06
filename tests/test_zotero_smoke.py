from __future__ import annotations

import os

import pytest

from wepaper.zotero import LocalAPI


@pytest.mark.skipif(os.environ.get("WEPAPER_SKIP_ZOTERO") == "1", reason="explicit skip")
def test_real_zotero_read_only_discovery() -> None:
    api = LocalAPI()
    probe = api.probe()
    if not probe.running:
        pytest.skip("Zotero is not running")
    if not probe.local_api:
        pytest.skip(probe.message)
    collections = api.collections()
    assert isinstance(collections, list)
    names = [item.get("data", {}).get("name") for item in collections]
    assert names
    discovered, version, server_id = api.discover(names[:1])
    assert version >= 0
    assert server_id
    for paper in discovered:
        assert paper.record.zotero_item_key
        assert paper.record.title
    api.close()
