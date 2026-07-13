const MARK_ATTR = "data-fillright-marked";

/** Visually distinguishes fields FillRight is confident about (direct
 * profile-data matches) from ones it guessed on (fuzzy label match or an
 * inferred value like JD location), so the user knows what to double-check
 * before submitting - never auto-submits anything regardless of confidence. */
export function markField(el: HTMLElement, confidence: "high" | "low"): void {
  el.setAttribute(MARK_ATTR, confidence);
  el.style.outline = confidence === "high" ? "2px solid #2e7d32" : "2px dashed #f9a825";
  el.style.outlineOffset = "1px";
  el.title =
    confidence === "high"
      ? "FillRight: filled from your saved profile"
      : "FillRight: guessed - please double-check this field";
}
