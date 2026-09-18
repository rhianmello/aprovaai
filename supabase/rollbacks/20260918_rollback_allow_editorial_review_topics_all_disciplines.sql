-- Rollback for 20260918_01_allow_editorial_review_topics_all_disciplines.sql.
--
-- This is intentionally guarded. Once non-Portuguese syllabus_topic values are
-- written, restoring the old Portuguese-only CHECK would be destructive unless
-- those rows are reviewed or removed first.

set lock_timeout = '10s';
set statement_timeout = '30s';

do $$
begin
  if exists (
    select 1
    from public.question_preparation_editorial_reviews
    where syllabus_topic is not null
      and syllabus_topic not in (
        'Compreensão de textos de gêneros variados',
        'Ortografia oficial',
        'Mecanismos de coesão textual',
        'Emprego das classes de palavras',
        'Concordância nominal e verbal',
        'Emprego do sinal indicativo de crase',
        'Sinais de pontuação',
        'Significação das palavras'
      )
  ) then
    raise exception 'Rollback blocked: question_preparation_editorial_reviews contains syllabus_topic values outside the old Portuguese-only list.';
  end if;

  execute 'alter table public.question_preparation_editorial_reviews drop constraint if exists question_preparation_editorial_reviews_topic_check';

  execute 'alter table public.question_preparation_editorial_reviews add constraint question_preparation_editorial_reviews_topic_check check ((syllabus_topic is null) or (syllabus_topic in (''Compreensão de textos de gêneros variados'', ''Ortografia oficial'', ''Mecanismos de coesão textual'', ''Emprego das classes de palavras'', ''Concordância nominal e verbal'', ''Emprego do sinal indicativo de crase'', ''Sinais de pontuação'', ''Significação das palavras''))) not valid';
end $$;

alter table public.question_preparation_editorial_reviews
  validate constraint question_preparation_editorial_reviews_topic_check;

comment on constraint question_preparation_editorial_reviews_topic_check
  on public.question_preparation_editorial_reviews is
  'Restored legacy Portuguese-only syllabus_topic CHECK.';

reset statement_timeout;
reset lock_timeout;
