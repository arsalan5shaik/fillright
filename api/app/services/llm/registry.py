from app.core.config import get_settings
from app.services.llm.adapters.gemini_adapter import GeminiAdapter
from app.services.llm.adapters.openai_adapter import OpenAIAdapter
from app.services.llm.base import LLMAdapter, LLMError

_ADAPTER_CLASSES: dict[str, type[LLMAdapter]] = {
    "openai": OpenAIAdapter,
    "google": GeminiAdapter,
}

_PROVIDER_API_KEY_FIELD = {
    "openai": "openai_api_key",
    "google": "gemini_api_key",
}

_adapter_cache: dict[str, LLMAdapter] = {}


def _get_adapter(provider: str) -> LLMAdapter:
    if provider not in _adapter_cache:
        adapter_cls = _ADAPTER_CLASSES.get(provider)
        if adapter_cls is None:
            raise LLMError(
                f"Unknown LLM provider '{provider}'. Known providers: {sorted(_ADAPTER_CLASSES)}"
            )

        key_field = _PROVIDER_API_KEY_FIELD[provider]
        api_key = getattr(get_settings(), key_field)
        if not api_key:
            raise LLMError(f"Missing API key for provider '{provider}' (expected {key_field})")

        _adapter_cache[provider] = adapter_cls(api_key=api_key)

    return _adapter_cache[provider]


def get_adapter_for_task(task: str) -> tuple[LLMAdapter, str]:
    """Resolve a task name (e.g. 'qa_resolver') to (adapter, model) using the
    '{task}_model' setting, formatted as 'provider:model'."""
    config_field = f"{task}_model"
    config_value = getattr(get_settings(), config_field, None)
    if not config_value:
        raise LLMError(f"No model configured for task '{task}' (expected setting '{config_field}')")

    provider, sep, model = config_value.partition(":")
    if not sep:
        raise LLMError(
            f"Invalid model config '{config_value}' for task '{task}' — expected 'provider:model'"
        )

    return _get_adapter(provider), model
