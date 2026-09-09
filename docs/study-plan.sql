-- Nós Passa — Meu Plano de Estudos (MVP)
-- Execute UMA vez no Supabase > SQL Editor.
-- Estrutura isolada por usuário e por curso, com sessões por intervalos.

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete restrict,
  name text not null default 'Meu Plano',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, course_id)
);

create unique index if not exists study_plans_one_active_per_user_course
  on public.study_plans(user_id, course_id)
  where active = true;

create index if not exists study_plans_user_course_idx
  on public.study_plans(user_id, course_id, active);

create table if not exists public.study_plan_activities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  subject text not null check (length(trim(subject)) between 1 and 160),
  topic text not null check (length(trim(topic)) between 1 and 240),
  planned_duration integer not null check (planned_duration between 5 and 720),
  order_index integer not null default 0 check (order_index >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, course_id),
  constraint study_plan_activities_plan_owner_fk
    foreign key (plan_id, user_id, course_id)
    references public.study_plans(id, user_id, course_id)
    on delete cascade
);

create index if not exists study_plan_activities_plan_day_idx
  on public.study_plan_activities(plan_id, day_of_week, order_index)
  where active = true;

create index if not exists study_plan_activities_user_course_idx
  on public.study_plan_activities(user_id, course_id, active);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null,
  plan_activity_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  planned_duration integer not null check (planned_duration between 5 and 720),
  actual_duration_seconds integer not null default 0 check (actual_duration_seconds >= 0),
  status text not null default 'running' check (status in ('running','paused','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, course_id),
  constraint study_sessions_activity_owner_fk
    foreign key (plan_activity_id, user_id, course_id)
    references public.study_plan_activities(id, user_id, course_id)
    on delete restrict
);

create index if not exists study_sessions_user_course_started_idx
  on public.study_sessions(user_id, course_id, started_at desc);

create index if not exists study_sessions_activity_idx
  on public.study_sessions(plan_activity_id, started_at desc);

create unique index if not exists study_sessions_one_open_per_user_course
  on public.study_sessions(user_id, course_id)
  where status in ('running','paused');

create table if not exists public.study_session_intervals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, user_id, course_id),
  constraint study_session_intervals_session_owner_fk
    foreign key (session_id, user_id, course_id)
    references public.study_sessions(id, user_id, course_id)
    on delete cascade,
  constraint study_session_intervals_time_ck
    check (ended_at is null or ended_at >= started_at),
  constraint study_session_intervals_heartbeat_ck
    check (last_heartbeat_at >= started_at)
);

create index if not exists study_session_intervals_session_idx
  on public.study_session_intervals(session_id, started_at);

create index if not exists study_session_intervals_user_course_idx
  on public.study_session_intervals(user_id, course_id, started_at desc);

create unique index if not exists study_session_intervals_one_open_per_session
  on public.study_session_intervals(session_id)
  where ended_at is null;

create or replace function public.study_plan_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists study_plans_set_updated_at on public.study_plans;
create trigger study_plans_set_updated_at
before update on public.study_plans
for each row execute procedure public.study_plan_set_updated_at();

drop trigger if exists study_plan_activities_set_updated_at on public.study_plan_activities;
create trigger study_plan_activities_set_updated_at
before update on public.study_plan_activities
for each row execute procedure public.study_plan_set_updated_at();

drop trigger if exists study_sessions_set_updated_at on public.study_sessions;
create trigger study_sessions_set_updated_at
before update on public.study_sessions
for each row execute procedure public.study_plan_set_updated_at();

create or replace function public.study_recalc_session_duration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_course bigint := coalesce(new.course_id, old.course_id);
  v_seconds integer;
begin
  if not exists (
    select 1 from public.study_sessions s
    where s.id = v_session and s.user_id = v_user and s.course_id = v_course
  ) then
    return coalesce(new, old);
  end if;

  select coalesce(round(sum(extract(epoch from (coalesce(i.ended_at, i.last_heartbeat_at) - i.started_at)))::numeric), 0)::integer
    into v_seconds
  from public.study_session_intervals i
  where i.session_id = v_session
    and i.user_id = v_user
    and i.course_id = v_course;

  update public.study_sessions
     set actual_duration_seconds = greatest(v_seconds, 0)
   where id = v_session
     and user_id = v_user
     and course_id = v_course;

  return coalesce(new, old);
end;
$$;

drop trigger if exists study_session_intervals_recalc_duration on public.study_session_intervals;
create trigger study_session_intervals_recalc_duration
after insert or update of started_at, ended_at, last_heartbeat_at or delete
on public.study_session_intervals
for each row execute procedure public.study_recalc_session_duration();

