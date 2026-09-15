-- Administrative workflow for one editorial decision replicated across the
-- 18 preparations in TRANSPETRO/PSP/TERRA/NÍVEL MÉDIO/2026.3.
-- It does not touch questions, question_editorial_metadata or question_applicability.

create or replace function public.admin_transpetro_portuguese_editorial_reviews()
returns table (
  question_id uuid,
  statement text,
  alternatives jsonb,
  answer text,
  explanation text,
  source_reference text,
  source_year smallint,
  source_payload jsonb,
  source_banca text,
  source_orgao text,
  source_cargo text,
  source_materia text,
  source_assunto text,
  question_type text,
  qapi_difficulty text,
  syllabus_topic text,
  subtopic text,
  adherence text,
  editorial_quality text,
  editorial_difficulty text,
  classification_reason text,
  classification_method text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  preparation_review_count bigint,
  manual_review_count bigint,
  decisions_consistent boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not (select public.is_admin()) then
    raise exception 'Acesso restrito a administradores'
      using errcode = '42501';
  end if;

  return query
  with target_edition as (
    select ae.id
    from public.academic_editions ae
    where ae.official_name = 'TRANSPETRO/PSP/TERRA/NÍVEL MÉDIO/2026.3'
  ),
  target_preparations as (
    select p.id, p.name
    from public.preparations p
    join target_edition e on e.id = p.edition_id
  ),
  scoped as (
    select
      r.*,
      p.name as preparation_name,
      first_value(r.id) over (
        partition by r.question_id
        order by (r.classification_method = 'manual') desc, p.name, r.id
      ) as representative_id
    from public.question_preparation_editorial_reviews r
    join target_preparations p on p.id = r.preparation_id
  ),
  grouped as (
    select
      s.question_id,
      count(*)::bigint as preparation_review_count,
      count(*) filter (where s.classification_method = 'manual')::bigint as manual_review_count,
      count(distinct row(
        s.syllabus_topic,
        s.subtopic,
        s.adherence,
        s.editorial_quality,
        s.editorial_difficulty,
        s.classification_reason
      )) = 1 as decisions_consistent,
      min(s.representative_id) as representative_id
    from scoped s
    group by s.question_id
  )
  select
    q.id,
    q.statement,
    q.alternatives,
    q.answer,
    q.explanation,
    q.source_reference,
    coalesce(m.source_year, q.year),
    m.source_payload,
    coalesce(m.display_banca, m.source_banca),
    coalesce(m.display_orgao, m.source_orgao),
    coalesce(m.display_cargo, m.source_cargo),
    coalesce(m.display_materia, m.source_materia),
    coalesce(m.display_assunto, m.source_assunto),
    m.question_type,
    coalesce(m.source_payload ->> 'nivel', m.source_metadata ->> 'nivel'),
    r.syllabus_topic,
    r.subtopic,
    r.adherence,
    r.editorial_quality,
    r.editorial_difficulty,
    r.classification_reason,
    r.classification_method,
    r.reviewed_by,
    r.reviewed_at,
    g.preparation_review_count,
    g.manual_review_count,
    g.decisions_consistent
  from grouped g
  join scoped r on r.id = g.representative_id
  join public.questions q on q.id = g.question_id
  left join public.question_editorial_metadata m on m.question_id = q.id
  where coalesce(m.source_materia, m.display_materia) = 'Língua Portuguesa'
  order by
    case r.adherence when 'REVISAR' then 0 when 'ADERENTE' then 1 else 2 end,
    coalesce(m.source_assunto, ''),
    q.created_at,
    q.id;
end;
$$;

create or replace function public.apply_transpetro_portuguese_editorial_review(
  p_question_id uuid,
  p_syllabus_topic text,
  p_subtopic text,
  p_adherence text,
  p_editorial_quality text,
  p_editorial_difficulty text,
  p_classification_reason text,
  p_confirm_overwrite_manual boolean default false
)
returns table (
  updated_count integer,
  manual_reviews_replaced integer,
  reviewed_by uuid,
  reviewed_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reviewer uuid := auth.uid();
  v_now timestamptz := now();
  v_target_count integer;
  v_manual_count integer;
  v_updated integer;
begin
  if v_reviewer is null or not (select public.is_admin()) then
    raise exception 'Acesso restrito a administradores'
      using errcode = '42501';
  end if;

  if p_adherence not in ('ADERENTE', 'NAO_ADERENTE', 'REVISAR') then
    raise exception 'Aderência inválida';
  end if;
  if p_editorial_quality not in ('PENDENTE', 'APROVADA', 'REVISAR', 'REPROVADA') then
    raise exception 'Qualidade editorial inválida';
  end if;
  if p_editorial_difficulty is not null
     and p_editorial_difficulty not in ('facil', 'media', 'dificil') then
    raise exception 'Dificuldade editorial inválida';
  end if;
  if p_syllabus_topic is not null and p_syllabus_topic not in (
    'Compreensão de textos de gêneros variados',
    'Ortografia oficial',
    'Mecanismos de coesão textual',
    'Emprego das classes de palavras',
    'Concordância nominal e verbal',
    'Emprego do sinal indicativo de crase',
    'Sinais de pontuação',
    'Significação das palavras'
  ) then
    raise exception 'Tópico oficial inválido';
  end if;
  if p_adherence = 'ADERENTE' and p_syllabus_topic is null then
    raise exception 'Questão aderente exige tópico oficial';
  end if;
  if nullif(btrim(p_classification_reason), '') is null then
    raise exception 'Observação/motivo é obrigatório';
  end if;

  select
    count(*)::integer,
    count(*) filter (where r.classification_method = 'manual')::integer
  into v_target_count, v_manual_count
  from public.question_preparation_editorial_reviews r
  join public.preparations p on p.id = r.preparation_id
  join public.academic_editions ae on ae.id = p.edition_id
  join public.question_editorial_metadata m on m.question_id = r.question_id
  where r.question_id = p_question_id
    and ae.official_name = 'TRANSPETRO/PSP/TERRA/NÍVEL MÉDIO/2026.3'
    and coalesce(m.source_materia, m.display_materia) = 'Língua Portuguesa'
  for update of r;

  if v_target_count <> 18 then
    raise exception 'Esperados 18 registros de revisão; encontrados %', v_target_count;
  end if;
  if v_manual_count > 0 and not p_confirm_overwrite_manual then
    raise exception 'Já existem % revisões manuais. Confirme explicitamente a substituição.', v_manual_count;
  end if;

  update public.question_preparation_editorial_reviews r
  set
    syllabus_topic = p_syllabus_topic,
    subtopic = nullif(btrim(p_subtopic), ''),
    adherence = p_adherence,
    editorial_quality = p_editorial_quality,
    editorial_difficulty = p_editorial_difficulty,
    classification_reason = btrim(p_classification_reason),
    classification_evidence = coalesce(r.classification_evidence, '{}'::jsonb)
      || jsonb_build_object(
        'manual_review',
        jsonb_build_object(
          'scope', 'all_18_transpetro_nm_2026_3',
          'reviewer_id', v_reviewer,
          'reviewed_at', v_now
        )
      ),
    rule_version = 'manual_transpetro_nm_2026_3_v1',
    classification_method = 'manual',
    reviewed_by = v_reviewer,
    reviewed_at = v_now,
    updated_at = v_now
  from public.preparations p
  join public.academic_editions ae on ae.id = p.edition_id
  where r.preparation_id = p.id
    and r.question_id = p_question_id
    and ae.official_name = 'TRANSPETRO/PSP/TERRA/NÍVEL MÉDIO/2026.3';

  get diagnostics v_updated = row_count;
  if v_updated <> 18 then
    raise exception 'Atualização atômica incompleta: % de 18 registros', v_updated;
  end if;

  return query select v_updated, v_manual_count, v_reviewer, v_now;
end;
$$;

revoke all on function public.admin_transpetro_portuguese_editorial_reviews() from public, anon;
grant execute on function public.admin_transpetro_portuguese_editorial_reviews() to authenticated;

revoke all on function public.apply_transpetro_portuguese_editorial_review(uuid, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.apply_transpetro_portuguese_editorial_review(uuid, text, text, text, text, text, text, boolean) to authenticated;

comment on function public.admin_transpetro_portuguese_editorial_reviews()
is 'Admin-only consolidated read model: one row per Língua Portuguesa question for Transpetro NM 2026.3.';

comment on function public.apply_transpetro_portuguese_editorial_review(uuid, text, text, text, text, text, text, boolean)
is 'Admin-only atomic manual editorial decision across the 18 Transpetro NM 2026.3 preparations; refuses silent overwrite of manual reviews.';
