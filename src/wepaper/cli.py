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
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


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


daemon_cli = typer.Typer(help="Run or manage the background sync agent.", no_args_is_help=False)


@daemon_cli.callback(invoke_without_command=True)
def daemon_root(ctx: typer.Context) -> None:
    if ctx.invoked_subcommand is not None:
        return
    from wepaper.agent import run_daemon

    _setup_logging()
    raise typer.Exit(run_daemon())


@daemon_cli.command("install")
def daemon_install(plist: Optional[str] = None) -> None:
    from wepaper.launchd import install_launch_agent

    _setup_logging()
    install_launch_agent(plist)


@daemon_cli.command("uninstall")
def daemon_uninstall() -> None:
    from wepaper.launchd import uninstall_launch_agent

    _setup_logging()
    uninstall_launch_agent()


@daemon_cli.command("status")
def daemon_status() -> None:
    from wepaper.agent import run_status

    _setup_logging()
    raise typer.Exit(run_status())


app.add_typer(daemon_cli, name="daemon")


@app.command()
def status() -> None:
    from wepaper.agent import run_status

    _setup_logging()
    raise typer.Exit(run_status())


@app.command()
def linearize() -> None:
    """Write linearized serve copies of stored PDFs. Does not change sync checksums."""
    from wepaper.linearize import linearize_blob_tree
    from wepaper.settings import Settings

    _setup_logging()
    count = linearize_blob_tree(Settings())
    typer.echo(f"linearized {count}")


@app.command()
def install_agent(plist: Optional[str] = None) -> None:
    from wepaper.launchd import install_launch_agent

    _setup_logging()
    install_launch_agent(plist)


@app.command()
def uninstall_agent() -> None:
    from wepaper.launchd import uninstall_launch_agent

    _setup_logging()
    uninstall_launch_agent()
