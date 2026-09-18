-- Persistent admin queue for controlled Transpetro QAPI imports.
-- This stores progress only. It does not publish questions and does not alter auth.

create table if not exists public.transpetro_question_fill_runs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued','running','paused','completed','failed','cancelled')),
  requested_by uuid references auth.users(id),
  started_at timestamptz,
  finished_at timestamptz,
  current_task_id uuid,
  pages_processed integer not null default 0,
  found integer not null default 0,
  imported integer not null default 0,
  reused integer not null default 0,
  duplicates integer not null default 0,
  rejected integer not null default 0,
  errors integer not null default 0,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transpetro_question_fill_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.transpetro_question_fill_runs(id) on delete cascade,
  position integer not null,
  matter text not null,
  topic text,
  qapi_materia text not null,
  qapi_assunto text,
  topic_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','dry_run_running','dry_run_passed','importing','paused','completed','failed','skipped')),
  phase text not null default 'idle'
    check (phase in ('idle','dry_run','import')),
  page_next integer not null default 1 check (page_next >= 1),
  page_end integer,
  pages_processed integer not null default 0,
  found integer not null default 0,
  imported integer not null default 0,
  reused integer not null default 0,
  duplicates integer not null default 0,
  rejected integer not null default 0,
  errors integer not null default 0,
  dry_run_summary jsonb not null default '{}'::jsonb,
  last_result jsonb not null default '{}'::jsonb,
  new_questions jsonb not null default '[]'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, position),
  unique (run_id, matter)
);

create index if not exists transpetro_question_fill_queue_run_idx
  on public.transpetro_question_fill_queue(run_id, position);

create index if not exists transpetro_question_fill_queue_status_idx
  on public.transpetro_question_fill_queue(run_id, status, position);

alter table public.transpetro_question_fill_runs enable row level security;
alter table public.transpetro_question_fill_queue enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transpetro_question_fill_runs'
      and policyname = 'Admins manage Transpetro question fill runs'
  ) then
    create policy "Admins manage Transpetro question fill runs"
      on public.transpetro_question_fill_runs
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transpetro_question_fill_queue'
      and policyname = 'Admins manage Transpetro question fill queue'
  ) then
    create policy "Admins manage Transpetro question fill queue"
      on public.transpetro_question_fill_queue
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

grant select, insert, update on public.transpetro_question_fill_runs to authenticated;
grant select, insert, update on public.transpetro_question_fill_queue to authenticated;

drop view if exists public.transpetro_question_fill_backlog;

create view public.transpetro_question_fill_backlog
with (security_invoker = true)
as
with transpetro_preps as (
  select distinct p.id as preparation_id
  from public.preparations p
  join public.academic_editions e on e.id = p.edition_id
  join public.academic_contests c on c.id = e.contest_id
  where p.active = true
    and e.active = true
    and c.active = true
    and c.name ilike '%transpetro%'
), content_scope as (
  select
    s.name as source_matter,
    ci.title as topic,
    ci.id as content_item_id,
    ci.preparation_id
  from public.academic_content_items ci
  join public.academic_subjects s on s.id = ci.subject_id
  join transpetro_preps tp on tp.preparation_id = ci.preparation_id
  where ci.active = true
), published as (
  select
    qac.content_item_id,
    qac.preparation_id,
    count(distinct a.question_id) as questions
  from public.question_applicability_content qac
  join public.question_applicability a
    on a.id = qac.applicability_id
   and a.preparation_id = qac.preparation_id
   and a.active = true
  join public.question_preparation_editorial_reviews r
    on r.question_id = a.question_id
   and r.preparation_id = a.preparation_id
   and r.adherence = 'ADERENTE'
   and r.editorial_quality = 'APROVADA'
  group by qac.content_item_id, qac.preparation_id
), topic_rollup as (
  select
    cs.source_matter,
    cs.topic,
    count(distinct cs.preparation_id) as preparations_with_topic,
    count(*) as content_items,
    count(*) filter (where coalesce(p.questions, 0) = 0) as zero_content_items,
    coalesce(sum(p.questions), 0)::integer as published_links,
    coalesce(max(p.questions), 0)::integer as max_questions_per_item
  from content_scope cs
  left join published p
    on p.content_item_id = cs.content_item_id
   and p.preparation_id = cs.preparation_id
  group by cs.source_matter, cs.topic
), classified as (
  select
    case
      when source_matter = 'Conhecimentos Específicos' and preparations_with_topic > 1 then 10
      when source_matter = 'Conhecimentos Específicos' then 11
      when source_matter = 'Matemática' then 1
      when source_matter = 'Língua Inglesa' then 2
      when source_matter = 'Inglês Técnico Marítimo' then 3
      when source_matter = 'Gestão de Projetos' then 4
      when source_matter = 'Business Intelligence' then 5
      when source_matter = 'Mineração de Dados' then 6
      when source_matter = 'Modelagem de Sistemas de Informação' then 7
      when source_matter = 'ERP - Sistema de Gestão Integrada (SAP-ERP)' then 8
      when source_matter = 'Língua Portuguesa' then 9
      else 99
    end as matter_order,
    case
      when source_matter = 'Conhecimentos Específicos' and preparations_with_topic > 1 then 'Conhecimentos Específicos compartilhados'
      when source_matter = 'Conhecimentos Específicos' then 'Conhecimentos Específicos exclusivos'
      else source_matter
    end as matter,
    case
      when source_matter = 'ERP - Sistema de Gestão Integrada (SAP-ERP)' then 'SAP/ERP'
      when source_matter = 'Conhecimentos Específicos' then 'Conhecimentos Específicos'
      else source_matter
    end as qapi_materia,
    source_matter,
    topic,
    preparations_with_topic,
    content_items,
    zero_content_items,
    published_links,
    max_questions_per_item
  from topic_rollup
), eligible as (
  select *
  from classified
  where matter_order between 1 and 11
    and not (
      source_matter = 'Língua Portuguesa'
      and topic in (
        'Compreensão de textos de gêneros variados',
        'Ortografia oficial',
        'Mecanismos de coesão textual',
        'Emprego das classes de palavras',
        'Concordância nominal e verbal',
        'Emprego do sinal indicativo de crase',
        'Sinais de pontuação',
        'Significação das palavras'
      )
    )
    and (
      source_matter <> 'Língua Portuguesa'
      or zero_content_items > 0
    )
)
select
  row_number() over (
    order by matter_order,
      case when zero_content_items > 0 then 0 else 1 end,
      published_links,
      topic
  )::integer as queue_position,
  matter_order,
  matter,
  qapi_materia,
  topic,
  preparations_with_topic,
  content_items,
  zero_content_items,
  published_links,
  max_questions_per_item
from eligible;

grant select on public.transpetro_question_fill_backlog to authenticated;

comment on table public.transpetro_question_fill_runs
  is 'Admin-only persistent progress for the Transpetro QAPI fill workflow. Does not publish questions.';

comment on table public.transpetro_question_fill_queue
  is 'Admin-only queue rows processed by admin-v3 using qapi-bulk-import with the current admin JWT.';