-- Reordenação transacional: recebe a ordem completa de um dia.
create or replace function public.reorder_study_plan_day(
  p_plan_id uuid,
  p_course_id bigint,
  p_day_of_week smallint,
  p_activity_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expected integer;
  v_received integer := coalesce(array_length(p_activity_ids, 1), 0);
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.study_plans p
    where p.id = p_plan_id and p.user_id = v_uid and p.course_id = p_course_id and p.active = true
  ) then
    raise exception 'plan_not_owned';
  end if;

  select count(*) into v_expected
  from public.study_plan_activities a
  where a.plan_id = p_plan_id
    and a.user_id = v_uid
    and a.course_id = p_course_id
    and a.day_of_week = p_day_of_week
    and a.active = true;

  if v_expected <> v_received then
    raise exception 'invalid_activity_set';
  end if;

  if exists (
    select 1
    from unnest(p_activity_ids) x
    where not exists (
      select 1 from public.study_plan_activities a
      where a.id = x
        and a.plan_id = p_plan_id
        and a.user_id = v_uid
        and a.course_id = p_course_id
        and a.day_of_week = p_day_of_week
        and a.active = true
    )
  ) then
    raise exception 'activity_not_owned';
  end if;

  update public.study_plan_activities a
     set order_index = x.ord::integer - 1
    from unnest(p_activity_ids) with ordinality as x(id, ord)
   where a.id = x.id
     and a.plan_id = p_plan_id
     and a.user_id = v_uid
     and a.course_id = p_course_id
     and a.day_of_week = p_day_of_week;
end;
$$;

-- RLS
alter table public.study_plans enable row level security;
alter table public.study_plan_activities enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_session_intervals enable row level security;

-- Policies: plano
 drop policy if exists study_plans_select_own on public.study_plans;
create policy study_plans_select_own
on public.study_plans for select to authenticated
using (user_id = auth.uid());

 drop policy if exists study_plans_insert_own on public.study_plans;
create policy study_plans_insert_own
on public.study_plans for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.user_courses uc
    where uc.user_id = auth.uid()
      and uc.course_id = study_plans.course_id
      and uc.status = 'active'
      and (uc.expires_at is null or uc.expires_at > now())
  )
);

 drop policy if exists study_plans_update_own on public.study_plans;
create policy study_plans_update_own
on public.study_plans for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

 drop policy if exists study_plans_delete_own on public.study_plans;
create policy study_plans_delete_own
on public.study_plans for delete to authenticated
using (user_id = auth.uid());

-- Policies: atividades
 drop policy if exists study_plan_activities_select_own on public.study_plan_activities;
create policy study_plan_activities_select_own
on public.study_plan_activities for select to authenticated
using (user_id = auth.uid());

 drop policy if exists study_plan_activities_insert_own on public.study_plan_activities;
create policy study_plan_activities_insert_own
on public.study_plan_activities for insert to authenticated
with check (user_id = auth.uid());

 drop policy if exists study_plan_activities_update_own on public.study_plan_activities;
create policy study_plan_activities_update_own
on public.study_plan_activities for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

 drop policy if exists study_plan_activities_delete_own on public.study_plan_activities;
create policy study_plan_activities_delete_own
on public.study_plan_activities for delete to authenticated
using (user_id = auth.uid());

-- Policies: sessões
 drop policy if exists study_sessions_select_own on public.study_sessions;
create policy study_sessions_select_own
on public.study_sessions for select to authenticated
using (user_id = auth.uid());

 drop policy if exists study_sessions_insert_own on public.study_sessions;
create policy study_sessions_insert_own
on public.study_sessions for insert to authenticated
with check (user_id = auth.uid());

 drop policy if exists study_sessions_update_own on public.study_sessions;
create policy study_sessions_update_own
on public.study_sessions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Histórico de sessão: não permitimos apagar para preservar auditoria do próprio usuário.
 drop policy if exists study_sessions_delete_own on public.study_sessions;
create policy study_sessions_delete_own
on public.study_sessions for delete to authenticated
using (user_id = auth.uid());

-- Policies: intervalos
 drop policy if exists study_session_intervals_select_own on public.study_session_intervals;
create policy study_session_intervals_select_own
on public.study_session_intervals for select to authenticated
using (user_id = auth.uid());

 drop policy if exists study_session_intervals_insert_own on public.study_session_intervals;
create policy study_session_intervals_insert_own
on public.study_session_intervals for insert to authenticated
with check (user_id = auth.uid());

 drop policy if exists study_session_intervals_update_own on public.study_session_intervals;
create policy study_session_intervals_update_own
on public.study_session_intervals for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

 drop policy if exists study_session_intervals_delete_own on public.study_session_intervals;
create policy study_session_intervals_delete_own
on public.study_session_intervals for delete to authenticated
using (user_id = auth.uid());

-- Corrige/remarca as funções de ordenação apenas para autenticados.
revoke execute on function public.reorder_study_plan_day(uuid,bigint,smallint,uuid[]) from public, anon;
grant execute on function public.reorder_study_plan_day(uuid,bigint,smallint,uuid[]) to authenticated;
