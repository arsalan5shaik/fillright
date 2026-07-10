-- Row Level Security: every user-scoped table is isolated to auth.uid().
-- common_questions is global/read-only to any authenticated user.
-- llm_usage_log has no write policy for the "authenticated" role — only the
-- service role (used by backend jobs) can insert/update it.

alter table public.users enable row level security;
alter table public.resume_profiles enable row level security;
alter table public.profile_fields enable row level security;
alter table public.common_questions enable row level security;
alter table public.user_common_answers enable row level security;
alter table public.answer_bank enable row level security;
alter table public.applications enable row level security;
alter table public.user_skills enable row level security;
alter table public.llm_usage_log enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- resume_profiles
-- ---------------------------------------------------------------------------
create policy "resume_profiles_select_own" on public.resume_profiles
  for select using (auth.uid() = user_id);
create policy "resume_profiles_insert_own" on public.resume_profiles
  for insert with check (auth.uid() = user_id);
create policy "resume_profiles_update_own" on public.resume_profiles
  for update using (auth.uid() = user_id);
create policy "resume_profiles_delete_own" on public.resume_profiles
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- profile_fields
-- ---------------------------------------------------------------------------
create policy "profile_fields_select_own" on public.profile_fields
  for select using (auth.uid() = user_id);
create policy "profile_fields_insert_own" on public.profile_fields
  for insert with check (auth.uid() = user_id);
create policy "profile_fields_update_own" on public.profile_fields
  for update using (auth.uid() = user_id);
create policy "profile_fields_delete_own" on public.profile_fields
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- common_questions — global, read-only
-- ---------------------------------------------------------------------------
create policy "common_questions_select_authenticated" on public.common_questions
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- user_common_answers
-- ---------------------------------------------------------------------------
create policy "user_common_answers_select_own" on public.user_common_answers
  for select using (auth.uid() = user_id);
create policy "user_common_answers_insert_own" on public.user_common_answers
  for insert with check (auth.uid() = user_id);
create policy "user_common_answers_update_own" on public.user_common_answers
  for update using (auth.uid() = user_id);
create policy "user_common_answers_delete_own" on public.user_common_answers
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- answer_bank
-- ---------------------------------------------------------------------------
create policy "answer_bank_select_own" on public.answer_bank
  for select using (auth.uid() = user_id);
create policy "answer_bank_insert_own" on public.answer_bank
  for insert with check (auth.uid() = user_id);
create policy "answer_bank_update_own" on public.answer_bank
  for update using (auth.uid() = user_id);
create policy "answer_bank_delete_own" on public.answer_bank
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
create policy "applications_select_own" on public.applications
  for select using (auth.uid() = user_id);
create policy "applications_insert_own" on public.applications
  for insert with check (auth.uid() = user_id);
create policy "applications_update_own" on public.applications
  for update using (auth.uid() = user_id);
create policy "applications_delete_own" on public.applications
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_skills
-- ---------------------------------------------------------------------------
create policy "user_skills_select_own" on public.user_skills
  for select using (auth.uid() = user_id);
create policy "user_skills_insert_own" on public.user_skills
  for insert with check (auth.uid() = user_id);
create policy "user_skills_update_own" on public.user_skills
  for update using (auth.uid() = user_id);
create policy "user_skills_delete_own" on public.user_skills
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- llm_usage_log — read-only for the owning user, writes are service-role only
-- ---------------------------------------------------------------------------
create policy "llm_usage_log_select_own" on public.llm_usage_log
  for select using (auth.uid() = user_id);
