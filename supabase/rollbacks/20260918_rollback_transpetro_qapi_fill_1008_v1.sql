-- Retrospective rollback for the Transpetro QAPI editorial publication run.
--
-- Scope:
--   rule_version = 'transpetro_qapi_fill_1008_v1'
--
-- This rollback removes only the editorial/publication layer created for that
-- rule: question_applicability_content, question_applicability, and
-- question_preparation_editorial_reviews. It does not delete questions, QAPI
-- metadata, import batches, import items, fill queue rows, users, courses,
-- payments, enrollments, or authentication data.
--
-- Run the preview SELECTs first if you need to inspect counts before COMMIT.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Preview target counts inside the transaction.
select
  count(*) as target_reviews,
  count(*) filter (where adherence = 'ADERENTE' and editorial_quality = 'APROVADA') as target_publication_reviews,
  count(distinct question_id) as target_questions,
  count(distinct preparation_id) as target_preparations
from public.question_preparation_editorial_reviews
where rule_version = 'transpetro_qapi_fill_1008_v1';

select count(*) as target_applicability_content
from public.question_applicability_content qac
where exists (
  select 1
  from public.question_applicability qa
  join public.question_preparation_editorial_reviews r
    on r.question_id = qa.question_id
   and r.preparation_id = qa.preparation_id
  where qa.id = qac.applicability_id
    and r.rule_version = 'transpetro_qapi_fill_1008_v1'
    and r.adherence = 'ADERENTE'
    and r.editorial_quality = 'APROVADA'
);

select count(*) as target_applicability
from public.question_applicability qa
where exists (
  select 1
  from public.question_preparation_editorial_reviews r
  where r.question_id = qa.question_id
    and r.preparation_id = qa.preparation_id
    and r.rule_version = 'transpetro_qapi_fill_1008_v1'
    and r.adherence = 'ADERENTE'
    and r.editorial_quality = 'APROVADA'
);

-- Delete content bindings before applicability rows.
delete from public.question_applicability_content qac
where exists (
  select 1
  from public.question_applicability qa
  join public.question_preparation_editorial_reviews r
    on r.question_id = qa.question_id
   and r.preparation_id = qa.preparation_id
  where qa.id = qac.applicability_id
    and r.rule_version = 'transpetro_qapi_fill_1008_v1'
    and r.adherence = 'ADERENTE'
    and r.editorial_quality = 'APROVADA'
);

-- Delete only applicability rows backed by this approved rule version.
delete from public.question_applicability qa
where exists (
  select 1
  from public.question_preparation_editorial_reviews r
  where r.question_id = qa.question_id
    and r.preparation_id = qa.preparation_id
    and r.rule_version = 'transpetro_qapi_fill_1008_v1'
    and r.adherence = 'ADERENTE'
    and r.editorial_quality = 'APROVADA'
);

-- Delete all editorial decisions produced by this run, including NAO_ADERENTE
-- and REVISAR rows. The source questions remain in the import quarantine.
delete from public.question_preparation_editorial_reviews
where rule_version = 'transpetro_qapi_fill_1008_v1';

-- Verification after deletes, before commit.
select count(*) as remaining_reviews
from public.question_preparation_editorial_reviews
where rule_version = 'transpetro_qapi_fill_1008_v1';

select count(*) as remaining_applicability_for_rule
from public.question_applicability qa
where exists (
  select 1
  from public.question_preparation_editorial_reviews r
  where r.question_id = qa.question_id
    and r.preparation_id = qa.preparation_id
    and r.rule_version = 'transpetro_qapi_fill_1008_v1'
);

commit;
