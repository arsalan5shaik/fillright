const HOST_ID = "fillright-status-host";
const WEBSITE_URL = "http://localhost:3000";

export type BadgeState = "ready" | "working" | "done" | "error";
export interface ChecklistItem {
  label: string;
  status: "done" | "active" | "pending";
}

interface PanelRefs {
  root: ShadowRoot;
  host: HTMLElement;
  card: HTMLDivElement;
  launcher: HTMLButtonElement;
  badge: HTMLDivElement;
  jobCard: HTMLDivElement;
  resumeCard: HTMLDivElement;
  autofillBtn: HTMLButtonElement;
  refillBtn: HTMLButtonElement;
  progressWrap: HTMLDivElement;
  bar: HTMLDivElement;
  percent: HTMLSpanElement;
  message: HTMLDivElement;
  checklist: HTMLDivElement;
  keywords: HTMLDivElement;
}

// Rendered inside a Shadow DOM so Workday's stylesheet can't affect it.
const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .card {
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    width: 340px; max-height: 82vh; display: flex; flex-direction: column;
    background: #fff; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 16px;
    box-shadow: 0 12px 40px rgba(15,23,42,0.20);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }
  .launcher {
    position: fixed; bottom: 22px; right: 22px; z-index: 2147483647;
    width: 52px; height: 52px; border-radius: 15px; border: none; cursor: pointer;
    background: linear-gradient(135deg,#34d399,#0891b2); color: #fff; font-weight: 800; font-size: 22px;
    box-shadow: 0 8px 24px rgba(8,145,178,0.45); display: flex; align-items: center; justify-content: center;
    transition: transform .12s ease;
  }
  .launcher:hover { transform: translateY(-2px) scale(1.04); }
  .header { display:flex; align-items:center; gap:9px; padding:13px 15px; border-bottom:1px solid #f1f5f9; }
  .logo { width:24px; height:24px; border-radius:7px; flex:0 0 auto;
    background:linear-gradient(135deg,#34d399,#0891b2); color:#fff; font-weight:800; font-size:14px;
    display:flex; align-items:center; justify-content:center; }
  .title { font-weight:700; font-size:15px; letter-spacing:-0.01em; }
  .spacer { flex:1; }
  .icon-btn { border:none; background:transparent; cursor:pointer; color:#94a3b8; font-size:19px; line-height:1; padding:2px 5px; border-radius:6px; }
  .icon-btn:hover { background:#f1f5f9; color:#475569; }
  .tabs { display:flex; gap:4px; padding:8px 12px 0; border-bottom:1px solid #f1f5f9; }
  .tab { flex:1; text-align:center; font-size:12.5px; font-weight:600; color:#64748b; padding:8px 4px; cursor:pointer;
    border:none; background:transparent; border-bottom:2px solid transparent; }
  .tab.active { color:#0891b2; border-bottom-color:#0891b2; }
  .body { padding:14px 15px; overflow-y:auto; }
  .pane { display:none; }
  .pane.active { display:block; }
  .badge { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:4px 10px;
    border-radius:999px; margin-bottom:12px; }
  .badge .dot { width:7px; height:7px; border-radius:50%; }
  .badge.ready { background:#ecfdf5; color:#047857; } .badge.ready .dot { background:#10b981; }
  .badge.working { background:#eff6ff; color:#1d4ed8; } .badge.working .dot { background:#3b82f6; }
  .badge.done { background:#ecfdf5; color:#047857; } .badge.done .dot { background:#10b981; }
  .badge.error { background:#fef2f2; color:#b91c1c; } .badge.error .dot { background:#ef4444; }
  .job-card { border:1px solid #eef2f6; border-radius:12px; padding:12px; margin-bottom:12px; display:none; }
  .job-company { font-size:12px; color:#64748b; font-weight:600; }
  .job-title { font-size:15px; font-weight:700; margin:2px 0 6px; letter-spacing:-0.01em; }
  .job-salary { font-size:12.5px; font-weight:700; color:#047857; margin-bottom:8px; display:none; }
  .tags { display:flex; flex-wrap:wrap; gap:6px; }
  .tag { font-size:11px; font-weight:600; color:#334155; background:#f1f5f9; border-radius:6px; padding:3px 8px; }
  .resume-card { border:1px solid #eef2f6; border-radius:12px; padding:11px 12px; margin-bottom:12px; display:none; }
  .resume-row { display:flex; align-items:center; gap:8px; }
  .resume-ic { width:26px; height:26px; border-radius:7px; flex:0 0 auto; background:#eef2ff; color:#4f46e5;
    display:flex; align-items:center; justify-content:center; font-size:14px; }
  .resume-meta { flex:1; min-width:0; }
  .resume-label { font-size:11px; color:#64748b; font-weight:600; }
  .resume-name { font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .preview-btn { border:1px solid #e2e8f0; background:#fff; color:#0891b2; cursor:pointer; font-size:12.5px; font-weight:700;
    padding:6px 10px; border-radius:8px; flex:0 0 auto; }
  .preview-btn:hover { background:#f0fdff; border-color:#67e8f9; }
  .tracker-link { display:inline-block; margin-top:9px; font-size:12px; font-weight:600; color:#0891b2; text-decoration:none; }
  .tracker-link:hover { text-decoration:underline; }
  .autofill-btn { width:100%; border:none; cursor:pointer; color:#fff; font-weight:700; font-size:15px;
    padding:13px; border-radius:12px; background:linear-gradient(135deg,#0ea5b7,#0891b2);
    box-shadow:0 2px 6px rgba(8,145,178,0.4); display:none; }
  .autofill-btn:hover { filter:brightness(1.05); } .autofill-btn:active { transform:translateY(1px); }
  .refill-btn { display:none; width:100%; margin-top:10px; border:1px solid #cbd5e1; background:#fff; color:#0891b2;
    cursor:pointer; font-weight:700; font-size:13.5px; padding:11px; border-radius:11px; }
  .refill-btn:hover { background:#f0fdff; border-color:#67e8f9; }
  .progress-wrap { display:none; margin:10px 0 6px; }
  .progress-row { display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#475569; margin-bottom:5px; }
  .track { height:8px; border-radius:999px; background:#eef2f6; overflow:hidden; }
  .bar { height:100%; width:0%; border-radius:999px; background:linear-gradient(90deg,#34d399,#0891b2); transition:width .35s ease; }
  .message { font-size:12px; line-height:1.5; color:#64748b; margin-top:10px; }
  .dash-title { font-size:13px; font-weight:700; margin:14px 0 8px; }
  .checklist { display:flex; flex-direction:column; gap:7px; }
  .check { display:flex; align-items:center; gap:9px; font-size:12.5px; color:#334155; }
  .check .ic { width:18px; height:18px; border-radius:50%; flex:0 0 auto; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; }
  .check.done .ic { background:#10b981; color:#fff; }
  .check.active .ic { border:2px solid #0891b2; color:#0891b2; }
  .check.pending .ic { border:2px solid #cbd5e1; color:transparent; }
  .check.pending { color:#94a3b8; }
  .kw-score { font-size:13px; font-weight:700; margin-bottom:10px; }
  .kw-list { display:flex; flex-direction:column; gap:6px; }
  .kw { display:flex; align-items:center; gap:8px; font-size:12.5px; }
  .kw .ic { width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; flex:0 0 auto; }
  .kw.hit .ic { background:#10b981; color:#fff; } .kw.hit { color:#334155; }
  .kw.miss .ic { border:2px solid #f59e0b; color:transparent; } .kw.miss { color:#94a3b8; }
  .kw-preview { display:none; width:100%; margin-top:12px; border:1px solid #e2e8f0; background:#fff; color:#0891b2;
    cursor:pointer; font-size:13px; font-weight:700; padding:9px; border-radius:10px; }
  .kw-preview:hover { background:#f0fdff; border-color:#67e8f9; }
  .profile-link { display:inline-block; text-decoration:none; text-align:center; width:100%;
    background:linear-gradient(135deg,#0ea5b7,#0891b2); color:#fff; font-weight:600; font-size:13px; padding:10px; border-radius:10px; }
  .muted { color:#94a3b8; font-size:12px; }
`;

function ensurePanel(): PanelRefs {
  const existing = document.getElementById(HOST_ID);
  if (existing?.shadowRoot) return readRefs(existing.shadowRoot);

  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", "Open FillRight");
  launcher.style.display = "none";
  launcher.textContent = "F";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="header">
      <div class="logo">F</div><div class="title">FillRight</div><div class="spacer"></div>
      <button class="icon-btn close" aria-label="Minimize">&times;</button>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="autofill">Autofill</button>
      <button class="tab" data-tab="keywords">Keywords</button>
      <button class="tab" data-tab="profile">Profile</button>
    </div>
    <div class="body">
      <div class="pane active" data-pane="autofill">
        <div class="badge ready"><span class="dot"></span><span data-role="badge-text">Ready</span></div>
        <div class="job-card">
          <div class="job-company" data-role="job-company"></div>
          <div class="job-title" data-role="job-title"></div>
          <div class="job-salary" data-role="job-salary"></div>
          <div class="tags" data-role="tags"></div>
        </div>
        <div class="resume-card">
          <div class="resume-row">
            <div class="resume-ic">&#128196;</div>
            <div class="resume-meta">
              <div class="resume-label">Tailored résumé</div>
              <div class="resume-name" data-role="resume-name">Preparing…</div>
            </div>
            <button class="preview-btn" data-role="resume-preview">Preview</button>
          </div>
          <a class="tracker-link" href="${WEBSITE_URL}/applications" target="_blank" rel="noreferrer">View in job tracker →</a>
        </div>
        <button class="autofill-btn">Autofill this page</button>
        <button class="refill-btn" data-role="refill">&#8635; Autofill this page again</button>
        <div class="progress-wrap">
          <div class="progress-row"><span>Completion</span><span data-role="percent">0%</span></div>
          <div class="track"><div class="bar"></div></div>
        </div>
        <div class="message"></div>
        <div class="dash-title" data-role="dash-title" style="display:none">Application Dashboard</div>
        <div class="checklist"></div>
      </div>
      <div class="pane" data-pane="keywords">
        <div class="kw-score muted">Scan a job posting to see your keyword match.</div>
        <div class="kw-list"></div>
        <button class="kw-preview" data-role="kw-preview">Preview tailored résumé</button>
      </div>
      <div class="pane" data-pane="profile">
        <p class="muted">Your résumé, work history, education, skills, and saved answers live on the FillRight website.</p>
        <a class="profile-link" href="${WEBSITE_URL}" target="_blank" rel="noreferrer">Manage your profile</a>
      </div>
    </div>
  `;
  root.append(style, launcher, card);
  document.body.appendChild(host);

  // Close minimizes to the launcher (so it can be reopened) instead of
  // removing the panel outright - the previous host.remove() left the user
  // with no way to bring FillRight back without reloading the page.
  card.querySelector<HTMLButtonElement>(".close")!.addEventListener("click", () => {
    card.style.display = "none";
    launcher.style.display = "flex";
  });
  launcher.addEventListener("click", () => {
    launcher.style.display = "none";
    card.style.display = "flex";
  });

  card.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      card.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      const name = tab.dataset.tab;
      card.querySelectorAll<HTMLElement>(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
    });
  });

  return readRefs(root);
}

function readRefs(root: ShadowRoot): PanelRefs {
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  return {
    root,
    host: root.host as HTMLElement,
    card: q(".card"),
    launcher: q(".launcher"),
    badge: q(".badge"),
    jobCard: q(".job-card"),
    resumeCard: q(".resume-card"),
    autofillBtn: q(".autofill-btn"),
    refillBtn: q(".refill-btn"),
    progressWrap: q(".progress-wrap"),
    bar: q(".bar"),
    percent: q('[data-role="percent"]'),
    message: q(".message"),
    checklist: q(".checklist"),
    keywords: q(".kw-list"),
  };
}

/** Collapse to just the floating launcher button (used on matched ATS pages
 * that aren't a Workday job posting, so a button is available without a full
 * panel taking over the corner until the user asks for it). */
export function collapseToLauncher(): void {
  const p = ensurePanel();
  p.card.style.display = "none";
  p.launcher.style.display = "flex";
}

export function setBadge(text: string, state: BadgeState): void {
  const p = ensurePanel();
  p.badge.className = `badge ${state}`;
  p.badge.querySelector('[data-role="badge-text"]')!.textContent = text;
}

export function setJobCard(company: string, title: string, tags: string[], salary?: string | null): void {
  const p = ensurePanel();
  p.jobCard.querySelector('[data-role="job-company"]')!.textContent = company;
  p.jobCard.querySelector('[data-role="job-title"]')!.textContent = title;
  const salaryEl = p.jobCard.querySelector<HTMLElement>('[data-role="job-salary"]')!;
  if (salary && salary.trim()) {
    salaryEl.textContent = salary.trim();
    salaryEl.style.display = "block";
  } else {
    salaryEl.style.display = "none";
  }
  const tagWrap = p.jobCard.querySelector('[data-role="tags"]')!;
  tagWrap.innerHTML = "";
  for (const t of tags.filter(Boolean)) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = t;
    tagWrap.appendChild(el);
  }
  p.jobCard.style.display = "block";
}

/** Shows the résumé card with a preview action. `onPreview` opens the tailored
 * résumé PDF (wired by the caller, which alone can message the background for
 * the file bytes). Called on both the posting page and wizard steps. */
export function setResume(name: string | null, onPreview: () => void): void {
  const p = ensurePanel();
  p.resumeCard.querySelector('[data-role="resume-name"]')!.textContent = name?.trim() || "Tailored to this job";
  const wire = (btn: HTMLButtonElement | null) => {
    if (btn) btn.onclick = () => onPreview();
  };
  wire(p.resumeCard.querySelector<HTMLButtonElement>('[data-role="resume-preview"]'));
  const kwPreview = p.root.querySelector<HTMLButtonElement>('[data-role="kw-preview"]');
  if (kwPreview) {
    kwPreview.style.display = "block";
    kwPreview.onclick = () => onPreview();
  }
  p.resumeCard.style.display = "block";
}

// A JD keyword counts as covered when the résumé shares a distinctive token
// with it (not just an exact string match) - "Spark" covers "Apache Spark",
// "AWS" covers "AWS services". Exact-only matching made the score read far
// too low because JD phrases rarely equal résumé skill tokens verbatim.
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9#.+]+/)
    .filter((t) => t.length >= 2);
}

function isCovered(keyword: string, skillTokenSets: Set<string>[], skillLower: Set<string>): boolean {
  const kl = keyword.trim().toLowerCase();
  if (!kl) return false;
  if (skillLower.has(kl)) return true;
  const kt = tokenize(keyword);
  return skillTokenSets.some((st) => kt.some((t) => t.length >= 3 && st.has(t)));
}

/** JD keyword vs. résumé-skill match view (the "Keywords" tab). */
export function setKeywords(jdKeywords: string[], resumeSkills: string[]): void {
  const p = ensurePanel();
  const skillLower = new Set(resumeSkills.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const skillTokenSets = resumeSkills.map((s) => new Set(tokenize(s)));
  const unique = Array.from(new Set(jdKeywords.map((k) => k.trim()).filter(Boolean)));
  const hits = unique.filter((k) => isCovered(k, skillTokenSets, skillLower));
  const scoreEl = p.root.querySelector<HTMLDivElement>(".kw-score")!;
  const pct = unique.length ? Math.round((hits.length / unique.length) * 100) : 0;
  scoreEl.className = "kw-score";
  scoreEl.textContent = unique.length
    ? `Keyword match: ${pct}% (${hits.length}/${unique.length})`
    : "Scan a job posting to see your keyword match.";
  if (!unique.length) scoreEl.classList.add("muted");
  p.keywords.innerHTML = "";
  // Covered first, then gaps - so the user sees what to add at a glance.
  const ordered = [...unique].sort(
    (a, b) => Number(isCovered(b, skillTokenSets, skillLower)) - Number(isCovered(a, skillTokenSets, skillLower)),
  );
  for (const k of ordered) {
    const hit = isCovered(k, skillTokenSets, skillLower);
    const row = document.createElement("div");
    row.className = `kw ${hit ? "hit" : "miss"}`;
    row.innerHTML = `<span class="ic">${hit ? "&checkmark;" : ""}</span><span>${k}</span>`;
    p.keywords.appendChild(row);
  }
}

export function setChecklist(items: ChecklistItem[]): void {
  const p = ensurePanel();
  const dashTitle = p.root.querySelector<HTMLElement>('[data-role="dash-title"]')!;
  dashTitle.style.display = items.length ? "block" : "none";
  p.checklist.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = `check ${item.status}`;
    row.innerHTML = `<span class="ic">${item.status === "done" ? "&checkmark;" : ""}</span><span>${item.label}</span>`;
    p.checklist.appendChild(row);
  }
}

/** Plain status line, progress bar hidden. */
export function showStatus(message: string): void {
  const p = ensurePanel();
  p.message.textContent = message;
  p.progressWrap.style.display = "none";
}

/** Status line + progress bar (the fill/scan pipelines). */
export function showProgress(message: string, percent: number): void {
  const p = ensurePanel();
  const pct = Math.max(0, Math.min(100, percent));
  p.message.textContent = message;
  p.progressWrap.style.display = "block";
  p.bar.style.width = `${pct}%`;
  p.percent.textContent = `${pct}%`;
  setBadge(pct >= 100 ? "Filled" : "Autofilling…", pct >= 100 ? "done" : "working");
}

/** A manual re-trigger, shown on every wizard step. Lets the user re-run the
 * fill for the current step when Workday rendered it late or a field was
 * missed - the fills are idempotent (only empty fields, panels reused) so a
 * re-run won't duplicate anything. */
export function showAutofillAgain(onClick: () => void): void {
  const p = ensurePanel();
  p.refillBtn.style.display = "block";
  p.refillBtn.onclick = () => onClick();
}

/** The primary "Autofill this page" action (shown on a job-posting page). */
export function showStartButton(onStart: () => void): void {
  const p = ensurePanel();
  p.autofillBtn.style.display = "block";
  p.autofillBtn.onclick = () => {
    p.autofillBtn.style.display = "none";
    setBadge("Autofilling…", "working");
    onStart();
  };
}
