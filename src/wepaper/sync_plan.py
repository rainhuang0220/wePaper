from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Action(StrEnum):
    DISCOVERED = "DISCOVERED"
    NEW = "NEW"
    UPDATED = "UPDATED"
    UNCHANGED = "UNCHANGED"
    REMOVED = "REMOVED"
    UPLOAD = "UPLOAD"
    FAILED = "FAILED"
    RETRYING = "RETRYING"


@dataclass(slots=True)
class AttachmentState:
    attachment_key: str
    sha256: str
    filename: str
    size: int


@dataclass(slots=True)
class PaperState:
    item_key: str
    title: str
    version: int
    attachments: list[AttachmentState] = field(default_factory=list)


@dataclass(slots=True)
class PlannedAction:
    kind: Action
    item_key: str
    attachment_key: str | None = None
    sha256: str | None = None
    detail: str = ""


def plan_sync(*, discovered: list[PaperState], remote: list[PaperState]) -> list[PlannedAction]:
    remote_by_key = {paper.item_key: paper for paper in remote}
    seen: set[str] = set()
    actions: list[PlannedAction] = []

    for paper in discovered:
        seen.add(paper.item_key)
        existing = remote_by_key.get(paper.item_key)
        remote_atts = {att.attachment_key: att for att in (existing.attachments if existing else [])}
        if existing is None:
            actions.append(PlannedAction(kind=Action.NEW, item_key=paper.item_key, detail=paper.title))
        elif existing.title != paper.title or existing.version != paper.version:
            actions.append(PlannedAction(kind=Action.UPDATED, item_key=paper.item_key, detail=paper.title))
        else:
            actions.append(PlannedAction(kind=Action.UNCHANGED, item_key=paper.item_key, detail=paper.title))

        for att in paper.attachments:
            prev = remote_atts.get(att.attachment_key)
            if prev is None or prev.sha256 != att.sha256:
                actions.append(
                    PlannedAction(
                        kind=Action.UPLOAD,
                        item_key=paper.item_key,
                        attachment_key=att.attachment_key,
                        sha256=att.sha256,
                    )
                )
            elif existing is not None:
                actions.append(
                    PlannedAction(
                        kind=Action.UNCHANGED,
                        item_key=paper.item_key,
                        attachment_key=att.attachment_key,
                        sha256=att.sha256,
                    )
                )

    for paper in remote:
        if paper.item_key not in seen:
            actions.append(PlannedAction(kind=Action.REMOVED, item_key=paper.item_key, detail=paper.title))
    return actions
