from __future__ import annotations

import logging
from typing import Optional

import typer
import uvicorn

from wepaper import __version__

app = typer.Typer(no_args_is_help=True, add_completion=False)


def _setup_logging(level: str = "info") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@app.callback()
def _root() -> None:
    """wePaper — sync a Zotero collection to a public paper library."""


@app.command()
def version() -> None:
    typer.echo(__version__)


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1"),
    port: int = typer.Option(8788),
) -> None:
    _setup_logging()
    uvicorn.run("wepaper.server:create_app", factory=True, host=host, port=port, log_level="info")


@app.command()
def doctor() -> None:
    from wepaper.agent import run_doctor

    _setup_logging()
    raise typer.Exit(run_doctor())


@app.command("sync")
def sync_cmd(
    once: bool = typer.Option(False, "--once"),
) -> None:
    from wepaper.agent import run_sync

    _setup_logging()
    raise typer.Exit(run_sync(once=True if once else True))


@app.command()
def daemon() -> None:
    from wepaper.agent import run_daemon

    _setup_logging()
    raise typer.Exit(run_daemon())


@app.command()
def status() -> None:
    from wepaper.agent import run_status

    _setup_logging()
    raise typer.Exit(run_status())


@app.command()
def install_agent(plist: Optional[str] = None) -> None:
    from wepaper.launchd import install_launch_agent

    _setup_logging()
    install_launch_agent(plist)
