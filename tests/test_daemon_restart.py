from __future__ import annotations

from pathlib import Path

from tests.test_agent_integration import _harness, _titles
from tests.test_hybrid_sync import _cycle
from wepaper.loop import ChangeLoop, LoopConfig, TickAction


def test_daemon_restart_catches_up_without_manual_sync(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    config.pdf_quiet_seconds = 0
    zotero.add_pdf(item_key="ITEM0001", title="Before restart", pdf_path=pdf, attachment_key="ATT00001")
    first = ChangeLoop(LoopConfig(debounce_seconds=2, wake_gap_seconds=15))
    assert _cycle(zotero, remote, config, first, 10.0).action == TickAction.SYNC
    if "Before restart" not in _titles(http):
        assert _cycle(zotero, remote, config, first, 12.0).action == TickAction.SYNC
    zotero.add_pdf(item_key="ITEM0002", title="After restart", pdf_path=pdf, attachment_key="ATT00002")
    restarted = ChangeLoop(LoopConfig(debounce_seconds=2, wake_gap_seconds=15))
    assert _cycle(zotero, remote, config, restarted, 50.0).action == TickAction.SYNC
    if "After restart" not in _titles(http):
        assert _cycle(zotero, remote, config, restarted, 52.0).action == TickAction.SYNC
    assert "After restart" in _titles(http)
    assert "Before restart" in _titles(http)
