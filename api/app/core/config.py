from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ROOT / ".env", extra="ignore")

    # Provider-scoped API keys
    openai_api_key: str
    gemini_api_key: str | None = None

    # Per-task model routing, "provider:model". One line to change per task,
    # no code changes needed.
    resume_parsing_model: str = "openai:gpt-5-nano"
    keyword_extraction_model: str = "openai:gpt-5-nano"
    resume_tailoring_model: str = "openai:gpt-5-nano"
    cover_letter_model: str = "openai:gpt-5-nano"
    qa_resolver_model: str = "google:gemini-3.1-flash-lite"
    embedding_model: str = "openai:text-embedding-3-small"

    supabase_url: str
    supabase_service_role_key: str
    supabase_db_url: str
    supabase_jwt_secret: str | None = None
    answer_encryption_key: str | None = None
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
