-- Nós Passa — FASE 2: base segura para ingestão/auditoria de questões
-- NÃO EXECUTAR SEM REVISÃO.
-- Objetivo: preparar metadados, auditoria, retomada e policies administrativas
-- sem alterar, apagar, publicar ou sobrescrever questões existentes.
--
-- Garantias desta migration:
-- - Não contém INSERT, UPDATE ou DELETE.
-- - Não altera o conteúdo de public.questions.
-- - Preserva integralmente as 48 questões QAPI já existentes.
-- - Não modifica gabaritos, enunciados, alternativas nem vínculos existentes.
-- - Apenas adiciona colunas nullable/default-safe, constraints, índices e policies.
-- - Amplia checks de status das tabelas de importação para suportar pipeline retomável.

begin;

/* ================================================================
   01 — Metadados editoriais e fonte preservada
   ================================================================ */

alter table public.question_editorial_metadata
  add column if not exists source text,
  add column if not exists source_assunto text,
  add column if not exists source_url text,
  add column if not exists source_title text,
  add column if not exists source_accessed_at timestamptz,
  add column if not exists source_payload jsonb,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists display_banca text,
  add column if not exists display_orgao text,
  add column if not exists display_cargo text,
  add column if not exists display_materia text,
  add column if not exists display_assunto text,
  add column if not exists import_batch_id uuid,
  add column if not exists imported_at timestamptz,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists quality_score integer,
  add column if not exists duplicate_of_question_id uuid,
  add column if not exists duplicate_score numeric,
  add column if not exists normalized_statement_hash text,
  add column if not exists normalized_full_hash text,
  add column if not exists normalized_alternatives jsonb,
  add column if not exists generation_method text,
  add column if not exists editorial_notes text;

alter table public.question_editorial_metadata
  add constraint if not exists question_editorial_metadata_import_batch_fkey
  foreign key (import_batch_id)
  references public.question_import_batches(id)
  on delete set null;

