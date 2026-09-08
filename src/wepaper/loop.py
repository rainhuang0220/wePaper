from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from wepaper.checksum import sha256_file


class TickAction(StrEnum):
    IDLE = "IDLE"
    DEBOUNCING = "DEBOUNCING"
    SYNC = "SYNC"
    PERIODIC = "PERIODIC"
    OFFLINE = "OFFLINE"
    WAKE = "WAKE"


@dataclass(slots=True)
class LoopConfig:
    detect_seconds: float = 2.0
    debounce_seconds: float = 2.0
    reconcile_seconds: float = 300.0
    retry_seconds: float = 5.0
    wake_gap_seconds: float = 15.0
    pdf_quiet_seconds: float = 2.0


@dataclass
class LoopState:
    last_version: int | None = None
    pending_version: int | None = None
    pending_since: float | None = None
    last_sync_at: float | None = None
    last_attempt_at: float | None = None
    last_failed_at: float | None = None
    last_tick_at: float | None = None
    in_flight: bool = False
    coalesce: bool = False
    last_error: str | None = None
    pdf_sizes: dict[str, int] = field(default_factory=dict)


@dataclass(slots=True)
class TickResult:
    action: TickAction
    reason: str = ""


@dataclass
class ChangeLoop:
    config: LoopConfig = field(default_factory=LoopConfig)
    state: LoopState = field(default_factory=LoopState)

    def note_sync_start(self, now: float) -> bool:
        _ = now
        if self.state.in_flight:
            self.state.coalesce = True
            return False
        self.state.in_flight = True
        return True

    def note_sync_end(
        self,
        now: float,
        *,
        ok: bool,
        version: int | None = None,
        deferred: bool = False,
    ) -> bool:
        self.state.in_flight = False
        if deferred:
            follow = self.state.coalesce
            self.state.coalesce = False
            return follow
        self.state.last_attempt_at = now
        if ok:
            self.state.last_error = None
            self.state.last_failed_at = None
            self.state.last_sync_at = now
            if version is not None:
                self.state.last_version = version
            self.state.pending_since = None
            self.state.pending_version = None
        else:
            self.state.last_failed_at = now
        follow = self.state.coalesce
        self.state.coalesce = False
        return follow

    def tick(self, now: float, version: int | None) -> TickResult:
        woke = False
        if self.state.last_tick_at is not None and now - self.state.last_tick_at >= self.config.wake_gap_seconds:
            woke = True
        self.state.last_tick_at = now

        if self.state.in_flight:
            if version is not None and version != self.state.last_version:
                self.state.coalesce = True
                self._remember_change(now, version)
            return TickResult(TickAction.IDLE, "in_flight")

        if version is None:
            return TickResult(TickAction.OFFLINE, "zotero")

        if self.state.last_sync_at is None:
            if self._retry_wait(now):
                return TickResult(TickAction.IDLE, "retry_wait")
            self._remember_change(now, version)
            return TickResult(TickAction.SYNC, "startup" if self.state.last_failed_at is None else "retry")

        if woke:
            self.state.pending_since = None
            self.state.pending_version = None
            return TickResult(TickAction.WAKE, "sleep_or_gap")

        if version != self.state.last_version:
            if self.state.pending_since is None or self.state.pending_version != version:
                self._remember_change(now, version)
                return TickResult(TickAction.DEBOUNCING, "version")
            if now - self.state.pending_since >= self.config.debounce_seconds:
                return TickResult(TickAction.SYNC, "debounced")
            return TickResult(TickAction.DEBOUNCING, "wait")

        if self.state.last_failed_at is not None:
            if self._retry_wait(now):
                return TickResult(TickAction.IDLE, "retry_wait")
            return TickResult(TickAction.SYNC, "retry")

        if now - self.state.last_sync_at >= self.config.reconcile_seconds:
            if self._retry_wait(now):
                return TickResult(TickAction.IDLE, "periodic_backoff")
            return TickResult(TickAction.PERIODIC, "reconcile")

        self.state.pending_since = None
        self.state.pending_version = None
        return TickResult(TickAction.IDLE, "unchanged")

    def _retry_wait(self, now: float) -> bool:
        if self.state.last_attempt_at is None:
            return False
        return now - self.state.last_attempt_at < self.config.retry_seconds

    def _remember_change(self, now: float, version: int) -> None:
        self.state.pending_version = version
        self.state.pending_since = now


def pdf_is_stable(
    path: Path,
    *,
    now: float,
    quiet_seconds: float = 2.0,
    previous_size: int | None = None,
) -> bool:
    if not path.is_file():
        return False
    stat = path.stat()
    if now - stat.st_mtime < quiet_seconds:
        return False
    if previous_size is not None and stat.st_size != previous_size:
        return False
    return True


def should_defer_for_pdfs(
    paths: list[Path],
    *,
    now: float,
    quiet_seconds: float = 2.0,
    observed_sizes: dict[str, int] | None = None,
) -> bool:
    defer = False
    for path in paths:
        try:
            key = str(path.resolve())
        except OSError:
            key = str(path)
        previous = observed_sizes.get(key) if observed_sizes is not None else None
        size = path.stat().st_size if path.is_file() else None
        if observed_sizes is not None:
            first_look = previous is None
            stable = (not first_look) and pdf_is_stable(
                path, now=now, quiet_seconds=quiet_seconds, previous_size=previous
            )
            if size is not None:
                observed_sizes[key] = size
            if not stable:
                defer = True
        elif not pdf_is_stable(path, now=now, quiet_seconds=quiet_seconds):
            defer = True
    return defer


def cached_sha256(path: Path, cache: dict[tuple[str, int, int], str]) -> str:
    stat = path.stat()
    key = (str(path.resolve()), stat.st_mtime_ns, stat.st_size)
    digest = cache.get(key)
    if digest is None:
        digest = sha256_file(path)
        cache[key] = digest
    return digest
