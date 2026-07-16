import type { ResolvedAnswer } from "../../lib/types";
import { markField } from "./confidenceUi";
import type { UnmatchedTextField } from "./fillEngine";
import { setFieldValue } from "./formUtils";
import { injectAnswerPanel } from "./qaInlineUi";

// Below this, a label is unlikely to be a real question (e.g. "Zip" or a
// stray structural element FillRight just doesn't recognize) - calling the
// LLM on those would waste a real API call for no benefit.
const MIN_LABEL_LENGTH = 15;

// Fields that expect a specific short/structured value, not a free-text
// essay. Routing these through the answer-bank/AI resolver produces exactly
// the wrong kind of answer - live testing showed a GPA field ("Overall
// Result (GPA)") getting a full essay containing a literal "[Insert GPA]"
// placeholder. These are left blank for the user rather than filled wrong.
const STRUCTURED_FIELD_PATTERNS: RegExp[] = [
  /\bgpa\b|grade point|overall result/i,
  /\bdate\b|\byear\b|\bmonth\b/i,
  /zip|postal code/i,
  /phone|mobile|telephone/i,
  /salary|compensation|hourly rate|desired pay/i,
];

export function isStructuredField(labelText: string): boolean {
  return STRUCTURED_FIELD_PATTERNS.some((pattern) => pattern.test(labelText));
}

// An answer with a fill-in-the-blank placeholder ("[Insert GPA]", "[Company]")
// means the model didn't actually know the value - typing that verbatim into
// the form is worse than leaving it blank.
export function hasPlaceholder(answerText: string): boolean {
  return /\[[^\]]*\]/.test(answerText);
}

type ResolveResponse = { ok: true; data: ResolvedAnswer } | { ok: false; error: string } | undefined;

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function resolveAndFillField({ element, labelText }: UnmatchedTextField): Promise<void> {
  const response = await sendMessage<ResolveResponse>({ type: "RESOLVE_QUESTION", questionText: labelText });
  if (!response || !response.ok) return; // leave the field unfilled - no worse than before this pass ran

  const { answerId, answerText, source } = response.data;
  if (hasPlaceholder(answerText)) return; // don't type a fill-in-the-blank template into the form

  setFieldValue(element, answerText);
  markField(element, "low");

  let isSaved = true;
  let currentText = answerText;

  injectAnswerPanel(element, {
    sourceLabel:
      source === "answer_bank"
        ? "reused your saved answer - review before submitting."
        : "AI-generated - review before submitting.",
    // Answers reused from the bank are already saved from a prior
    // application - nothing new to opt into here, so no toggle shown.
    showSaveToggle: source === "llm_generated",
    initialChecked: true,
    onToggle: (checked) => {
      isSaved = checked;
      void sendMessage(
        checked ? { type: "UPDATE_ANSWER", answerId, answerText: currentText } : { type: "DELETE_ANSWER", answerId },
      );
    },
  });

  // Keeps the saved answer in sync if the user edits the field afterward -
  // otherwise the bank would retain the original LLM text even though
  // something else is what actually gets submitted.
  element.addEventListener("blur", () => {
    if (!isSaved || element.value === currentText) return;
    currentText = element.value;
    void sendMessage({ type: "UPDATE_ANSWER", answerId, answerText: currentText });
  });
}

export async function runQaPass(fields: UnmatchedTextField[]): Promise<number> {
  const candidates = fields.filter(
    (f) => f.labelText.trim().length >= MIN_LABEL_LENGTH && !isStructuredField(f.labelText),
  );
  await Promise.all(candidates.map(resolveAndFillField));
  return candidates.length;
}
