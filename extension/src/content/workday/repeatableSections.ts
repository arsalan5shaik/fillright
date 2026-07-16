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

/** The field wrapper around a labelled control - Workday nests each control
 * inside a `data-automation-id="formField-…"` div; falls back to the label's
 * parent when that convention isn't present. */
function findFieldGroupByLabel(panel: HTMLElement, labelPattern: RegExp): HTMLElement | null {
  const labelEl = Array.from(panel.querySelectorAll<HTMLElement>("label, legend")).find((el) =>
    labelPattern.test(el.textContent?.trim() ?? ""),
  );
  if (!labelEl) return null;
  return labelEl.closest<HTMLElement>('[data-automation-id^="formField"]') ?? labelEl.parentElement;
}

/** Workday renders a date as segmented spinbutton inputs (MM / YYYY) rather
 * than one text field; this finds the month or year sub-input within a date
 * field group by its automation-id / aria-label / placeholder. */
function findDateSubInput(group: HTMLElement, kind: "month" | "year"): HTMLInputElement | null {
  const inputs = Array.from(group.querySelectorAll<HTMLInputElement>("input"));
  return (
    inputs.find((el) => {
      const hay = `${el.getAttribute("data-automation-id") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${
        el.getAttribute("placeholder") ?? ""
      }`.toLowerCase();
      return kind === "month" ? /month|\bmm\b/.test(hay) : /year|\byyyy\b/.test(hay);
    }) ?? null
  );
}

/** Fills Workday's segmented MM/YYYY date widget for the From/To field whose
 * label matches `labelPattern`. Best-effort against Workday's known date
 * spinbutton conventions; returns false (so the caller can fall back to a
 * plain text fill) if this doesn't look like a spinbutton date widget.
 * NOTE: unverified against this tenant's live date-field HTML - the segmented
 * MM/YYYY structure is a standard Workday component but the exact
 * automation-ids may need one round of live confirmation. */
function fillScopedDate(panel: HTMLElement, labelPattern: RegExp, dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const parsed = parseMonthYear(dateStr);
  if (!parsed) return false;

  const group = findFieldGroupByLabel(panel, labelPattern);
  if (!group) return false;

  const yearInput = findDateSubInput(group, "year");
  if (!yearInput) return false; // not a segmented date widget - let the caller try a text fill

  let did = false;
  const monthInput = findDateSubInput(group, "month");
  if (monthInput && parsed.month !== null && monthInput.value.trim() === "") {
    setFieldValue(monthInput, String(parsed.month));
    markField(monthInput, "high");
    did = true;
  }
  if (yearInput.value.trim() === "") {
    setFieldValue(yearInput, String(parsed.year));
    markField(yearInput, "high");
    did = true;
  }
  return did;
}

/** Date fill with a text fallback: try the segmented widget first, else a
 * plain text field with the same label (some tenants/fields use a text
 * date). */
function fillDateField(panel: HTMLElement, labelPattern: RegExp, dateStr: string | null | undefined): boolean {
  return fillScopedDate(panel, labelPattern, dateStr) || fillScopedField(panel, labelPattern, dateStr);
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

    const panels = findPanels(container);
    const panel = panels[panels.length - 1];
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
    fillDateField(panel, /^from$|start date/i, entry.start_date);
    if (isPresentDate(entry.end_date)) {
      markCurrentlyWorkHere(panel);
    } else {
      fillDateField(panel, /^to$|end date/i, entry.end_date);
    }
    await fillScopedLocation(panel, entry.location);
    fillScopedField(panel, /role description|description|responsibilities/i, entry.bullets.join("\n"));
  });
}

export async function fillEducationSection(entries: EducationEntry[]): Promise<number> {
  return addEntriesAndFill(/^education$/i, entries, async (panel, entry) => {
    fillScopedField(panel, /school|institution|university/i, entry.institution);
    await fillScopedDegree(panel, entry.degree);
    fillScopedField(panel, /field of study|major/i, entry.field_of_study);
    fillDateField(panel, /^from$|start date/i, entry.start_date);
    fillDateField(panel, /^to|end date|actual or expected/i, entry.end_date);
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
