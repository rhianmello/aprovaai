-- Prefer the editorially reviewed topic/subtopic when an applicability has legacy
-- mappings to more than one content item. Publication barriers and course access
-- checks remain unchanged.

create or replace function public.load_student_question_bank(
  p_course_id bigint,
  p_preparation_id uuid
)
returns table(
  id uuid,
  enunciado text,
  alternativas jsonb,
  gabarito text,
  explicacao text,
  tipo text,
  texto_base text,
  figura text,
  disciplina text,
  assunto text,
  subassunto text,
  fonte text
)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_courses uc
    join public.course_preparations cp
      on cp.course_id = uc.course_id
     and cp.preparation_id = p_preparation_id
     and cp.active = true
    where uc.user_id = v_user_id
      and uc.course_id = p_course_id
      and uc.status = 'active'
      and (uc.starts_at is null or uc.starts_at <= now())
      and (uc.expires_at is null or uc.expires_at > now())
  ) then
    raise exception 'course access required' using errcode = '42501';
  end if;

  return query
  select
    q.id,
    q.statement,
    q.alternatives,
    q.answer,
    coalesce(q.explanation, ''),
    coalesce(m.question_type, m.source_payload->>'tipo', ''),
    case
      when nullif(btrim(m.source_payload->>'texto'), '') is null then ''
      when m.source_payload->>'texto' ~* '^QTXT[0-9]+$' then ''
      else m.source_payload->>'texto'
    end,
    coalesce(
      nullif(btrim(m.source_payload->>'figura'), ''),
      nullif(btrim(m.source_payload->>'imagem'), ''),
      nullif(btrim(m.source_payload->>'image_url'), ''),
      ''
    ),
    coalesce(content.subject_name, 'Conhecimentos Específicos'),
    coalesce(content.content_title, r.syllabus_topic, r.subtopic, 'Questões do edital'),
    coalesce(r.subtopic, m.subtopic, ''),
    coalesce(q.source_reference, '')
  from public.question_applicability a
  join public.questions q
    on q.id = a.question_id
   and q.active = true
  join public.question_preparation_editorial_reviews r
    on r.question_id = q.id
   and r.preparation_id = a.preparation_id
   and r.preparation_id = p_preparation_id
   and r.adherence = 'ADERENTE'
   and r.editorial_quality = 'APROVADA'
  left join public.question_editorial_metadata m
    on m.question_id = q.id
  left join lateral (
    select
      ci.title as content_title,
      s.name as subject_name
    from public.question_applicability_content qac
    join public.academic_content_items ci
      on ci.id = qac.content_item_id
     and ci.active = true
    left join public.academic_subjects s
      on s.id = ci.subject_id
    where qac.applicability_id = a.id
      and qac.preparation_id = p_preparation_id
    order by
      case
        when r.syllabus_topic is not null and ci.title = r.syllabus_topic then 0
        when r.subtopic is not null and ci.title = r.subtopic then 1
        else 2
      end,
      ci.sort_order,
      ci.id
    limit 1
  ) content on true
  where a.preparation_id = p_preparation_id
    and a.active = true;
end;
$function$;
