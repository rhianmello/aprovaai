-- Rollback retrospectivo do lote autoral tecnico Transpetro.
-- Lote: transpetro_zero_coverage_autoral_v1
-- Criado em: 2026-09-18
--
-- Este rollback remove somente os registros criados para o lote autoral
-- transpetro_zero_coverage_autoral_v1. Ele preserva questoes QAPI, questoes
-- historicas, cursos, preparacoes, usuarios, pagamentos, matriculas e autenticacao.
--
-- NAO EXECUTE sem validar os SELECTs abaixo no banco alvo.

begin;

-- Pre-check: deve retornar apenas questoes AUTORAL deste lote.
select id, source_reference
from public.questions
where source_type = 'AUTORAL'
  and source_reference like 'transpetro_zero_coverage_autoral_v1:%'
order by source_reference;

-- Remove vinculos dos itens academicos do lote.
delete from public.question_applicability_content qac
using public.question_applicability qa,
      public.questions q
where qac.applicability_id = qa.id
  and qa.question_id = q.id
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_coverage_autoral_v1:%';

-- Remove aplicabilidades criadas para as questoes autorais do lote.
delete from public.question_applicability qa
using public.questions q
where qa.question_id = q.id
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_coverage_autoral_v1:%';

-- Remove reviews editoriais do lote.
delete from public.question_preparation_editorial_reviews r
using public.questions q
where r.question_id = q.id
  and q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_coverage_autoral_v1:%'
  and r.rule_version = 'transpetro_zero_coverage_autoral_v1';

-- Remove somente as questoes autorais deste lote.
delete from public.questions q
where q.source_type = 'AUTORAL'
  and q.source_reference like 'transpetro_zero_coverage_autoral_v1:%';

-- Pos-check: todos devem ser zero antes do commit.
select
  (select count(*) from public.questions
   where source_type = 'AUTORAL'
     and source_reference like 'transpetro_zero_coverage_autoral_v1:%') as remaining_questions,
  (select count(*) from public.question_preparation_editorial_reviews
   where rule_version = 'transpetro_zero_coverage_autoral_v1') as remaining_reviews;

-- Troque por rollback; para testar sem aplicar.
commit;
