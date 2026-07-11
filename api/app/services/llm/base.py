from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar

from pydantic import BaseModel


class LLMError(Exception):
    """Raised for any provider-side failure, so callers never branch on provider."""


@dataclass
class LLMResult:
    model: str
    input_tokens: int
    output_tokens: int
    text: str | None = None
    parsed: BaseModel | None = None
    embedding: list[float] | None = None


class LLMAdapter(ABC):
    """One implementation per provider. Never called directly by services —
    only through services.llm.client, which resolves task -> (adapter, model)
    via the registry and handles usage logging uniformly."""

    provider_name: ClassVar[str]

    @abstractmethod
    def generate_text(self, prompt: str, model: str, *, system: str | None = None) -> LLMResult: ...

    @abstractmethod
    def generate_structured(
        self, prompt: str, schema: type[BaseModel], model: str, *, system: str | None = None
    ) -> LLMResult: ...

    @abstractmethod
    def generate_embedding(self, text: str, model: str) -> LLMResult: ...
