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
3. Per-app setup instructions land in `extension/`, `web/`, `api/` as each is scaffolded.
