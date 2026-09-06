from wepaper.sync_plan import Action, AttachmentState, PaperState, plan_sync


def test_empty_library_is_noop() -> None:
    assert plan_sync(discovered=[], remote=[]) == []


def test_new_paper_and_pdf() -> None:
    discovered = [
        PaperState(
            item_key="ITEM1",
            title="New paper",
            version=1,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="aa" * 32, filename="a.pdf", size=10)
            ],
        )
    ]
    actions = plan_sync(discovered=discovered, remote=[])
    kinds = [a.kind for a in actions]
    assert Action.NEW in kinds
    assert Action.UPLOAD in kinds


def test_unchanged_is_idempotent() -> None:
    paper = PaperState(
        item_key="ITEM1",
        title="Same",
        version=3,
        attachments=[
            AttachmentState(attachment_key="ATT1", sha256="bb" * 32, filename="a.pdf", size=10)
        ],
    )
    remote = [
        PaperState(
            item_key="ITEM1",
            title="Same",
            version=3,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="bb" * 32, filename="a.pdf", size=10)
            ],
        )
    ]
    actions = plan_sync(discovered=[paper], remote=remote)
    assert all(a.kind == Action.UNCHANGED for a in actions)


def test_metadata_update_does_not_reupload() -> None:
    discovered = [
        PaperState(
            item_key="ITEM1",
            title="Updated title",
            version=4,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="bb" * 32, filename="a.pdf", size=10)
            ],
        )
    ]
    remote = [
        PaperState(
            item_key="ITEM1",
            title="Old title",
            version=3,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="bb" * 32, filename="a.pdf", size=10)
            ],
        )
    ]
    actions = plan_sync(discovered=discovered, remote=remote)
    kinds = [a.kind for a in actions]
    assert Action.UPDATED in kinds
    assert Action.UPLOAD not in kinds


def test_pdf_replace_uploads_again() -> None:
    discovered = [
        PaperState(
            item_key="ITEM1",
            title="Same",
            version=5,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="cc" * 32, filename="a.pdf", size=11)
            ],
        )
    ]
    remote = [
        PaperState(
            item_key="ITEM1",
            title="Same",
            version=4,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="bb" * 32, filename="a.pdf", size=10)
            ],
        )
    ]
    kinds = [a.kind for a in plan_sync(discovered=discovered, remote=remote)]
    assert Action.UPLOAD in kinds


def test_removed_from_collection_hides() -> None:
    remote = [
        PaperState(
            item_key="ITEM1",
            title="Gone",
            version=2,
            attachments=[],
        )
    ]
    actions = plan_sync(discovered=[], remote=remote)
    assert any(a.kind == Action.REMOVED and a.item_key == "ITEM1" for a in actions)


def test_duplicate_checksum_still_one_blob() -> None:
    discovered = [
        PaperState(
            item_key="ITEM1",
            title="A",
            version=1,
            attachments=[
                AttachmentState(attachment_key="ATT1", sha256="dd" * 32, filename="a.pdf", size=10)
            ],
        ),
        PaperState(
            item_key="ITEM2",
            title="B",
            version=1,
            attachments=[
                AttachmentState(attachment_key="ATT2", sha256="dd" * 32, filename="copy.pdf", size=10)
            ],
        ),
    ]
    actions = plan_sync(discovered=discovered, remote=[])
    uploads = [a for a in actions if a.kind == Action.UPLOAD]
    assert len(uploads) == 2
    assert {u.sha256 for u in uploads} == {"dd" * 32}
