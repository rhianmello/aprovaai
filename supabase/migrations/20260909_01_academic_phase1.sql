-- NÓS PASSA — FASE 1 ACADEMICA
-- DRAFT REVIEW ONLY. NÃO EXECUTAR AUTOMATICAMENTE.
-- Baseado na auditoria do schema atual e no DDL consolidado.
-- Não faz INSERT/UPDATE/DELETE de dados existentes.
-- Não altera courses, user_courses, purchases, profiles ou pagamentos.
-- Ordem: PRECHECK -> 01A -> 01B-A -> 01C -> 01D -> 01E -> 01F -> 01G-A -> 01G-B -> 01H.

/* ================================================================
   00_PRECHECK — SOMENTE LEITURA
   ================================================================ */
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pgcrypto','uuid-ossp');

SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'academic_contests','academic_editions','academic_positions','preparations',
    'academic_subjects','academic_topics','academic_subtopics','academic_content_items',
    'questions','question_applicability','question_applicability_content',
    'question_attempts','course_preparations'
  )
ORDER BY c.relname;

SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='study_plans' AND column_name='preparation_id')
    OR (table_name='study_plan_activities' AND column_name IN ('preparation_id','content_item_id'))
    OR (table_name='study_sessions' AND column_name='preparation_id'))
ORDER BY table_name,column_name;

SELECT conrelid::regclass AS table_name,conname,contype,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace='public'::regnamespace
ORDER BY table_name,conname;

SELECT schemaname,tablename,indexname,indexdef
FROM pg_indexes
WHERE schemaname='public'
ORDER BY tablename,indexname;

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename,policyname;

SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('is_admin')
ORDER BY p.proname;

/* STOP if any target academic table already exists, if any legacy column
   already exists with an incompatible definition, or if required is_admin()
   is absent. Do not mask conflicts with IF NOT EXISTS. */

/* ================================================================
   01A — NOVAS TABELAS
   ================================================================ */
BEGIN;

CREATE TABLE public.academic_contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL,
  name text NOT NULL,
  official_name text,
  code text,
  year smallint,
  banca text,
  level text,
  quadro text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  level text,
  type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL,
  position_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.academic_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  topic_id uuid,
  subtopic_id uuid,
  title text NOT NULL,
  edital_item text,
  mandatory boolean NOT NULL DEFAULT true,
  observation text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_content_subtopic_requires_topic CHECK (subtopic_id IS NULL OR topic_id IS NOT NULL)
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement text NOT NULL,
  alternatives jsonb,
  answer text,
  explanation text,
  source_type text,
  source_reference text,
  year smallint,
  is_original boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  preparation_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_applicability_content (
  applicability_id uuid NOT NULL,
  content_item_id uuid NOT NULL,
  preparation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (applicability_id,content_item_id)
);

CREATE TABLE public.question_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL,
  preparation_id uuid NOT NULL,
  selected_answer text,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now(),
  time_spent_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;

/* ================================================================
   01B-A — CONSTRAINTS ACADEMICAS
   ================================================================ */
BEGIN;

