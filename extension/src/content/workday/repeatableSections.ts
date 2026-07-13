import type { EducationEntry, WorkExperienceEntry } from "../../lib/types";
import { markField } from "./confidenceUi";
import { getAssociatedLabelText, isVisible, setFieldValue } from "./formUtils";

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

/** Fills the first empty, visible field within `panel` whose label matches
 * `labelPattern` - scoped to this one entry's panel so "Start Date" in
 * entry 2 never gets confused with "Start Date" in entry 1. */
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

/** Clicks "Add"/"Add Another" only as many times as needed to reach
 * `entries.length` panels (reusing an already-present default panel rather
 * than adding an extra one), filling each entry into the panel that
 * corresponds to it. Re-queries the add button and panel list fresh each
 * iteration rather than caching them, since clicking Add re-renders the
 * section. */
async function addEntriesAndFill<T>(
  titlePattern: RegExp,
  entries: T[],
  fillEntry: (panel: HTMLElement, entry: T) => void,
): Promise<number> {
  const container = findSectionContainer(titlePattern);
  if (!container || entries.length === 0) return 0;

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

    fillEntry(panel, entries[i]);
    filled++;
  }

  return filled;
}

export async function fillWorkExperienceSection(entries: WorkExperienceEntry[]): Promise<number> {
  return addEntriesAndFill(/^work experience$/i, entries, (panel, entry) => {
    fillScopedField(panel, /company|employer/i, entry.company);
    fillScopedField(panel, /job title|\btitle\b/i, entry.title);
    fillScopedField(panel, /start date/i, entry.start_date);
    fillScopedField(panel, /end date/i, entry.end_date);
    fillScopedField(panel, /location/i, entry.location);
    fillScopedField(panel, /role description|description/i, entry.bullets.join("\n"));
  });
}

export async function fillEducationSection(entries: EducationEntry[]): Promise<number> {
  return addEntriesAndFill(/^education$/i, entries, (panel, entry) => {
    fillScopedField(panel, /school|institution|university/i, entry.institution);
    fillScopedField(panel, /degree/i, entry.degree);
    fillScopedField(panel, /field of study|major/i, entry.field_of_study);
    fillScopedField(panel, /start date/i, entry.start_date);
    fillScopedField(panel, /end date/i, entry.end_date);
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
