-- Seed data for common_questions (brief Section 6.2 starting list).
-- Idempotent: safe to re-run, matches on question_text.

insert into public.common_questions (question_text, category, is_sensitive, input_type, answer_options)
values
  ('Are you legally authorized to work in the United States?',
    'work_authorization', false, 'boolean', null),

  ('Will you now or in the future require visa sponsorship?',
    'sponsorship', false, 'boolean', null),

  ('What are your salary expectations?',
    'salary', false, 'text', null),

  ('Have you been employed by a government agency (federal, state, or local) in the last 5 years?',
    'government_employment', false, 'boolean', null),

  ('Are you willing to relocate?',
    'relocation', false, 'boolean', null),

  ('Are you open to remote, hybrid, or onsite work?',
    'remote_pref', false, 'select',
    '["Remote", "Hybrid", "Onsite", "No preference"]'::jsonb),

  ('What is your notice period or earliest available start date?',
    'notice_period', false, 'text', null),

  ('How did you hear about this position?',
    'referral_source', false, 'select',
    '["Company website", "LinkedIn", "Referral", "Job board", "Other"]'::jsonb),

  ('Do you have any relatives currently employed at this company?',
    'relatives_at_company', false, 'boolean', null),

  ('Are you subject to a non-compete agreement?',
    'non_compete', false, 'boolean', null),

  ('Have you ever been convicted of a felony?',
    'background_check', true, 'select',
    '["Yes", "No", "Decline to answer"]'::jsonb),

  ('Race / ethnicity (voluntary self-identification)',
    'eeo_race', true, 'select',
    '["Hispanic or Latino", "White", "Black or African American", "Native Hawaiian or Other Pacific Islander", "Asian", "American Indian or Alaska Native", "Two or More Races", "Decline to answer"]'::jsonb),

  ('Gender (voluntary self-identification)',
    'eeo_gender', true, 'select',
    '["Male", "Female", "Non-binary", "Decline to answer"]'::jsonb),

  ('Veteran status (voluntary self-identification)',
    'eeo_veteran', true, 'select',
    '["I am a protected veteran", "I am not a protected veteran", "I decline to self-identify"]'::jsonb),

  ('Disability status (voluntary self-identification)',
    'eeo_disability', true, 'select',
    '["Yes, I have a disability", "No, I do not have a disability", "I decline to self-identify"]'::jsonb)
on conflict (question_text) do nothing;
