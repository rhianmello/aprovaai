-- Retrospective rollback script for the completed Transpetro Portuguese propagation.
--
-- Scope:
--   Reverses only the additional Portuguese propagation identified by the live
--   database evidence below:
--     rule_version = 'transpetro_portuguese_137_propagation_v1'
--     classification_method = 'automatica'
--     created_at = '2026-09-16 23:43:09.942053+00'
--     Portuguese syllabus topics listed in v_portuguese_topics
--     active Transpetro preparations outside the original Terra/Nivel Medio group
--
-- This script is intentionally dry-run by default. To execute the rollback,
-- set v_execute := true after reviewing the dry-run output in production.
-- It deletes in dependency order and never touches public.questions, question
-- content, payments, enrollments, users, authentication, or non-Transpetro data.

begin;

do $$
declare
  v_execute boolean := false;
  v_rule_version constant text := 'transpetro_portuguese_137_propagation_v1';
  v_created_at constant timestamptz := '2026-09-16 23:43:09.942053+00';
  v_expected_reviews constant integer := 5891;
  v_expected_apps constant integer := 5891;
  v_review_count integer;
  v_app_count integer;
  v_qac_count integer;
begin
  create temp table _rollback_transpetro_portuguese_topics(topic text primary key) on commit drop;
  insert into _rollback_transpetro_portuguese_topics(topic) values
    ('Compreensão de textos de gêneros variados'),
    ('Ortografia oficial'),
    ('Mecanismos de coesão textual'),
    ('Emprego das classes de palavras'),
    ('Concordância nominal e verbal'),
    ('Emprego do sinal indicativo de crase'),
    ('Sinais de pontuação'),
    ('Significação das palavras');

  create temp table _rollback_transpetro_portuguese_target_preps as
  select distinct p.id as preparation_id
  from public.preparations p
  join public.academic_editions e on e.id = p.edition_id
  join public.academic_contests c on c.id = e.contest_id
  where p.active = true
    and e.active = true
    and c.active = true
    and c.name ilike '%transpetro%'
    and not (e.name ilike '%Terra%' and coalesce(e.level, '') ilike '%Médio%');

  create temp table _rollback_transpetro_portuguese_reviews as
  select r.id, r.question_id, r.preparation_id
  from public.question_preparation_editorial_reviews r
  join _rollback_transpetro_portuguese_topics t on t.topic = r.syllabus_topic
  join _rollback_transpetro_portuguese_target_preps tp on tp.preparation_id = r.preparation_id
  where r.rule_version = v_rule_version
    and r.classification_method = 'automatica'
    and r.created_at = v_created_at
    and r.adherence = 'ADERENTE'
    and r.editorial_quality = 'APROVADA';

  create temp table _rollback_transpetro_portuguese_apps as
  select a.id, a.question_id, a.preparation_id
  from public.question_applicability a
  join _rollback_transpetro_portuguese_reviews r
    on r.question_id = a.question_id
   and r.preparation_id = a.preparation_id
  where a.created_at = v_created_at;

  select count(*) into v_review_count from _rollback_transpetro_portuguese_reviews;
  select count(*) into v_app_count from _rollback_transpetro_portuguese_apps;
  select count(*) into v_qac_count
  from public.question_applicability_content qac
  join _rollback_transpetro_portuguese_apps a
    on a.id = qac.applicability_id
   and a.preparation_id = qac.preparation_id;

  raise notice 'Rollback candidates: reviews=%, applicability=%, qac=%', v_review_count, v_app_count, v_qac_count;

  if v_review_count <> v_expected_reviews then
    raise exception 'Safety stop: expected % propagated reviews, found %', v_expected_reviews, v_review_count;
  end if;

  if v_app_count <> v_expected_apps then
    raise exception 'Safety stop: expected % propagated applicability rows, found %', v_expected_apps, v_app_count;
  end if;

  if exists (
    select 1
    from _rollback_transpetro_portuguese_reviews r
    join public.preparations p on p.id = r.preparation_id
    join public.academic_editions e on e.id = p.edition_id
    where e.name ilike '%Terra%'
      and coalesce(e.level, '') ilike '%Médio%'
  ) then
    raise exception 'Safety stop: rollback candidate includes original Terra/Nivel Medio preparation';
  end if;

  if exists (
    select 1
    from _rollback_transpetro_portuguese_reviews r
    join public.preparations p on p.id = r.preparation_id
    join public.academic_editions e on e.id = p.edition_id
    join public.academic_contests c on c.id = e.contest_id
    where c.name not ilike '%transpetro%'
  ) then
    raise exception 'Safety stop: rollback candidate includes non-Transpetro preparation';
  end if;

  if not v_execute then
    raise notice 'Dry-run only. Set v_execute := true to delete these exact rollback candidates.';
    return;
  end if;

  delete from public.question_applicability_content qac
  using _rollback_transpetro_portuguese_apps a
  where qac.applicability_id = a.id
    and qac.preparation_id = a.preparation_id;

  delete from public.question_applicability a
  using _rollback_transpetro_portuguese_apps target
  where a.id = target.id;

  delete from public.question_preparation_editorial_reviews r
  using _rollback_transpetro_portuguese_reviews target
  where r.id = target.id;

  raise notice 'Rollback executed: deleted reviews=%, applicability=%, qac=%', v_review_count, v_app_count, v_qac_count;
end $$;

commit;
