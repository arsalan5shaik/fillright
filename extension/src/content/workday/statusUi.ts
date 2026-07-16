const HOST_ID = "fillright-status-host";

interface StatusBoxElements {
  card: HTMLDivElement;
  message: HTMLDivElement;
  barOuter: HTMLDivElement;
  barInner: HTMLDivElement;
  actions: HTMLDivElement;
}

// Rendered inside a Shadow DOM so Workday's own stylesheet can't bleed in and
// break the panel (and vice-versa) - the previous plain-inline-style box was
// at the mercy of the host page's CSS reset/specificity.
const STYLES = `
  :host { all: initial; }
  .card {
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    width: 300px; box-sizing: border-box;
    background: #ffffff; color: #1f2937;
    border: 1px solid #e5e7eb; border-radius: 14px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }
  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px; border-bottom: 1px solid #f1f5f9;
  }
  .logo {
    width: 22px; height: 22px; border-radius: 6px; flex: 0 0 auto;
    background: linear-gradient(135deg, #22d3ee, #0891b2);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 13px;
  }
  .title { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
  .spacer { flex: 1 1 auto; }
  .close {
    border: none; background: transparent; cursor: pointer;
    color: #9ca3af; font-size: 18px; line-height: 1; padding: 2px 4px; border-radius: 6px;
  }
  .close:hover { background: #f3f4f6; color: #4b5563; }
  .body { padding: 12px 14px 14px; }
  .message { font-size: 12.5px; line-height: 1.5; color: #475569; }
  .bar-outer {
    margin-top: 12px; height: 7px; border-radius: 999px;
    background: #eef2f6; overflow: hidden; display: none;
  }
  .bar-inner {
    height: 100%; width: 0%; border-radius: 999px;
    background: linear-gradient(90deg, #22d3ee, #0891b2);
    transition: width 0.35s ease;
  }
  .actions { margin-top: 12px; display: flex; gap: 8px; }
  .actions:empty { display: none; }
  .btn {
    appearance: none; border: none; cursor: pointer;
    background: linear-gradient(135deg, #0ea5b7, #0891b2); color: #fff;
    font-weight: 600; font-size: 13px; padding: 8px 18px; border-radius: 9px;
    box-shadow: 0 1px 2px rgba(8, 145, 178, 0.4);
  }
  .btn:hover { filter: brightness(1.05); }
  .btn:active { transform: translateY(1px); }
`;

function ensureBox(): StatusBoxElements {
  const existingHost = document.getElementById(HOST_ID);
  if (existingHost?.shadowRoot) {
    const root = existingHost.shadowRoot;
    return {
      card: root.querySelector<HTMLDivElement>(".card")!,
      message: root.querySelector<HTMLDivElement>(".message")!,
      barOuter: root.querySelector<HTMLDivElement>(".bar-outer")!,
      barInner: root.querySelector<HTMLDivElement>(".bar-inner")!,
      actions: root.querySelector<HTMLDivElement>(".actions")!,
    };
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="header">
      <div class="logo">F</div>
      <div class="title">FillRight</div>
      <div class="spacer"></div>
      <button class="close" aria-label="Dismiss">&times;</button>
    </div>
    <div class="body">
      <div class="message"></div>
      <div class="bar-outer"><div class="bar-inner"></div></div>
      <div class="actions"></div>
    </div>
  `;

  root.append(style, card);
  document.body.appendChild(host);

  card.querySelector<HTMLButtonElement>(".close")!.addEventListener("click", () => host.remove());

  return {
    card,
    message: card.querySelector<HTMLDivElement>(".message")!,
    barOuter: card.querySelector<HTMLDivElement>(".bar-outer")!,
    barInner: card.querySelector<HTMLDivElement>(".bar-inner")!,
    actions: card.querySelector<HTMLDivElement>(".actions")!,
  };
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

/** Shown alongside the (auto-triggered) scan progress bar on job-posting
 * pages - clicking it drives Workday's own "Apply" button to kick off the
 * application flow, which the extension then autofills automatically once
 * it lands on the wizard/account-creation page. */
export function showStartButton(onStart: () => void): void {
  const els = ensureBox();
  if (els.actions.querySelector(".btn")) return; // already showing - no duplicates

  const button = document.createElement("button");
  button.className = "btn";
  button.textContent = "Start";
  button.addEventListener("click", () => {
    button.remove();
    onStart();
  });
  els.actions.appendChild(button);
}
