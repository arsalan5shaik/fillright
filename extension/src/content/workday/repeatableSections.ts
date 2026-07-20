import type { EducationEntry, WorkExperienceEntry } from "../../lib/types";
import { markField } from "./confidenceUi";
import { getAssociatedLabelText, isVisible, setFieldValue } from "./formUtils";
import { findScopedComboboxTrigger, selectComboboxOption } from "./workdayCombobox";

/** Workday's repeatable sections (Work Experience, Education, Websites)
 * don't show any fields at all until you click "Add"/"Add Another" - the
 * fill engine only ever fills fields that already exist in the DOM, so
 * these sections were silently skipped entirely. Confirmed from live
 * markup: each section is a `[role="group"]` wrapping an `<h4>` title, zero
 * or more existing entries as nested `[role="group"][aria-labelledby*=
 * "-panel"]` groups, and a `button[data-automation-id="add-button"]` whose
 * visible text is "Add" (no entries yet) or "Add Another" (one already
 * exists) - the automation id is stable across both, unlike the button
 * text. */

function findSectionContainer(titlePattern: RegExp): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, legend")).find((el) =>
    titlePattern.test(el.textContent?.trim() ?? ""),
  );
  return heading?.closest('[role="group"]') ?? null;
}

function findAddButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('[data-automation-id="add-button"]');
}

function findPanels(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="group"][aria-labelledby*="-panel"]'));
}

function waitFor<T>(check: () => T | null, timeoutMs: number, intervalMs = 100): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const result = check();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** Fills the first empty, visible text/textarea within `panel` whose label
 * matches `labelPattern` - scoped to this one entry's panel so "Start Date"
 * in entry 2 never gets confused with "Start Date" in entry 1. */
