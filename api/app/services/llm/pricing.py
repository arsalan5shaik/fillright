"""Approximate USD cost per 1M tokens, (input, output). Directional, for the
llm_usage_log cost_estimate_usd column — update as real invoiced rates come in.
Unknown models cost 0 rather than guessing.
"""

MODEL_PRICING_PER_MILLION: dict[str, tuple[float, float]] = {
    "gpt-5-nano": (0.05, 0.40),
    "gemini-3.1-flash-lite": (0.05, 0.30),
    "text-embedding-3-small": (0.02, 0.0),
}


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    input_rate, output_rate = MODEL_PRICING_PER_MILLION.get(model, (0.0, 0.0))
    return (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000
