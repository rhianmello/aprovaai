-- Seed preparation-scoped editorial proposals for the common Portuguese syllabus
-- of Transpetro PSP Terra — Nível Médio — 2026.3.
-- Idempotent: existing reviews are never overwritten.

do $$
declare
  v_preparations integer;
  v_questions integer;
begin
  select count(*) into v_preparations
  from public.preparations
  where edition_id = 'dd1faaa2-0b09-4e6a-968b-16db548b8853';

  if v_preparations <> 18 then
    raise exception 'expected 18 Transpetro Terra Médio 2026.3 preparations, found %', v_preparations;
  end if;

  select count(*) into v_questions
  from public.questions q
  join public.question_editorial_metadata m on m.question_id = q.id
  where q.source_type = 'QAPI'
    and m.source_materia = 'Língua Portuguesa';

  if v_questions <> 414 then
    raise exception 'expected 414 QAPI Língua Portuguesa questions, found %', v_questions;
  end if;
end
$$;

with source_questions as (
  select
    q.id as question_id,
    q.source_reference,
    m.source_assunto,
    m.source_materia,
    lower(coalesce(m.source_assunto, '')) as subject_key
  from public.questions q
  join public.question_editorial_metadata m on m.question_id = q.id
  where q.source_type = 'QAPI'
    and m.source_materia = 'Língua Portuguesa'
),
tagged as (
  select *,
    (subject_key ~ '(interpretação|interpretaçao|compreensão|compreensao|gêneros textuais|generos textuais|tipologia|tipos textuais)') as comprehension,
    (subject_key ~ '(ortografia|acentuação|acentuacao|porqu|mal e mau)') as orthography,
    (subject_key ~ '(coesão|coesao|coerência|coerencia|conectiv|referenciação|referenciacao|anáfora|anafora|catáfora|catafora)') as cohesion,
    (subject_key ~ '(classes de palavras|classes gramaticais|morfologia|adjetiv|advérb|adverb|substantiv|pronome|preposiç|preposic|conjunç|conjunc|locução|locucao|conjugação|conjugacao|verbo|particíp|particip)') as classes,
    (subject_key ~ 'concordância|concordancia') as agreement,
    (subject_key ~ 'crase') as crasis,
    (subject_key ~ '(pontuação|pontuacao|vírgula|virgula)') as punctuation,
    (subject_key ~ '(semântica|semantica|significação|significacao|sinon|ant[oô]nim|denotação|denotacao|conotação|conotacao|vocabulário|vocabulario|homôn|homon|parôn|paron)') as semantics,
    (subject_key ~ '(sintax|regência|regencia|redação|redacao|oficial|fonética|fonetica|fonologia|orações|oracoes|voz passiva|formação de palavras|formacao de palavras|variação linguística|variacao linguistica|argumentação|argumentacao|figuras de linguagem|processo editorial)') as blocker
  from source_questions
),
classified as (
  select *,
    (comprehension::int + orthography::int + cohesion::int + classes::int +
     agreement::int + crasis::int + punctuation::int + semantics::int) as tag_count
  from tagged
),
proposals as (
  select
    question_id,
    source_reference,
    source_assunto,
    source_materia,
    case
      when blocker or tag_count <> 1 then null
      when comprehension then 'Compreensão de textos de gêneros variados'
      when orthography then 'Ortografia oficial'
      when cohesion then 'Mecanismos de coesão textual'
      when classes then 'Emprego das classes de palavras'
      when agreement then 'Concordância nominal e verbal'
      when crasis then 'Emprego do sinal indicativo de crase'
      when punctuation then 'Sinais de pontuação'
      when semantics then 'Significação das palavras'
    end as syllabus_topic,
    case when blocker or tag_count <> 1 then 'REVISAR' else 'ADERENTE' end as adherence,
    case
      when blocker then 'Assunto QAPI contém conteúdo potencialmente fora dos oito tópicos ou combinado com outro eixo; exige revisão humana.'
      when tag_count = 0 then 'Assunto QAPI não permitiu mapeamento inequívoco aos oito tópicos; exige revisão humana.'
      when tag_count > 1 then 'Assunto QAPI corresponde a mais de um tópico do edital; exige revisão humana.'
      else 'Assunto QAPI mapeado de forma inequívoca para um único tópico comum às 18 preparações.'
    end as classification_reason
  from classified
),
target_preparations as (
  select id as preparation_id
  from public.preparations
  where edition_id = 'dd1faaa2-0b09-4e6a-968b-16db548b8853'
)
insert into public.question_preparation_editorial_reviews (
  question_id, preparation_id, syllabus_topic, subtopic, adherence,
  editorial_quality, editorial_difficulty, classification_reason,
  classification_evidence, rule_version, classification_method
)
select
  p.question_id,
  tp.preparation_id,
  p.syllabus_topic,
  p.source_assunto,
  p.adherence,
  'PENDENTE',
  null,
  p.classification_reason,
  jsonb_build_object(
    'source', 'QAPI',
    'source_reference', p.source_reference,
    'source_materia', p.source_materia,
    'source_assunto', p.source_assunto,
    'classification_basis', 'source_assunto',
    'shared_syllabus', 'TRANSPETRO/PSP/TERRA/NÍVEL MÉDIO/2026.3'
  ),
  'transpetro-lingua-portuguesa-conservative-v1',
  'automatica'
from proposals p
cross join target_preparations tp
on conflict (question_id, preparation_id) do nothing;
