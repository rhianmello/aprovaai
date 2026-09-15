-- Editorial audit scoped to a preparation. This table never controls student access.
create table public.question_preparation_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  preparation_id uuid not null references public.preparations(id) on delete restrict,
  syllabus_topic text,
  subtopic text,
  adherence text not null default 'REVISAR'
    check (adherence in ('ADERENTE','NAO_ADERENTE','REVISAR')),
  editorial_quality text not null default 'PENDENTE'
    check (editorial_quality in ('PENDENTE','APROVADA','REVISAR','REPROVADA')),
  editorial_difficulty text
    check (editorial_difficulty in ('facil','media','dificil')),
  classification_reason text not null,
  classification_evidence jsonb not null default '{}'::jsonb,
  rule_version text,
  classification_method text not null default 'manual'
    check (classification_method in ('automatica','manual')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_preparation_editorial_reviews_unique
    unique (question_id, preparation_id),
  constraint question_preparation_editorial_reviews_topic_check
    check (
      syllabus_topic is null or syllabus_topic in (
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
);

create index question_preparation_editorial_reviews_question_idx
  on public.question_preparation_editorial_reviews (question_id);

alter table public.question_preparation_editorial_reviews enable row level security;

create policy question_preparation_editorial_reviews_admin_all
  on public.question_preparation_editorial_reviews
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

comment on table public.question_preparation_editorial_reviews is
  'Preparation-scoped editorial audit only. It does not create question applicability or student access.';
comment on column public.question_preparation_editorial_reviews.adherence is
  'Editorial adherence to this preparation syllabus; REVISAR is never inferred as NAO_ADERENTE.';
