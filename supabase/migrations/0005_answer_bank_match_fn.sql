-- pgvector similarity search, callable through PostgREST as
-- POST /rest/v1/rpc/match_answer_bank. Not security definer, so it runs as
-- the calling role (authenticated, via the caller's forwarded JWT) - the
-- explicit user_id filter is defense in depth on top of answer_bank's RLS.
-- query_embedding is text (not vector) so PostgREST's JSON->SQL param
-- coercion never has to guess how to serialize a vector value.

create or replace function match_answer_bank(
  query_embedding text,
  match_count int default 3
)
returns table (
  id uuid,
  question_text text,
  answer_text text,
  source text,
  model_used text,
  times_reused int,
  similarity float
)
language sql
stable
as $$
  select
    id,
    question_text,
    answer_text,
    source,
    model_used,
    times_reused,
    1 - (question_embedding <=> query_embedding::vector) as similarity
  from answer_bank
  where user_id = auth.uid()
  order by question_embedding <=> query_embedding::vector
  limit match_count;
$$;

grant execute on function match_answer_bank(text, int) to authenticated;
