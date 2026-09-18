-- Allow preparation-scoped editorial reviews to record syllabus topics from
-- every academic discipline, not only the original Portuguese base topics.
--
-- This migration is schema-only: it does not create reviews, applicability
-- links, question_applicability_content rows, or mutate question content.

set lock_timeout = '10s';
set statement_timeout = '30s';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.question_preparation_editorial_reviews'::regclass
      and conname = 'question_preparation_editorial_reviews_topic_check'
  ) then
    execute 'alter table public.question_preparation_editorial_reviews drop constraint question_preparation_editorial_reviews_topic_check';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.question_preparation_editorial_reviews'::regclass
      and conname = 'question_preparation_editorial_reviews_topic_check'
  ) then
    execute 'alter table public.question_preparation_editorial_reviews add constraint question_preparation_editorial_reviews_topic_check check (syllabus_topic is null or btrim(syllabus_topic) <> '''') not valid';
  end if;
end $$;

alter table public.question_preparation_editorial_reviews
  validate constraint question_preparation_editorial_reviews_topic_check;

comment on constraint question_preparation_editorial_reviews_topic_check
  on public.question_preparation_editorial_reviews is
  'Allows any non-empty syllabus topic text. Topic validity is governed by the matched academic_content_items/preparation evidence, not by a fixed Portuguese-only CHECK list.';

comment on column public.question_preparation_editorial_reviews.syllabus_topic is
  'Reviewed syllabus topic for the destination preparation. May reference any discipline topic; use question_applicability_content to bind approved questions to the exact academic_content_items row.';

reset statement_timeout;
reset lock_timeout;
