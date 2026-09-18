-- Rollback documental para transpetro_zero_remaining_authorial_v1
--
-- Remove somente as questões AUTORAIS criadas para zerar itens de edital
-- Transpetro ainda sem cobertura, juntamente com seus reviews, applicability
-- e question_applicability_content.
--
-- NÃO EXECUTAR automaticamente. Usar apenas se for necessário reverter
-- especificamente esta rodada.

begin;

do $$
begin
  if exists (
    select 1
    from public.questions q
    where q.source_reference like 'transpetro_zero_remaining_authorial_v1:%'
      and (
        q.source_type is distinct from 'AUTORAL'
        or q.is_original is distinct from true
      )
  ) then
    raise exception 'Rollback bloqueado: existem source_reference da regra com origem diferente de AUTORAL/is_original=true.';
  end if;
end $$;

-- 1) Remove os vínculos acadêmicos das questões desta rodada.
delete from public.question_applicability_content qac
using public.question_applicability qa, public.questions q
where qac.applicability_id = qa.id
  and qa.question_id = q.id
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_remaining_authorial_v1:%';

-- 2) Remove as aplicabilidades dessas questões.
delete from public.question_applicability qa
using public.questions q
where qa.question_id = q.id
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_remaining_authorial_v1:%';

-- 3) Remove somente os reviews editoriais da regra desta rodada.
delete from public.question_preparation_editorial_reviews r
using public.questions q
where r.question_id = q.id
  and r.rule_version = 'transpetro_zero_remaining_authorial_v1'
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_remaining_authorial_v1:%';

-- 4) Remove as questões, desde que não tenham adquirido novos vínculos/reviews
-- após esta rodada. Se houver novas referências, o FK/guardas preservam os dados.
delete from public.questions q
where q.source_type = 'AUTORAL'
  and q.is_original = true
  and q.source_reference like 'transpetro_zero_remaining_authorial_v1:%'
  and not exists (
    select 1
    from public.question_applicability qa
    where qa.question_id = q.id
  )
  and not exists (
    select 1
    from public.question_preparation_editorial_reviews r
    where r.question_id = q.id
  );

commit;

-- Conferência pós-rollback, caso seja executado manualmente:
select
  count(*) as remaining_questions
from public.questions
where source_type = 'AUTORAL'
  and source_reference like 'transpetro_zero_remaining_authorial_v1:%';
