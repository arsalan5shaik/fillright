import { markField } from "./confidenceUi";
import type { UnmatchedTextField } from "./fillEngine";
import { setFieldValue } from "./formUtils";

const SKILLS_LABEL_PATTERN = /\bskills?\b/i;
const MAX_KEYWORDS = 8;

function dispatchEnterKey(el: HTMLElement): void {
  const eventInit: KeyboardEventInit = { key: "Enter", code: "Enter", bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

/** A "skills" field asks for individual keyword tags, not a prose
 * paragraph - routing it through the free-text answer-bank/AI resolver
 * (which doesn't know the field expects short discrete terms) produces
 * exactly that mismatch. Uses the JD's own extracted skill/technology
 * keywords instead (already short terms like "Python", "AWS" - see
 * jd_analyzer.py's keyword_extraction prompt), typing each one and
 * committing it with Enter, the standard tag/chip-input pattern. If the
 * field doesn't clear after Enter (not actually a chip input), falls back
 * to one comma-separated value rather than leaving it empty. */
export function fillSkillsQuestion(field: UnmatchedTextField, jdKeywords: string[]): boolean {
  if (!SKILLS_LABEL_PATTERN.test(field.labelText) || jdKeywords.length === 0) return false;

  const { element } = field;
  const selected = jdKeywords.slice(0, MAX_KEYWORDS);

  let committedAny = false;
  for (const keyword of selected) {
    setFieldValue(element, keyword);
    dispatchEnterKey(element);
    if (element.value.trim() === "") {
      committedAny = true;
    } else {
      break;
    }
  }

  if (!committedAny) {
    setFieldValue(element, selected.join(", "));
  }

  markField(element, "low");
  return true;
}
