-- RLS policies only filter rows among what a role already has a base SQL
-- privilege for — they don't grant that privilege. Without these grants,
-- `authenticated` has zero access regardless of policy definitions.

grant usage on schema public to authenticated;

grant select, update on public.users to authenticated;
grant select, insert, update, delete on public.resume_profiles to authenticated;
grant select, insert, update, delete on public.profile_fields to authenticated;
grant select on public.common_questions to authenticated;
grant select, insert, update, delete on public.user_common_answers to authenticated;
grant select, insert, update, delete on public.answer_bank to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.user_skills to authenticated;
grant select on public.llm_usage_log to authenticated;
