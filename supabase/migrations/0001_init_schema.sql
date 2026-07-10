-- FillRight initial schema
-- Assumes Supabase's default extensions (pgcrypto for gen_random_uuid) are already enabled.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- users (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  paid                boolean not null default false,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- resume_profiles
-- ---------------------------------------------------------------------------
create table public.resume_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  profile_name   text not null,
  raw_file_url   text,
  raw_file_type  text check (raw_file_type in ('pdf', 'docx')),
  parsed_json    jsonb,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index resume_profiles_user_id_idx on public.resume_profiles(user_id);

create trigger set_updated_at
  before update on public.resume_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile_fields
-- ---------------------------------------------------------------------------
create table public.profile_fields (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  field_key   text not null,
  field_value text,
  updated_at  timestamptz not null default now(),
  unique (user_id, field_key)
);

create trigger set_updated_at
  before update on public.profile_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- common_questions (global, seeded — see seed.sql)
-- ---------------------------------------------------------------------------
create table public.common_questions (
  id              uuid primary key default gen_random_uuid(),
  question_text   text not null unique,
  category        text not null,
  is_sensitive    boolean not null default false,
  input_type      text not null check (input_type in ('boolean', 'select', 'text', 'number')),
  answer_options  jsonb,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_common_answers
-- ---------------------------------------------------------------------------
create table public.user_common_answers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  common_question_id  uuid not null references public.common_questions(id) on delete cascade,
  answer_value        text,
  is_encrypted        boolean not null default false,
  updated_at          timestamptz not null default now(),
  unique (user_id, common_question_id)
);

create index user_common_answers_user_id_idx on public.user_common_answers(user_id);

create trigger set_updated_at
  before update on public.user_common_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- answer_bank (pgvector similarity search)
-- ---------------------------------------------------------------------------
create table public.answer_bank (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  question_text      text not null,
  question_embedding vector(1536),
  answer_text        text not null,
  source             text not null check (source in ('llm_generated', 'user_written')),
  model_used         text,
  times_reused       integer not null default 0,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz not null default now()
);

create index answer_bank_user_id_idx on public.answer_bank(user_id);
create index answer_bank_embedding_idx
  on public.answer_bank using hnsw (question_embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- applications (per-job-posting cache)
-- ---------------------------------------------------------------------------
create table public.applications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  resume_profile_id    uuid references public.resume_profiles(id) on delete set null,
  company              text not null,
  requisition_id       text,
  job_title            text,
  job_url              text,
  jd_text              text,
  jd_analysis_json     jsonb,
  tailored_resume_url  text,
  cover_letter_text    text,
  cover_letter_url     text,
  status               text not null default 'applied'
                         check (status in ('applied', 'interviewing', 'rejected', 'offer', 'ghosted')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index applications_user_id_idx on public.applications(user_id);

-- Duplicate-application detection: one row per (user, company, requisition_id) when a req id is known.
create unique index applications_dedupe_idx
  on public.applications(user_id, company, requisition_id)
  where requisition_id is not null;

create trigger set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_skills
-- ---------------------------------------------------------------------------
create table public.user_skills (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  skill_name                  text not null,
  source                      text not null check (source in ('resume', 'jd_keyword_match')),
  first_seen_application_id  uuid references public.applications(id) on delete set null,
  created_at                  timestamptz not null default now(),
  unique (user_id, skill_name)
);

create index user_skills_user_id_idx on public.user_skills(user_id);

-- ---------------------------------------------------------------------------
-- llm_usage_log
-- ---------------------------------------------------------------------------
create table public.llm_usage_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users(id) on delete set null,
  application_id     uuid references public.applications(id) on delete set null,
  provider           text not null,
  model              text not null,
  endpoint           text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cost_estimate_usd  numeric(10, 6) not null default 0,
  created_at         timestamptz not null default now()
);

create index llm_usage_log_user_id_idx on public.llm_usage_log(user_id);
