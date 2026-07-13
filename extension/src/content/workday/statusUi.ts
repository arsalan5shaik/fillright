const BOX_ID = "fillright-status-box";

interface StatusBoxElements {
  container: HTMLDivElement;
  message: HTMLDivElement;
  barOuter: HTMLDivElement;
  barInner: HTMLDivElement;
}

function ensureBox(): StatusBoxElements {
  const existing = document.getElementById(BOX_ID) as HTMLDivElement | null;
  if (existing) {
    return {
      container: existing,
      message: existing.querySelector<HTMLDivElement>("[data-role='message']")!,
      barOuter: existing.querySelector<HTMLDivElement>("[data-role='bar-outer']")!,
      barInner: existing.querySelector<HTMLDivElement>("[data-role='bar-inner']")!,
    };
  }

  const container = document.createElement("div");
  container.id = BOX_ID;
  container.style.cssText =
    "position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; background: #111; color: #fff; " +
    "padding: 12px 14px; border-radius: 8px; font: 13px system-ui, sans-serif; width: 260px; " +
    "box-shadow: 0 2px 8px rgba(0,0,0,0.3);";

  const title = document.createElement("div");
  title.style.cssText = "font-weight: 600; margin-bottom: 4px;";
  title.textContent = "FillRight";

  const message = document.createElement("div");
  message.dataset.role = "message";
  message.style.cssText = "margin-bottom: 8px; opacity: 0.9; line-height: 1.4;";

  const barOuter = document.createElement("div");
  barOuter.dataset.role = "bar-outer";
  barOuter.style.cssText = "background: #333; border-radius: 4px; height: 6px; overflow: hidden; display: none;";

  const barInner = document.createElement("div");
  barInner.dataset.role = "bar-inner";
  barInner.style.cssText = "background: #4caf50; height: 100%; width: 0%; transition: width 0.3s ease;";

  barOuter.appendChild(barInner);
  container.append(title, message, barOuter);
  document.body.appendChild(container);

  return { container, message, barOuter, barInner };
}

/** Plain status line, bar hidden - used for messages that don't map to a
 * discrete step (Q&A/file-attach results, errors). */
export function showStatus(message: string): void {
  const els = ensureBox();
  els.message.textContent = message;
  els.barOuter.style.display = "none";
}

/** Status line + a real progress bar, for flows with known discrete steps
 * (the JD scan pipeline, the application-form fill pipeline). */
export function showProgress(message: string, percent: number): void {
  const els = ensureBox();
  els.message.textContent = message;
  els.barOuter.style.display = "block";
  els.barInner.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

const START_BUTTON_ROLE = "start-button";

/** Shown on job-posting pages instead of scanning automatically - scanning
 * costs a real LLM call, so it should be something the user opts into for
 * this specific posting, not something that fires just from visiting the
 * page. */
export function showStartButton(onStart: () => void): void {
  const els = ensureBox();
  els.message.textContent = "Job posting detected. Ready to scan and tailor your resume?";
  els.barOuter.style.display = "none";

  let button = els.container.querySelector<HTMLButtonElement>(`[data-role="${START_BUTTON_ROLE}"]`);
  if (button) return; // already showing - don't stack duplicate buttons on repeat calls

  button = document.createElement("button");
  button.dataset.role = START_BUTTON_ROLE;
  button.textContent = "Start";
  button.style.cssText =
    "background: #4caf50; color: #fff; border: none; border-radius: 4px; " +
    "padding: 6px 16px; cursor: pointer; font: inherit; font-weight: 600;";
  button.addEventListener("click", () => {
    button!.remove();
    onStart();
  });
  els.container.appendChild(button);
}
