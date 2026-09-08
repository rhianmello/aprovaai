-- A tabela user_courses do projeto usa created_at como data de criação,
-- mas o painel administrativo atual também grava starts_at.
-- Esta migração adiciona a coluna esperada sem apagar dados existentes.

alter table public.user_courses
  add column if not exists starts_at timestamptz;

update public.user_courses
set starts_at = coalesce(starts_at, created_at, now())
where starts_at is null;

alter table public.user_courses
  alter column starts_at set default now();

comment on column public.user_courses.starts_at is 'Data de início do período de acesso da matrícula';