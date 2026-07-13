from openai import OpenAI
from pydantic import BaseModel

from app.services.llm.base import LLMAdapter, LLMError, LLMResult

# GPT-5/o-series models are reasoning models that default to a non-trivial
# amount of hidden reasoning even on "nano"/"mini" tiers - measured 6s vs
# 1.6s for the same prompt at default vs "minimal" effort. None of our tasks
# (extraction, reformatting, short generation) need that deliberation, and
# the resume-tailoring fabrication guardrail already retries once if the
# output doesn't hold up, so minimal effort is a safe default. Only applied
# to models that actually support the parameter - passing it to a
# non-reasoning model (e.g. gpt-4o-mini) is a hard 400 error, and task/model
# routing is config-driven, so a future env-var swap must not break this.
_REASONING_MODEL_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def _completion_kwargs(model: str) -> dict:
    return {"reasoning_effort": "minimal"} if model.startswith(_REASONING_MODEL_PREFIXES) else {}


def _messages(prompt: str, system: str | None) -> list[dict]:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


class OpenAIAdapter(LLMAdapter):
    provider_name = "openai"

    def __init__(self, api_key: str) -> None:
        self._client = OpenAI(api_key=api_key)

    def generate_text(self, prompt: str, model: str, *, system: str | None = None) -> LLMResult:
        try:
            response = self._client.chat.completions.create(
                model=model, messages=_messages(prompt, system), **_completion_kwargs(model)
            )
        except Exception as exc:
            raise LLMError(f"OpenAI generate_text failed: {exc}") from exc

        return LLMResult(
            model=model,
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            text=response.choices[0].message.content,
        )

    def generate_structured(
        self, prompt: str, schema: type[BaseModel], model: str, *, system: str | None = None
    ) -> LLMResult:
        try:
            response = self._client.chat.completions.parse(
                model=model,
                messages=_messages(prompt, system),
                response_format=schema,
                **_completion_kwargs(model),
            )
        except Exception as exc:
            raise LLMError(f"OpenAI generate_structured failed: {exc}") from exc

        return LLMResult(
            model=model,
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            parsed=response.choices[0].message.parsed,
        )

    def generate_embedding(self, text: str, model: str) -> LLMResult:
        try:
            response = self._client.embeddings.create(model=model, input=text)
        except Exception as exc:
            raise LLMError(f"OpenAI generate_embedding failed: {exc}") from exc

        return LLMResult(
            model=model,
            input_tokens=response.usage.prompt_tokens,
            output_tokens=0,
            embedding=response.data[0].embedding,
        )
