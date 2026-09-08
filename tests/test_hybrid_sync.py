from __future__ import annotations

from pathlib import Path

from tests.test_agent_integration import MINIMAL_PDF, _harness, _titles
from wepaper.agent import run_agent_cycle
from wepaper.loop import ChangeLoop, LoopConfig, TickAction


def _cycle(zotero, remote, config, loop: ChangeLoop, now: float):
    return run_agent_cycle(loop, source=zotero, remote=remote, config=config, now=now)


def test_missed_version_event_is_caught_by_periodic(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    config.pdf_quiet_seconds = 0
    zotero.add_pdf(item_key="ITEM0001", title="First paper", pdf_path=pdf, attachment_key="ATT00001")
    loop = ChangeLoop(LoopConfig(debounce_seconds=2, reconcile_seconds=300, wake_gap_seconds=15))
    assert _cycle(zotero, remote, config, loop, 10.0).action == TickAction.SYNC
    if "First paper" not in _titles(http):
        assert _cycle(zotero, remote, config, loop, 12.0).action == TickAction.SYNC
    assert _titles(http) == ["First paper"]

    zotero.reported_version = zotero.library_version
    zotero.add_pdf(item_key="ITEM0002", title="Missed paper", pdf_path=pdf, attachment_key="ATT00002")
    idle = _cycle(zotero, remote, config, loop, 20.0)
    assert idle.action == TickAction.IDLE
    assert "Missed paper" not in _titles(http)

    loop.state.last_tick_at = 320.5
    periodic = _cycle(zotero, remote, config, loop, 321.0)
    assert periodic.action == TickAction.PERIODIC
    assert "Missed paper" in _titles(http)


def test_metadata_update_and_removal_through_cycle(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    config.pdf_quiet_seconds = 0
    zotero.add_pdf(item_key="ITEM0001", title="Old title", pdf_path=pdf, attachment_key="ATT00001", version=1)
    loop = ChangeLoop(LoopConfig(debounce_seconds=2, wake_gap_seconds=15))
    _cycle(zotero, remote, config, loop, 10.0)
    if loop.state.last_sync_at is None:
        _cycle(zotero, remote, config, loop, 12.0)
    zotero.papers["ITEM0001"].record.title = "New title"
    zotero.papers["ITEM0001"].state.title = "New title"
    zotero.papers["ITEM0001"].state.version = 2
    zotero.papers["ITEM0001"].record.zotero_version = 2
    zotero.library_version += 1
    assert _cycle(zotero, remote, config, loop, 20.0).action == TickAction.DEBOUNCING
    assert _cycle(zotero, remote, config, loop, 22.0).action == TickAction.SYNC
    assert _titles(http) == ["New title"]
    zotero.remove("ITEM0001")
    assert _cycle(zotero, remote, config, loop, 30.0).action == TickAction.DEBOUNCING
    assert _cycle(zotero, remote, config, loop, 32.0).action == TickAction.SYNC
    assert _titles(http) == []


def test_unstable_pdf_defers_without_removing(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Fresh pdf", pdf_path=pdf, attachment_key="ATT00001")
    loop = ChangeLoop(LoopConfig(debounce_seconds=2, wake_gap_seconds=15))
    config.pdf_quiet_seconds = 10_000
    result = _cycle(zotero, remote, config, loop, 10.0)
    assert result.action == TickAction.SYNC
    assert loop.state.coalesce is False
    assert _titles(http) == []
    config.pdf_quiet_seconds = 0
    loop.state.last_sync_at = None
    _cycle(zotero, remote, config, loop, 20.0)
    assert _titles(http) == ["Fresh pdf"]
