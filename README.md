# FillRight

AI-assisted job application autofill for Workday. Chrome extension + website + FastAPI backend, built around a Supabase (Postgres + pgvector) profile that gets more reusable over time — every question answered once becomes a saved, reusable answer.

v1 scope: Workday only. Free, no billing yet.

## Repo layout

- `extension/` — Chrome MV3 extension (TypeScript, Vite). Scans Workday job postings, tailors resumes/cover letters, autofills the application wizard.
- `web/` — Next.js website (Vercel). Resume upload/review, common-question answers, answer bank, application history.
- `api/` — FastAPI backend (Render). Resume parsing, JD analysis, resume tailoring, cover letter generation, Q&A resolver, all DB access.
- `supabase/migrations/` — schema + RLS policies, applied in order.
- `supabase/seed.sql` — seeded `common_questions` list.
- `docs/` — supplementary notes (e.g. Workday DOM findings as the extension is built).

## Status

Building milestone-by-milestone per the plan in `docs/`. See conversation history / plan doc for the full 14-milestone sequence.

Current: **Milestone 1 — repo scaffolding + Supabase schema.**

## Local setup

1. Copy `.env.example` to `.env` and fill in Supabase/OpenAI values.
2. Apply `supabase/migrations/*.sql` in order against your Supabase project, then `supabase/seed.sql`.
3. Run each app per **Running locally** below.

## Running locally

Each of the three apps runs independently — open a separate terminal for each.

### API (backend)

```powershell
cd api
uvicorn app.main:app --port 8000 --reload
```

If `uvicorn` isn't recognized, your venv isn't active — use `py -m uv run uvicorn app.main:app --port 8000 --reload` instead. `--reload` picks up backend code changes automatically.

### Website

```powershell
cd web
npm run dev
```

Serves at `http://localhost:3000` (or `3001` if `3000` is already in use — check the terminal output for which port it actually picked).

### Extension

Not a server — it's a build you load/reload in Chrome.

```powershell
cd extension
npx vite build
```

Then in `chrome://extensions`: enable Developer Mode, "Load unpacked" pointing at `extension/dist` (first time only), and click the reload icon after every rebuild. Refresh any already-open tab you're testing in too, since a reload doesn't update content scripts already injected into open tabs.

Alternatively, `npm run dev` runs Vite in watch mode so it rebuilds on save automatically — you still need to reload the extension in Chrome after each change.
