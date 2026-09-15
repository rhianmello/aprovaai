create or replace function public.load_student_question_bank(
  p_course_id bigint,
  p_preparation_id uuid
)
returns table (
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
security definer
stable
set search_path = ''
as $$
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
    coalesce(content.content_title, r.syllabus_topic, 'Questões do edital'),
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
    order by ci.sort_order, ci.id
    limit 1
  ) content on true
  where a.preparation_id = p_preparation_id
    and a.active = true;
end;
$$;

revoke all on function public.load_student_question_bank(bigint, uuid) from public, anon;
grant execute on function public.load_student_question_bank(bigint, uuid) to authenticated;
grant execute on function public.load_student_question_bank(bigint, uuid) to service_role;

comment on function public.load_student_question_bank(bigint, uuid) is
  'Fail-closed student question loader: valid enrollment and exact preparation link, active applicability/question, and exact ADERENTE + APROVADA preparation review.';

drop policy if exists question_applicability_select_authorized on public.question_applicability;
create policy question_applicability_select_authorized
on public.question_applicability
for select
to authenticated
using (
  (select public.is_admin())
  or (
    active = true
    and exists (
      select 1
      from public.questions q
      join public.question_preparation_editorial_reviews r
        on r.question_id = q.id
       and r.preparation_id = question_applicability.preparation_id
       and r.adherence = 'ADERENTE'
       and r.editorial_quality = 'APROVADA'
      join public.course_preparations cp
        on cp.preparation_id = question_applicability.preparation_id
       and cp.active = true
      join public.user_courses uc
        on uc.course_id = cp.course_id
       and uc.user_id = (select auth.uid())
       and uc.status = 'active'
       and (uc.starts_at is null or uc.starts_at <= now())
       and (uc.expires_at is null or uc.expires_at > now())
      where q.id = question_applicability.question_id
        and q.active = true
    )
  )
);

drop policy if exists questions_select_authorized on public.questions;
create policy questions_select_authorized
on public.questions
for select
to authenticated
using (
  (select public.is_admin())
  or (
    active = true
    and exists (
      select 1
      from public.question_applicability qa
      join public.question_preparation_editorial_reviews r
        on r.question_id = questions.id
       and r.preparation_id = qa.preparation_id
       and r.adherence = 'ADERENTE'
       and r.editorial_quality = 'APROVADA'
      join public.course_preparations cp
        on cp.preparation_id = qa.preparation_id
       and cp.active = true
      join public.user_courses uc
        on uc.course_id = cp.course_id
       and uc.user_id = (select auth.uid())
       and uc.status = 'active'
       and (uc.starts_at is null or uc.starts_at <= now())
       and (uc.expires_at is null or uc.expires_at > now())
      where qa.question_id = questions.id
        and qa.active = true
    )
  )
);

drop policy if exists qac_select_authorized on public.question_applicability_content;
create policy qac_select_authorized
on public.question_applicability_content
for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.question_applicability qa
    join public.questions q
      on q.id = qa.question_id
     and q.active = true
    join public.question_preparation_editorial_reviews r
      on r.question_id = qa.question_id
     and r.preparation_id = qa.preparation_id
     and r.adherence = 'ADERENTE'
     and r.editorial_quality = 'APROVADA'
    join public.course_preparations cp
      on cp.preparation_id = qa.preparation_id
     and cp.active = true
    join public.user_courses uc
      on uc.course_id = cp.course_id
     and uc.user_id = (select auth.uid())
     and uc.status = 'active'
     and (uc.starts_at is null or uc.starts_at <= now())
     and (uc.expires_at is null or uc.expires_at > now())
    where qa.id = question_applicability_content.applicability_id
      and qa.preparation_id = question_applicability_content.preparation_id
      and qa.active = true
  )
);
