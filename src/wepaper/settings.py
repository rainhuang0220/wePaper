from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WEPAPER_", extra="ignore")

    data_dir: Path = Path("./data")
    sync_token: str = ""
    max_upload_bytes: int = 80 * 1024 * 1024
    public_url: str = "http://127.0.0.1:8788"
    host: str = "127.0.0.1"
    port: int = 8788
    log_level: str = "info"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "wepaper.sqlite"

    @property
    def blob_dir(self) -> Path:
        return self.data_dir / "blobs"

    @property
    def web_dir(self) -> Path:
        return Path(__file__).resolve().parents[2] / "web" / "dist"