function fillScopedField(panel: HTMLElement, labelPattern: RegExp, value: string | null | undefined): boolean {
  if (!value) return false;

  const fields = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const target = fields.find((el) => {
    if (!isVisible(el) || el.value.trim() !== "") return false;
    const label = getAssociatedLabelText(el);
    return label !== null && labelPattern.test(label);
  });
  if (!target) return false;

  setFieldValue(target, value);
  markField(target, "high");
  return true;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses a résumé date string ("Feb 2019", "02/2019", "2019") into month
 * (1-12, or null when only a year is given) + year. Returns null if there's
 * no recognizable year. */
function parseMonthYear(raw: string): { month: number | null; year: number } | null {
  const s = raw.trim().toLowerCase();
  const named = s.match(/([a-z]{3,})\.?\s+(\d{4})/);
  if (named) return { month: MONTHS[named[1].slice(0, 3)] ?? null, year: parseInt(named[2], 10) };
  const numeric = s.match(/(\d{1,2})[/\-](\d{4})/);
  if (numeric) return { month: parseInt(numeric[1], 10), year: parseInt(numeric[2], 10) };
  const yearOnly = s.match(/\b(\d{4})\b/);
  if (yearOnly) return { month: null, year: parseInt(yearOnly[1], 10) };
  return null;
}

function isPresentDate(raw: string | null | undefined): boolean {
  return !!raw && /present|current|now|ongoing/i.test(raw);
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

/** Workday's date sections are role="spinbutton" inputs that manage their own
 * value from keystrokes - plain value-setting (setFieldValue) doesn't update
 * their display or clear the "required" error. This simulates typing each
 * digit (keydown + native value set + input + keyup) so the widget registers
 * the change, matching how a real user fills it. */
function typeIntoSpinbutton(input: HTMLInputElement, text: string): void {
  input.focus();
  let acc = "";
  for (const ch of text) {
    acc += ch;
    const init: KeyboardEventInit = { key: ch, code: `Digit${ch}`, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, acc);
    } else {
      input.value = acc;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", init));
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Text describing a date field group (its formField automation-id + label),
 * used to tell a From/start section apart from a To/end section. */
function dateGroupContext(group: HTMLElement): string {
  const aid = group.getAttribute("data-automation-id") ?? "";
  const label = group.querySelector("label, legend")?.textContent ?? "";
  const labelledBy = (group.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  return `${aid} ${label} ${labelledBy}`.toLowerCase();
}

/** Fills Workday's segmented date widgets in a panel - confirmed from live
 * DOM: inputs with data-automation-id "dateSectionMonth-input" /
 * "dateSectionYear-input" (role="spinbutton"), each inside a
 * "formField-startDate" / "formField-endDate" wrapper. Locates each date
 * field's year input, decides start vs end from its wrapper's context, and
 * fills via simulated typing. For an ongoing role (Present) it checks
 * "I currently work here" instead of filling the end date. */
function fillPanelDates(
  panel: HTMLElement,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  endIsPresent: boolean,
): void {
  const yearInputs = Array.from(
    panel.querySelectorAll<HTMLInputElement>('input[data-automation-id="dateSectionYear-input"]'),
  );
  for (const yearInput of yearInputs) {
    if (yearInput.value.trim() !== "") continue;
    const group =
      yearInput.closest<HTMLElement>('[data-automation-id^="formField"]') ?? yearInput.closest<HTMLElement>('[role="group"]');
    const context = group ? dateGroupContext(group) : "";

    let dateStr: string | null | undefined;
    let isEnd = false;
    if (/start|from|first/.test(context)) {
      dateStr = startDate;
    } else if (/end|\bto\b|actual|expected|last/.test(context)) {
      isEnd = true;
      dateStr = endDate;
    } else {
      continue; // can't confidently tell which date this is - leave it
    }

    if (isEnd && endIsPresent) {
      markCurrentlyWorkHere(panel);
      continue;
    }

    const parsed = dateStr ? parseMonthYear(dateStr) : null;
    if (!parsed) continue;

    const monthInput = group?.querySelector<HTMLInputElement>('input[data-automation-id="dateSectionMonth-input"]');
    if (monthInput && parsed.month !== null && monthInput.value.trim() === "") {
      typeIntoSpinbutton(monthInput, String(parsed.month).padStart(2, "0"));
      markField(monthInput, "high");
    }
    typeIntoSpinbutton(yearInput, String(parsed.year));
    markField(yearInput, "high");
  }
}

/** Checks the panel's "I currently work here" box instead of filling an end
 * date, when the résumé lists the role as ongoing (Present/Current). */
function markCurrentlyWorkHere(panel: HTMLElement): void {
  const checkbox = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((el) => {
    if (!isVisible(el) || el.checked) return false;
    const label = getAssociatedLabelText(el);
    return label !== null && /currently work here|i currently work/i.test(label);
  });
  if (checkbox) {
    checkbox.click();
    markField(checkbox, "high");
  }
}

const DEGREE_LEVELS: { test: RegExp; candidates: string[]; filterTerm: string }[] = [
  { test: /ph\.?d|doctor|d\.phil/i, candidates: ["Doctorate", "Doctor of Philosophy", "PhD", "Ph.D."], filterTerm: "Doctor" },
  { test: /mba|m\.b\.a/i, candidates: ["Master of Business Administration", "MBA", "Master's Degree"], filterTerm: "Master" },
  {
    test: /master|m\.s|m\.a|msc|m\.eng/i,
    candidates: ["Master's Degree", "Master of Science", "Master of Arts", "Master of Engineering", "Master"],
    filterTerm: "Master",
  },
  {
    test: /bachelor|b\.s|b\.a|bsc|b\.eng|undergrad/i,
    candidates: ["Bachelor's Degree", "Bachelor of Science", "Bachelor of Arts", "Bachelor of Engineering", "Bachelor"],
    filterTerm: "Bachelor",
  },
  { test: /associate|a\.s|a\.a/i, candidates: ["Associate's Degree", "Associate of Science", "Associate"], filterTerm: "Associate" },
  { test: /high school|diploma|ged|secondary/i, candidates: ["High School Diploma", "GED", "High School"], filterTerm: "High School" },
];

/** Maps a résumé degree string ("B.S. Computer Science") to the set of option
 * phrasings a Workday degree combobox is likely to use ("Bachelor's Degree",
 * "Bachelor of Science", …) plus a broad filter term ("Bachelor") to narrow
 * the option list without filtering out the exact match. */
function degreeCandidates(degree: string): { candidates: string[]; filterTerm: string } {
  const level = DEGREE_LEVELS.find((l) => l.test.test(degree));
  if (level) return { candidates: level.candidates, filterTerm: level.filterTerm };
  return { candidates: [degree], filterTerm: degree.split(/\s+/)[0] };
}

/** Degree is a Workday combobox ("Select One") in most tenants; picks the
 * matching option scoped to this Education panel. Falls back to a plain text
 * field if the tenant renders degree as free text instead. */
async function fillScopedDegree(panel: HTMLElement, degree: string | null | undefined): Promise<boolean> {
  if (!degree) return false;
  const trigger = findScopedComboboxTrigger(panel, /degree/i, getAssociatedLabelText);
  if (trigger) {
    const { candidates, filterTerm } = degreeCandidates(degree);
    return selectComboboxOption(trigger, candidates, filterTerm);
  }
  return fillScopedField(panel, /degree/i, degree);
}

/** Location in a work-experience entry is sometimes a plain text field and
 * sometimes a typeahead combobox; tries text first, then the combobox. Only
 * acts when the résumé actually has a location for the role. */
async function fillScopedLocation(panel: HTMLElement, location: string | null | undefined): Promise<boolean> {
  if (!location) return false;
  if (fillScopedField(panel, /^location$|city/i, location)) return true;
  const trigger = findScopedComboboxTrigger(panel, /location|city/i, getAssociatedLabelText);
  if (trigger) return selectComboboxOption(trigger, [location], location);
  return false;
}

/** Clicks "Add"/"Add Another" only as many times as needed to reach
 * `entries.length` panels (reusing an already-present default panel rather
 * than adding an extra one), filling each entry into the panel that
 * corresponds to it. Re-queries the add button and panel list fresh each
 * iteration rather than caching them, since clicking Add re-renders the
 * section. */
async function addEntriesAndFill<T>(
  titlePattern: RegExp,
  entries: T[],
  fillEntry: (panel: HTMLElement, entry: T) => void | Promise<void>,
): Promise<number> {
  if (entries.length === 0) return 0;

  // Waits for the section to actually appear rather than checking once -
  // confirmed live that a step's sections can still be rendering when this
  // runs (the step's own heading and layout render first, Work
  // Experience/Education/etc. arrive slightly later), and a single
  // synchronous check at the wrong moment silently found nothing and gave
  // up without ever clicking Add.
  const container = await waitFor(() => findSectionContainer(titlePattern), 2000);
  if (!container) return 0;

  let filled = 0;
  for (let i = 0; i < entries.length; i++) {
    const existingCount = findPanels(container).length;
    if (existingCount <= i) {
      const addButton = findAddButton(container);
      if (!addButton) break;
      addButton.click();
      const appeared = await waitFor(() => (findPanels(container).length > existingCount ? true : null), 1500);
      if (!appeared) break;
    }

    // Fill the i-th panel, not the last one: if a step pre-renders more
    // default panels than there are entries, panels[length-1] would skip the
    // early ones (leaving slot 1 blank while filling later slots).
    const panel = findPanels(container)[i];
    if (!panel) continue;

    await fillEntry(panel, entries[i]);
    filled++;
  }

  return filled;
}

export async function fillWorkExperienceSection(entries: WorkExperienceEntry[]): Promise<number> {
  return addEntriesAndFill(/^work experience$/i, entries, async (panel, entry) => {
    fillScopedField(panel, /company|employer/i, entry.company);
    fillScopedField(panel, /job title|\btitle\b/i, entry.title);
    fillPanelDates(panel, entry.start_date, entry.end_date, isPresentDate(entry.end_date));
    await fillScopedLocation(panel, entry.location);
    fillScopedField(panel, /role description|description|responsibilities/i, entry.bullets.join("\n"));
  });
}

export async function fillEducationSection(entries: EducationEntry[]): Promise<number> {
  return addEntriesAndFill(/^education$/i, entries, async (panel, entry) => {
    fillScopedField(panel, /school|institution|university/i, entry.institution);
    await fillScopedDegree(panel, entry.degree);
    fillScopedField(panel, /field of study|major/i, entry.field_of_study);
    fillPanelDates(panel, entry.start_date, entry.end_date, false);
  });
}

export interface WebsiteEntry {
  label: string;
  url: string;
}

/** Same Add-gated pattern as Work Experience/Education, confirmed for
 * those two sections but not independently verified for Websites - the
 * per-panel field structure here (plain URL input vs. a type dropdown +
 * URL) is a guess; a field that doesn't match either scoped pattern is
 * simply left blank rather than risking a wrong value. */
export async function fillWebsitesSection(entries: WebsiteEntry[]): Promise<number> {
  return addEntriesAndFill(/^websites?$/i, entries, (panel, entry) => {
    if (!fillScopedField(panel, /url|website|link/i, entry.url)) {
      fillScopedField(panel, new RegExp(entry.label, "i"), entry.url);
    }
  });
}
