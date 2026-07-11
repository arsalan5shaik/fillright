from pydantic import BaseModel

from app.db.session import get_connection
from app.services.llm.pricing import estimate_cost_usd
from app.services.llm.registry import get_adapter_for_task
from app.services.llm.base import LLMResult


def _log_usage(
    *,
    user_id: str | None,
    application_id: str | None,
    provider: str,
    task: str,
    result: LLMResult,
) -> None:
    cost = estimate_cost_usd(result.model, result.input_tokens, result.output_tokens)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into llm_usage_log
                    (user_id, application_id, provider, model, endpoint, input_tokens, output_tokens, cost_estimate_usd)
                values (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    application_id,
                    provider,
                    result.model,
                    task,
                    result.input_tokens,
                    result.output_tokens,
                    cost,
                ),
            )


def call_text(
    task: str,
    prompt: str,
    *,
    system: str | None = None,
    user_id: str | None = None,
    application_id: str | None = None,
) -> str:
    adapter, model = get_adapter_for_task(task)
    result = adapter.generate_text(prompt, model, system=system)
    _log_usage(user_id=user_id, application_id=application_id, provider=adapter.provider_name, task=task, result=result)
    return result.text


def call_structured(
    task: str,
    prompt: str,
    schema: type[BaseModel],
    *,
    system: str | None = None,
    user_id: str | None = None,
    application_id: str | None = None,
) -> BaseModel:
    adapter, model = get_adapter_for_task(task)
    result = adapter.generate_structured(prompt, schema, model, system=system)
    _log_usage(user_id=user_id, application_id=application_id, provider=adapter.provider_name, task=task, result=result)
    return result.parsed


def call_embedding(text: str, *, user_id: str | None = None) -> list[float]:
    adapter, model = get_adapter_for_task("embedding")
    result = adapter.generate_embedding(text, model)
    _log_usage(user_id=user_id, application_id=None, provider=adapter.provider_name, task="embedding", result=result)
    return result.embedding
