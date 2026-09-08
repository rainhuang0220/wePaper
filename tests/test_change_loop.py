from __future__ import annotations

from wepaper.loop import ChangeLoop, LoopConfig, TickAction


def _loop() -> ChangeLoop:
    return ChangeLoop(
        LoopConfig(
            detect_seconds=2,
            debounce_seconds=2,
            reconcile_seconds=300,
            retry_seconds=5,
            wake_gap_seconds=15,
        )
    )


def test_startup_syncs_once() -> None:
    loop = _loop()
    result = loop.tick(now=10.0, version=100)
    assert result.action == TickAction.SYNC
    assert result.reason == "startup"


def test_unchanged_version_is_idle_after_sync() -> None:
    loop = _loop()
    assert loop.tick(now=10.0, version=100).action == TickAction.SYNC
    assert loop.note_sync_start(10.0) is True
    assert loop.note_sync_end(11.0, ok=True, version=100) is False
    assert loop.tick(now=13.0, version=100).action == TickAction.IDLE


def test_version_change_debounces_then_syncs() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)

    first = loop.tick(now=20.0, version=101)
    assert first.action == TickAction.DEBOUNCING
    still = loop.tick(now=21.0, version=101)
    assert still.action == TickAction.DEBOUNCING
    ready = loop.tick(now=22.0, version=101)
    assert ready.action == TickAction.SYNC
    assert ready.reason == "debounced"


def test_burst_of_version_changes_coalesces_to_one_sync() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)

    actions = []
    version = 100
    now = 20.0
    for _ in range(10):
        version += 1
        actions.append(loop.tick(now=now, version=version).action)
        now += 0.1
    assert TickAction.SYNC not in actions
    assert actions[-1] == TickAction.DEBOUNCING
    ready = loop.tick(now=now + 2.0, version=version)
    assert ready.action == TickAction.SYNC


def test_no_overlapping_sync_sets_follow_up() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    assert loop.note_sync_start(10.0) is True
    during = loop.tick(now=11.0, version=101)
    assert during.action != TickAction.SYNC
    assert loop.note_sync_start(11.0) is False
    assert loop.note_sync_end(12.0, ok=True, version=100) is True


def test_periodic_reconcile_after_idle() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)
    idle = loop.tick(now=20.0, version=100)
    assert idle.action == TickAction.IDLE
    loop.state.last_tick_at = 310.5
    periodic = loop.tick(now=311.0, version=100)
    assert periodic.action == TickAction.PERIODIC


def test_wake_from_sleep_forces_reconcile() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)
    loop.tick(now=13.0, version=100)
    woke = loop.tick(now=13.0 + 60.0, version=100)
    assert woke.action == TickAction.WAKE


def test_zotero_offline_then_recovers() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)
    offline = loop.tick(now=14.0, version=None)
    assert offline.action == TickAction.OFFLINE
    back = loop.tick(now=16.0, version=100)
    assert back.action in {TickAction.IDLE, TickAction.SYNC, TickAction.WAKE}
    changed = loop.tick(now=20.0, version=102)
    assert changed.action == TickAction.DEBOUNCING
    assert loop.tick(now=22.0, version=102).action == TickAction.SYNC


def test_failed_sync_retries_without_advancing_cursor() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    assert loop.note_sync_end(11.0, ok=False, version=None) is False
    assert loop.tick(now=12.0, version=100).action == TickAction.IDLE
    retry = loop.tick(now=16.0, version=100)
    assert retry.action == TickAction.SYNC
    assert loop.state.last_version != 100 or loop.state.last_sync_at is None


def test_periodic_failure_backs_off_to_retry_interval() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=True, version=100)
    loop.state.last_tick_at = 310.5
    assert loop.tick(now=311.0, version=100).action == TickAction.PERIODIC
    assert loop.note_sync_start(311.0) is True
    loop.note_sync_end(311.0, ok=False)
    assert loop.tick(now=313.0, version=100).action == TickAction.IDLE
    assert loop.tick(now=316.0, version=100).action == TickAction.SYNC


def test_deferred_pdf_does_not_count_as_failed_sync() -> None:
    loop = _loop()
    loop.tick(now=10.0, version=100)
    loop.note_sync_start(10.0)
    loop.note_sync_end(11.0, ok=False, deferred=True)
    assert loop.state.last_failed_at is None
    assert loop.tick(now=12.0, version=100).action == TickAction.SYNC