alter table public.question_editorial_metadata
  add constraint if not exists question_editorial_metadata_duplicate_question_fkey
  foreign key (duplicate_of_question_id)
  references public.questions(id)
  on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.question_editorial_metadata'::regclass
      and conname = 'question_editorial_metadata_validation_status_check'
  ) then
    alter table public.question_editorial_metadata
      add constraint question_editorial_metadata_validation_status_check
      check (validation_status in ('pending','validated','published','rejected','needs_review'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.question_editorial_metadata'::regclass
      and conname = 'question_editorial_metadata_quality_score_check'
  ) then
    alter table public.question_editorial_metadata
      add constraint question_editorial_metadata_quality_score_check
      check (quality_score is null or (quality_score >= 0 and quality_score <= 100))
      not valid;
  end if;
end $$;

/* ================================================================
   02 — Batches retomáveis e auditáveis
   ================================================================ */

alter table public.question_import_batches
  add column if not exists source text,
  add column if not exists target_per_discipline integer,
  add column if not exists requested integer not null default 0,
  add column if not exists found integer not null default 0,
  add column if not exists valid integer not null default 0,
  add column if not exists imported integer not null default 0,
  add column if not exists reused integer not null default 0,
  add column if not exists duplicates integer not null default 0,
  add column if not exists rejected integer not null default 0,
  add column if not exists needs_review integer not null default 0,
  add column if not exists pages_consulted integer not null default 0,
  add column if not exists errors jsonb not null default '[]'::jsonb,
  add column if not exists log jsonb not null default '[]'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists resume_cursor jsonb not null default '{}'::jsonb,
  add column if not exists dry_run boolean not null default false,
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.question_import_batches
  drop constraint if exists question_import_batches_status_check;

alter table public.question_import_batches
  add constraint question_import_batches_status_check
  check (status in ('queued','running','paused','completed','failed','cancelled','validated','imported'));

alter table public.question_import_batches
  drop constraint if exists question_import_batches_mode_check;

alter table public.question_import_batches
  add constraint question_import_batches_mode_check
  check (mode in ('dry_run','import','validate','dedupe','resume'));

/* ================================================================
   03 — Itens de importação com validação por questão
   ================================================================ */

alter table public.question_import_items
  add column if not exists source text,
  add column if not exists source_reference text,
  add column if not exists source_page integer,
  add column if not exists discipline text,
  add column if not exists subject text,
  add column if not exists action text,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists quality_score integer,
  add column if not exists duplicate_of_question_id uuid,
  add column if not exists duplicate_score numeric,
  add column if not exists raw_payload jsonb,
  add column if not exists normalized_payload jsonb,
  add column if not exists imported_at timestamptz;

alter table public.question_import_items
  add constraint if not exists question_import_items_duplicate_question_fkey
  foreign key (duplicate_of_question_id)
  references public.questions(id)
  on delete set null;

alter table public.question_import_items
  drop constraint if exists question_import_items_status_check;

alter table public.question_import_items
  add constraint question_import_items_status_check
  check (status in ('queued','validated','imported','reused','duplicate','skipped','error','rejected','needs_review'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.question_import_items'::regclass
      and conname = 'question_import_items_validation_status_check'
  ) then
    alter table public.question_import_items
      add constraint question_import_items_validation_status_check
      check (validation_status in ('pending','validated','published','rejected','needs_review'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.question_import_items'::regclass
      and conname = 'question_import_items_quality_score_check'
  ) then
    alter table public.question_import_items
      add constraint question_import_items_quality_score_check
      check (quality_score is null or (quality_score >= 0 and quality_score <= 100))
      not valid;
  end if;
end $$;

/* ================================================================
   04 — Índices para deduplicação, retomada e painel ADM
   ================================================================ */

create index if not exists idx_question_editorial_source_external
  on public.question_editorial_metadata(source, external_id)
  where source is not null and external_id is not null;

create index if not exists idx_question_editorial_source_reference
  on public.question_editorial_metadata(source_url)
  where source_url is not null;

create index if not exists idx_question_editorial_validation_status
  on public.question_editorial_metadata(validation_status);

create index if not exists idx_question_editorial_hash_statement
  on public.question_editorial_metadata(normalized_statement_hash)
  where normalized_statement_hash is not null;

create index if not exists idx_question_editorial_hash_full
  on public.question_editorial_metadata(normalized_full_hash)
  where normalized_full_hash is not null;

create index if not exists idx_question_editorial_duplicate_of
  on public.question_editorial_metadata(duplicate_of_question_id)
  where duplicate_of_question_id is not null;

create index if not exists idx_question_import_batches_status_created
  on public.question_import_batches(status, created_at desc);

create index if not exists idx_question_import_batches_source_status
  on public.question_import_batches(source, status, created_at desc)
  where source is not null;

create index if not exists idx_question_import_items_external
  on public.question_import_items(source, external_id)
  where source is not null and external_id is not null;

create index if not exists idx_question_import_items_status
  on public.question_import_items(batch_id, status);

create index if not exists idx_question_import_items_validation
  on public.question_import_items(batch_id, validation_status);

create index if not exists idx_question_import_items_duplicate_of
  on public.question_import_items(duplicate_of_question_id)
  where duplicate_of_question_id is not null;

/* ================================================================
   05 — RLS administrativa para tabelas de auditoria
   ================================================================ */

alter table public.question_editorial_metadata enable row level security;
alter table public.question_import_batches enable row level security;
alter table public.question_import_items enable row level security;

drop policy if exists question_editorial_metadata_admin_all on public.question_editorial_metadata;
create policy question_editorial_metadata_admin_all
  on public.question_editorial_metadata
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists question_import_batches_admin_all on public.question_import_batches;
create policy question_import_batches_admin_all
  on public.question_import_batches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists question_import_items_admin_all on public.question_import_items;
create policy question_import_items_admin_all
  on public.question_import_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;

/* ================================================================
   VALIDAÇÃO SOMENTE LEITURA PÓS-EXECUÇÃO
   ================================================================

-- 1) Garantir que a migration não alterou questões existentes:
select count(*) as total_questions from public.questions;
select source_type, count(*) from public.questions group by source_type order by source_type;

-- 2) Confirmar colunas adicionadas:
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('question_editorial_metadata','question_import_batches','question_import_items')
order by table_name, ordinal_position;

-- 3) Confirmar policies administrativas:
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('question_editorial_metadata','question_import_batches','question_import_items')
order by tablename, policyname;

-- 4) Confirmar que as 48 QAPI seguem presentes e intactas em public.questions:
select count(*) as qapi_total
from public.questions
where source_type='QAPI';

*/

/* ================================================================
   ROLLBACK ESTRUTURAL, SE NECESSÁRIO
   ================================================================

-- Esta migration é projetada para ser não destrutiva. Se ela for executada
-- e precisar ser revertida antes de uso produtivo das novas colunas, o rollback
-- deve ser feito em migration separada, revisada, removendo:
-- - policies question_*_admin_all criadas aqui;
-- - índices idx_question_editorial_* e idx_question_import_* criados aqui;
-- - constraints novas de validation_status/quality_score;
-- - colunas adicionadas nesta migration, somente se ainda estiverem vazias.
--
-- Não incluir rollback automático neste arquivo evita perda acidental de dados
-- caso as novas colunas já tenham sido preenchidas por auditoria futura.
*/
