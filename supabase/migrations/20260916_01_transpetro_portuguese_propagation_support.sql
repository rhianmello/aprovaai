-- Transpetro Portuguese propagation support
-- Creates operation tracking tables and a rollback function for the controlled
-- propagation of already approved Portuguese editorial decisions.
-- This migration does not modify questions, reviews, applicability, enrollments,
-- payments, or course data.

begin;

create table if not exists public.question_publication_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  description text not null,
  status text not null default 'running'
    check (status in ('running','completed','rolled_back','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.question_publication_operation_reviews (
  operation_id uuid not null references public.question_publication_operations(id) on delete cascade,
  review_id uuid not null,
  question_id uuid not null,
  preparation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, review_id),
  unique (operation_id, question_id, preparation_id)
);

create table if not exists public.question_publication_operation_applicability (
  operation_id uuid not null references public.question_publication_operations(id) on delete cascade,
  applicability_id uuid not null,
  question_id uuid not null,
  preparation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, applicability_id),
  unique (operation_id, question_id, preparation_id)
);

alter table public.question_publication_operations enable row level security;
alter table public.question_publication_operation_reviews enable row level security;
alter table public.question_publication_operation_applicability enable row level security;

drop policy if exists question_publication_operations_admin_all on public.question_publication_operations;
create policy question_publication_operations_admin_all
  on public.question_publication_operations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists question_publication_operation_reviews_admin_all on public.question_publication_operation_reviews;
create policy question_publication_operation_reviews_admin_all
  on public.question_publication_operation_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists question_publication_operation_applicability_admin_all on public.question_publication_operation_applicability;
create policy question_publication_operation_applicability_admin_all
  on public.question_publication_operation_applicability
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.rollback_question_publication_operation(p_operation_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operation_id uuid;
  v_reviews_deleted integer := 0;
  v_applicability_deleted integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode = '42501';
  end if;

  select id into v_operation_id
  from public.question_publication_operations
  where operation_key = p_operation_key
  for update;

  if v_operation_id is null then
    raise exception 'Operacao nao encontrada: %', p_operation_key;
  end if;

  delete from public.question_applicability a
  using public.question_publication_operation_applicability log
  where log.operation_id = v_operation_id
    and a.id = log.applicability_id
    and a.question_id = log.question_id
    and a.preparation_id = log.preparation_id;
  get diagnostics v_applicability_deleted = row_count;

  delete from public.question_preparation_editorial_reviews r
  using public.question_publication_operation_reviews log
  where log.operation_id = v_operation_id
    and r.id = log.review_id
    and r.question_id = log.question_id
    and r.preparation_id = log.preparation_id
    and r.classification_method = 'automatica'
    and r.rule_version = p_operation_key;
  get diagnostics v_reviews_deleted = row_count;

  update public.question_publication_operations
  set status = 'rolled_back', rolled_back_at = now()
  where id = v_operation_id;

  return jsonb_build_object(
    'operation_key', p_operation_key,
    'reviews_deleted', v_reviews_deleted,
    'applicability_deleted', v_applicability_deleted
  );
end;
$$;

revoke all on function public.rollback_question_publication_operation(text) from public, anon;
grant execute on function public.rollback_question_publication_operation(text) to authenticated;

comment on function public.rollback_question_publication_operation(text) is
  'Rolls back only reviews and applicability rows explicitly logged for a controlled question publication operation.';

commit;
