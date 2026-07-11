from google import genai
from google.genai import types
from pydantic import BaseModel

from app.services.llm.base import LLMAdapter, LLMError, LLMResult


class GeminiAdapter(LLMAdapter):
    provider_name = "google"

    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    def generate_text(self, prompt: str, model: str, *, system: str | None = None) -> LLMResult:
        config = types.GenerateContentConfig(system_instruction=system) if system else None
        try:
            response = self._client.models.generate_content(
                model=model, contents=prompt, config=config
            )
        except Exception as exc:
            raise LLMError(f"Gemini generate_text failed: {exc}") from exc

        usage = response.usage_metadata
        return LLMResult(
            model=model,
            input_tokens=usage.prompt_token_count or 0,
            output_tokens=usage.candidates_token_count or 0,
            text=response.text,
        )

    def generate_structured(
        self, prompt: str, schema: type[BaseModel], model: str, *, system: str | None = None
    ) -> LLMResult:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            response = self._client.models.generate_content(
                model=model, contents=prompt, config=config
            )
        except Exception as exc:
            raise LLMError(f"Gemini generate_structured failed: {exc}") from exc

        usage = response.usage_metadata
        return LLMResult(
            model=model,
            input_tokens=usage.prompt_token_count or 0,
            output_tokens=usage.candidates_token_count or 0,
            parsed=response.parsed,
        )

    def generate_embedding(self, text: str, model: str) -> LLMResult:
        try:
            response = self._client.models.embed_content(model=model, contents=text)
        except Exception as exc:
            raise LLMError(f"Gemini generate_embedding failed: {exc}") from exc

        embedding = response.embeddings[0]
        return LLMResult(
            model=model,
            input_tokens=embedding.statistics.token_count if embedding.statistics else 0,
            output_tokens=0,
            embedding=embedding.values,
        )