ALTER TABLE public.academic_editions
  ADD CONSTRAINT fk_academic_editions_contest
  FOREIGN KEY (contest_id) REFERENCES public.academic_contests(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.academic_positions
  ADD CONSTRAINT uq_academic_positions_id_edition UNIQUE (id,edition_id),
  ADD CONSTRAINT fk_academic_positions_edition
  FOREIGN KEY (edition_id) REFERENCES public.academic_editions(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.preparations
  ADD CONSTRAINT fk_preparations_edition
  FOREIGN KEY (edition_id) REFERENCES public.academic_editions(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_preparations_position_same_edition
  FOREIGN KEY (position_id,edition_id) REFERENCES public.academic_positions(id,edition_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.academic_topics
  ADD CONSTRAINT uq_academic_topics_id_subject UNIQUE (id,subject_id),
  ADD CONSTRAINT fk_academic_topics_subject
  FOREIGN KEY (subject_id) REFERENCES public.academic_subjects(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.academic_subtopics
  ADD CONSTRAINT uq_academic_subtopics_id_topic UNIQUE (id,topic_id),
  ADD CONSTRAINT fk_academic_subtopics_topic
  FOREIGN KEY (topic_id) REFERENCES public.academic_topics(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.academic_content_items
  ADD CONSTRAINT uq_academic_content_items_id_preparation UNIQUE (id,preparation_id),
  ADD CONSTRAINT fk_content_items_preparation
  FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_content_items_subject
  FOREIGN KEY (subject_id) REFERENCES public.academic_subjects(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_content_items_topic_same_subject
  FOREIGN KEY (topic_id,subject_id) REFERENCES public.academic_topics(id,subject_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_content_items_subtopic_same_topic
  FOREIGN KEY (subtopic_id,topic_id) REFERENCES public.academic_subtopics(id,topic_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.question_applicability
  ADD CONSTRAINT uq_question_applicability_question_preparation UNIQUE (question_id,preparation_id),
  ADD CONSTRAINT uq_question_applicability_id_preparation UNIQUE (id,preparation_id),
  ADD CONSTRAINT fk_question_applicability_question
  FOREIGN KEY (question_id) REFERENCES public.questions(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_question_applicability_preparation
  FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.question_applicability_content
  ADD CONSTRAINT fk_qac_applicability_same_preparation
  FOREIGN KEY (applicability_id,preparation_id)
  REFERENCES public.question_applicability(id,preparation_id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_qac_content_same_preparation
  FOREIGN KEY (content_item_id,preparation_id)
  REFERENCES public.academic_content_items(id,preparation_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.question_attempts
  ADD CONSTRAINT fk_question_attempts_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_question_attempts_question
  FOREIGN KEY (question_id) REFERENCES public.questions(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_question_attempts_question_preparation
  FOREIGN KEY (question_id,preparation_id)
  REFERENCES public.question_applicability(question_id,preparation_id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;

/* ================================================================
   01C — INDICES ACADEMICOS
   ================================================================ */
BEGIN;

CREATE UNIQUE INDEX ux_academic_contests_slug ON public.academic_contests(slug);
CREATE UNIQUE INDEX ux_academic_editions_contest_name ON public.academic_editions(contest_id,name);
CREATE UNIQUE INDEX ux_academic_positions_edition_name ON public.academic_positions(edition_id,name);
-- Intencionalmente NÃO existe UNIQUE(edition_id,position_id): preparation é 1:N por cargo.
CREATE UNIQUE INDEX ux_academic_subjects_slug ON public.academic_subjects(slug);
CREATE UNIQUE INDEX ux_academic_topics_subject_slug ON public.academic_topics(subject_id,slug);
CREATE UNIQUE INDEX ux_academic_subtopics_topic_slug ON public.academic_subtopics(topic_id,slug);
CREATE INDEX ix_academic_editions_contest ON public.academic_editions(contest_id);
CREATE INDEX ix_academic_positions_edition ON public.academic_positions(edition_id);
CREATE INDEX ix_preparations_edition ON public.preparations(edition_id);
CREATE INDEX ix_preparations_position ON public.preparations(position_id);
CREATE INDEX ix_content_items_preparation ON public.academic_content_items(preparation_id);
CREATE INDEX ix_content_items_subject ON public.academic_content_items(subject_id);
CREATE INDEX ix_content_items_topic ON public.academic_content_items(topic_id);
CREATE INDEX ix_content_items_subtopic ON public.academic_content_items(subtopic_id);
CREATE INDEX ix_question_applicability_preparation ON public.question_applicability(preparation_id);
CREATE INDEX ix_question_applicability_question ON public.question_applicability(question_id);
CREATE INDEX ix_qac_content_item ON public.question_applicability_content(content_item_id);
CREATE INDEX ix_qac_preparation ON public.question_applicability_content(preparation_id);
CREATE INDEX ix_question_attempts_user_preparation ON public.question_attempts(user_id,preparation_id);
CREATE INDEX ix_question_attempts_question ON public.question_attempts(question_id);
CREATE INDEX ix_question_attempts_answered_at ON public.question_attempts(answered_at);

COMMIT;

/* ================================================================
   01D — RLS BASE
   ================================================================ */
BEGIN;

ALTER TABLE public.academic_contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_applicability_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY academic_contests_authenticated_select ON public.academic_contests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_editions_authenticated_select ON public.academic_editions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_positions_authenticated_select ON public.academic_positions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_subjects_authenticated_select ON public.academic_subjects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_topics_authenticated_select ON public.academic_topics
  FOR SELECT TO authenticated USING (true);
CREATE POLICY academic_subtopics_authenticated_select ON public.academic_subtopics
  FOR SELECT TO authenticated USING (true);

-- Admin já existente no projeto.
CREATE POLICY academic_contests_admin_all ON public.academic_contests
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY academic_editions_admin_all ON public.academic_editions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY academic_positions_admin_all ON public.academic_positions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY academic_subjects_admin_all ON public.academic_subjects
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY academic_topics_admin_all ON public.academic_topics
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY academic_subtopics_admin_all ON public.academic_subtopics
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY preparations_admin_all ON public.preparations
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY content_items_admin_all ON public.academic_content_items
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY questions_admin_all ON public.questions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY question_applicability_admin_all ON public.question_applicability
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY question_applicability_content_admin_all ON public.question_applicability_content
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Attempts são append-only inclusive para o cliente. Admin pode consultar somente se necessário via sessão administrativa própria; não há UPDATE/DELETE policy.
CREATE POLICY question_attempts_select_own ON public.question_attempts
  FOR SELECT TO authenticated USING (user_id=auth.uid());

COMMIT;

/* ================================================================
   01E — COURSE_PREPARATIONS + POLICIES COMERCIAIS
   Regra de acesso alinhada ao course-access.js atual:
   user_courses.status='active', expires_at nulo ou futuro, course ativo.
   ================================================================ */
BEGIN;

CREATE TABLE public.course_preparations (
  course_id bigint NOT NULL,
  preparation_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id,preparation_id),
  CONSTRAINT fk_course_preparations_course
    FOREIGN KEY (course_id) REFERENCES public.courses(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_course_preparations_preparation
    FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX ix_course_preparations_preparation ON public.course_preparations(preparation_id);
CREATE INDEX ix_course_preparations_course_active ON public.course_preparations(course_id) WHERE active=true;
ALTER TABLE public.course_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_preparations_select_authorized ON public.course_preparations
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      WHERE uc.user_id=auth.uid()
        AND uc.course_id=course_preparations.course_id
        AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true
    )
  );
CREATE POLICY course_preparations_admin_all ON public.course_preparations
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY preparations_select_authorized ON public.preparations
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      JOIN public.course_preparations cp ON cp.course_id=uc.course_id
      WHERE uc.user_id=auth.uid()
        AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true
        AND cp.active=true
        AND cp.preparation_id=preparations.id
    )
  );

CREATE POLICY content_items_select_authorized ON public.academic_content_items
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      JOIN public.course_preparations cp ON cp.course_id=uc.course_id
      WHERE uc.user_id=auth.uid()
        AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true AND cp.active=true
        AND cp.preparation_id=academic_content_items.preparation_id
    )
  );

CREATE POLICY questions_select_authorized ON public.questions
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1
      FROM public.question_applicability qa
      JOIN public.course_preparations cp ON cp.preparation_id=qa.preparation_id AND cp.active=true
      JOIN public.user_courses uc ON uc.course_id=cp.course_id
      JOIN public.courses c ON c.id=uc.course_id AND c.active=true
      WHERE qa.question_id=questions.id AND qa.active=true
        AND uc.user_id=auth.uid() AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
    )
  );

CREATE POLICY question_applicability_select_authorized ON public.question_applicability
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      JOIN public.course_preparations cp ON cp.course_id=uc.course_id
      WHERE uc.user_id=auth.uid() AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true AND cp.active=true
        AND cp.preparation_id=question_applicability.preparation_id
    )
  );

CREATE POLICY qac_select_authorized ON public.question_applicability_content
  FOR SELECT TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      JOIN public.course_preparations cp ON cp.course_id=uc.course_id
      WHERE uc.user_id=auth.uid() AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true AND cp.active=true
        AND cp.preparation_id=question_applicability_content.preparation_id
    )
  );

CREATE POLICY question_attempts_insert_authorized ON public.question_attempts
  FOR INSERT TO authenticated WITH CHECK (
    user_id=auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_courses uc
      JOIN public.courses c ON c.id=uc.course_id
      JOIN public.course_preparations cp ON cp.course_id=uc.course_id
      WHERE uc.user_id=auth.uid() AND uc.status='active'
        AND (uc.expires_at IS NULL OR uc.expires_at>now())
        AND c.active=true AND cp.active=true
        AND cp.preparation_id=question_attempts.preparation_id
    )
  );

COMMIT;

/* ================================================================
   01F — LEGACY COLUMNS (NULLABLE; SEM BACKFILL)
   ================================================================ */
BEGIN;
ALTER TABLE public.study_plans ADD COLUMN preparation_id uuid NULL;
ALTER TABLE public.study_plan_activities ADD COLUMN preparation_id uuid NULL;
ALTER TABLE public.study_plan_activities ADD COLUMN content_item_id uuid NULL;
ALTER TABLE public.study_sessions ADD COLUMN preparation_id uuid NULL;
COMMIT;

/* ================================================================
   01G-A — LEGACY FKs / COMPOSITE INTEGRITY
   ================================================================ */
BEGIN;

ALTER TABLE public.study_plans
  ADD CONSTRAINT uq_study_plans_id_preparation UNIQUE (id,preparation_id),
  ADD CONSTRAINT fk_study_plans_preparation
    FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_study_plans_course_preparation
    FOREIGN KEY (course_id,preparation_id)
    REFERENCES public.course_preparations(course_id,preparation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.study_plan_activities
  ADD CONSTRAINT ck_activity_content_requires_preparation
    CHECK (content_item_id IS NULL OR preparation_id IS NOT NULL),
  ADD CONSTRAINT uq_study_plan_activities_id_preparation UNIQUE (id,preparation_id),
  ADD CONSTRAINT fk_activities_preparation
    FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_activities_plan_same_preparation
    FOREIGN KEY (plan_id,preparation_id)
    REFERENCES public.study_plans(id,preparation_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_activities_content_same_preparation
    FOREIGN KEY (content_item_id,preparation_id)
    REFERENCES public.academic_content_items(id,preparation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.study_sessions
  ADD CONSTRAINT fk_study_sessions_preparation
    FOREIGN KEY (preparation_id) REFERENCES public.preparations(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_study_sessions_activity_same_preparation
    FOREIGN KEY (plan_activity_id,preparation_id)
    REFERENCES public.study_plan_activities(id,preparation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;

/* ================================================================
   01G-B — LEGACY INDICES
   ================================================================ */
CREATE INDEX ix_study_plans_preparation ON public.study_plans(preparation_id);
CREATE INDEX ix_study_plan_activities_preparation ON public.study_plan_activities(preparation_id);
CREATE INDEX ix_study_plan_activities_content_item ON public.study_plan_activities(content_item_id);
CREATE INDEX ix_study_sessions_preparation ON public.study_sessions(preparation_id);

/* ================================================================
   01H — VALIDATION / READ ONLY
   ================================================================ */
SELECT count(*) AS academic_table_count
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'academic_contests','academic_editions','academic_positions','preparations',
    'academic_subjects','academic_topics','academic_subtopics','academic_content_items',
    'questions','question_applicability','question_applicability_content',
    'question_attempts','course_preparations'
  );

SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='study_plans' AND column_name='preparation_id')
    OR (table_name='study_plan_activities' AND column_name IN ('preparation_id','content_item_id'))
    OR (table_name='study_sessions' AND column_name='preparation_id'))
ORDER BY table_name,column_name;

SELECT conrelid::regclass AS table_name,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND conrelid::regclass::text IN (
    'public.preparations','public.academic_content_items','public.question_applicability',
    'public.question_applicability_content','public.question_attempts',
    'public.study_plans','public.study_plan_activities','public.study_sessions'
  )
ORDER BY table_name,conname;

SELECT schemaname,tablename,indexname,indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN (
    'academic_contests','academic_editions','academic_positions','preparations',
    'academic_subjects','academic_topics','academic_subtopics','academic_content_items',
    'questions','question_applicability','question_applicability_content',
    'question_attempts','course_preparations','study_plans',
    'study_plan_activities','study_sessions'
  )
ORDER BY tablename,indexname;

SELECT schemaname,tablename,rowsecurity,forcerowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN (
    'academic_contests','academic_editions','academic_positions','preparations',
    'academic_subjects','academic_topics','academic_subtopics','academic_content_items',
    'questions','question_applicability','question_applicability_content',
    'question_attempts','course_preparations'
  )
ORDER BY tablename;

SELECT tablename,policyname,cmd,permissive,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'academic_contests','academic_editions','academic_positions','preparations',
    'academic_subjects','academic_topics','academic_subtopics','academic_content_items',
    'questions','question_applicability','question_applicability_content',
    'question_attempts','course_preparations'
  )
ORDER BY tablename,policyname;

-- Integridade lógica pós-migração: todos devem retornar 0.
SELECT p.id
FROM public.preparations p
JOIN public.academic_positions ap ON ap.id=p.position_id
WHERE p.edition_id<>ap.edition_id;

SELECT a.id
FROM public.academic_content_items a
JOIN public.academic_topics t ON t.id=a.topic_id
WHERE a.topic_id IS NOT NULL AND a.subject_id<>t.subject_id;

SELECT a.id
FROM public.academic_content_items a
JOIN public.academic_subtopics s ON s.id=a.subtopic_id
WHERE a.subtopic_id IS NOT NULL AND a.topic_id<>s.topic_id;

SELECT a.id
FROM public.study_plan_activities a
JOIN public.academic_content_items c ON c.id=a.content_item_id
WHERE a.content_item_id IS NOT NULL AND a.preparation_id<>c.preparation_id;

SELECT s.id
FROM public.study_sessions s
JOIN public.study_plan_activities a ON a.id=s.plan_activity_id
WHERE s.preparation_id IS NOT NULL AND s.preparation_id<>a.preparation_id;

SELECT qa.id
FROM public.question_attempts qa
LEFT JOIN public.question_applicability app
  ON app.question_id=qa.question_id AND app.preparation_id=qa.preparation_id
WHERE app.id IS NULL;

SELECT question_id,preparation_id,count(*)
FROM public.question_applicability
GROUP BY question_id,preparation_id
HAVING count(*)>1;

-- TESTES NEGATIVOS DEVEM SER EXECUTADOS SOMENTE APÓS DADOS DE TESTE EXISTIREM.
-- 1) preparation com position de outra edition -> FK violation
-- 2) content com topic de outro subject -> FK violation
-- 3) activity com content de outra preparation -> FK violation
-- 4) session com preparation diferente da activity -> FK violation
-- 5) attempt sem applicability -> FK violation
-- 6) usuário sem acesso -> SELECT content = 0 linhas
-- 7) usuário sem acesso -> SELECT questions = 0 linhas
-- 8) usuário sem acesso -> INSERT attempt = policy violation
-- 9) question/preparation divergente -> FK violation
-- 10) DELETE question_attempts -> sem policy, bloqueado por RLS
-- 11) UPDATE question_attempts -> sem policy, bloqueado por RLS
-- 12) SELECT attempts de outro usuário -> 0 linhas

-- IMPORTANTE:
-- NÃO há UNIQUE(edition_id,position_id) em preparations.
-- NÃO há UPDATE/DELETE policy para question_attempts.
-- NÃO há INSERT genérico para question_attempts.
-- NÃO há backfill nesta fase.
-- O índice legacy de sessão running/paused permanece intocado.
