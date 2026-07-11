"""Milestone 2 acceptance check: calls both configured providers for real,
confirms structured + text generation work, and confirms llm_usage_log rows
land with the right provider/model/endpoint. Not an automated pytest test —
it makes real, billed API calls, so it's run manually on demand.

Usage:
    uv run python scripts/llm_smoke_check.py
    QA_RESOLVER_MODEL=openai:gpt-5-nano uv run python scripts/llm_smoke_check.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import get_connection
from app.services.llm.client import call_structured, call_text


class KeywordExtractionCheck(BaseModel):
    keywords: list[str]
    seniority: str


def main() -> None:
    settings = get_settings()
    print(f"keyword_extraction_model = {settings.keyword_extraction_model}")
    print(f"qa_resolver_model        = {settings.qa_resolver_model}")
    print()

    print("=== call_structured('keyword_extraction') ===")
    result = call_structured(
        "keyword_extraction",
        "Extract the ranked skill keywords and seniority level from this job "
        "description: 'We are hiring a Senior Backend Engineer skilled in "
        "Python, PostgreSQL, and distributed systems.'",
        KeywordExtractionCheck,
    )
    print(result)
    print()

    print("=== call_text('qa_resolver') ===")
    text = call_text("qa_resolver", "In one short sentence, what is the capital of France?")
    print(text)
    print()

    print("=== last 2 llm_usage_log rows ===")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select provider, model, endpoint, input_tokens, output_tokens, cost_estimate_usd
                from llm_usage_log
                order by created_at desc
                limit 2;
                """
            )
            for row in cur.fetchall():
                print(row)


if __name__ == "__main__":
    main()
