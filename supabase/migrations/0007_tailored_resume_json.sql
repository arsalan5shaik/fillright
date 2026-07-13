-- Persists the tailored resume's structured data (not just the rendered
-- PDF), so the extension can fill Workday's own Work Experience/Education
-- fields with the same tailored bullet content that's in the PDF, rather
-- than falling back to the untailored base resume for those fields.
alter table public.applications add column tailored_resume_json jsonb;
