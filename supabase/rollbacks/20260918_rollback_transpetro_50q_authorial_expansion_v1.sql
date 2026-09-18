-- Rollback documental da expansão Transpetro até 50 questões por item.
-- Regra autoral: transpetro_50q_authorial_expansion_v1
-- Lote de reaproveitamento complementar: vínculos QAPI criados em 2026-09-18 18:10:22.918468+00
--
-- NÃO EXECUTAR automaticamente.
-- Este arquivo reverte apenas as questões AUTORAIS da regra acima e os 50
-- vínculos acadêmicos QAPI explicitamente criados no lote de reaproveitamento.

begin;

do $$
declare
  v_bad integer;
  v_reused integer;
begin
  select count(*) into v_bad
  from public.questions q
  where q.source_reference like 'transpetro_50q_authorial_expansion_v1:%'
    and (
      q.source_type is distinct from 'AUTORAL'
      or q.is_original is distinct from true
    );

  if v_bad <> 0 then
    raise exception 'Rollback bloqueado: existem source_reference da expansão com origem diferente de AUTORAL/is_original=true.';
  end if;

  select count(*) into v_reused
  from public.question_applicability_content qac
  join public.question_applicability qa on qa.id=qac.applicability_id
  join public.questions q on q.id=qa.question_id
  where q.source_type='QAPI'
    and qac.created_at='2026-09-18 18:10:22.918468+00'::timestamptz
    and qac.content_item_id in (
      '73f27ee0-bd3e-40d0-854f-589556088d88'::uuid,
      'e91bd574-d18f-437d-9eea-ac2f337ead33'::uuid
    );

  if v_reused <> 50 then
    raise exception 'Rollback bloqueado: esperado 50 vínculos QAPI de reaproveitamento, encontrados %.', v_reused;
  end if;
end $$;

-- 1) Remove os 50 vínculos QAPI reutilizados neste lote.
-- Não remove nem altera as questões QAPI, reviews ou applicability preexistentes.
delete from public.question_applicability_content qac
using public.question_applicability qa, public.questions q
where qac.applicability_id=qa.id
  and qa.question_id=q.id
  and q.source_type='QAPI'
  and qac.created_at='2026-09-18 18:10:22.918468+00'::timestamptz
  and qac.content_item_id in (
    '73f27ee0-bd3e-40d0-854f-589556088d88'::uuid,
    'e91bd574-d18f-437d-9eea-ac2f337ead33'::uuid
  );

-- 2) Remove vínculos acadêmicos das questões autorais da expansão.
delete from public.question_applicability_content qac
using public.question_applicability qa, public.questions q
where qac.applicability_id=qa.id
  and qa.question_id=q.id
  and q.source_type='AUTORAL'
  and q.source_reference like 'transpetro_50q_authorial_expansion_v1:%';

-- 3) Remove applicability das questões autorais da expansão.
delete from public.question_applicability qa
using public.questions q
where qa.question_id=q.id
  and q.source_type='AUTORAL'
  and q.source_reference like 'transpetro_50q_authorial_expansion_v1:%';

-- 4) Remove reviews criados pela regra autoral.
delete from public.question_preparation_editorial_reviews r
using public.questions q
where r.question_id=q.id
  and r.rule_version='transpetro_50q_authorial_expansion_v1'
  and q.source_type='AUTORAL'
  and q.source_reference like 'transpetro_50q_authorial_expansion_v1:%';

-- 5) Remove as questões autorais da expansão somente se não restarem referências.
delete from public.questions q
where q.source_type='AUTORAL'
  and q.is_original=true
  and q.source_reference like 'transpetro_50q_authorial_expansion_v1:%'
  and not exists (
    select 1 from public.question_applicability qa where qa.question_id=q.id
  )
  and not exists (
    select 1 from public.question_preparation_editorial_reviews r where r.question_id=q.id
  );

commit;

-- Conferência pós-rollback, caso executado manualmente.
select
  count(*) as remaining_authorial_questions
from public.questions
where source_type='AUTORAL'
  and source_reference like 'transpetro_50q_authorial_expansion_v1:%';
