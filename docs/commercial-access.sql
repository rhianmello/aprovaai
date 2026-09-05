-- Nós Passa — pagamentos, validade, acesso por curso e limite de dispositivos
-- Execute UMA vez no Supabase > SQL Editor.

alter table public.courses add column if not exists price_cents integer not null default 0;
update public.courses set price_cents = 1200 where price_cents = 0;

-- Política comercial inicial do Nós Passa: R$12 por curso/ano.
-- Se os cursos já tiverem outro preço salvo, ajuste manualmente conforme sua campanha.

alter table public.user_courses add column if not exists expires_at timestamptz;
create unique index if not exists user_courses_user_course_uidx on public.user_courses(user_id, course_id);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id bigint not null references public.courses(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0), currency text not null default 'BRL',
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  provider text, provider_payment_id text unique, payment_method text, paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases(user_id, created_at desc);
create index if not exists purchases_course_idx on public.purchases(course_id, created_at desc);
create index if not exists purchases_status_idx on public.purchases(status, created_at desc);

alter table public.purchases enable row level security;
drop policy if exists purchases_admin_all on public.purchases;
create policy purchases_admin_all on public.purchases for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists purchases_self_select on public.purchases;
create policy purchases_self_select on public.purchases for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists purchases_self_insert_pending on public.purchases;
create policy purchases_self_insert_pending on public.purchases for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

create or replace function public.grant_course_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_expiry timestamptz;
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    v_start:=coalesce(new.paid_at,now()); v_expiry:=v_start+interval '1 year';
    insert into public.user_courses(user_id,course_id,status,purchased_at,expires_at)
    values(new.user_id,new.course_id,'active',v_start,v_expiry)
    on conflict(user_id,course_id) do update set status='active',purchased_at=excluded.purchased_at,expires_at=excluded.expires_at;
  end if; return new;
end; $$;
drop trigger if exists purchases_paid_grant_access on public.purchases;
create trigger purchases_paid_grant_access after insert or update of status on public.purchases for each row execute procedure public.grant_course_on_paid();

create or replace function public.revoke_course_on_refund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in('refunded','cancelled') and old.status is distinct from new.status then
    update public.user_courses set status='blocked' where user_id=new.user_id and course_id=new.course_id;
  end if; return new;
end; $$;
drop trigger if exists purchases_refund_revoke_access on public.purchases;
create trigger purchases_refund_revoke_access after update of status on public.purchases for each row execute procedure public.revoke_course_on_refund();

create or replace function public.has_course_access(p_course_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists(
    select 1 from public.user_courses uc where uc.user_id=auth.uid() and uc.course_id=p_course_id
      and uc.status='active' and (uc.expires_at is null or uc.expires_at>now())
  );
$$;
revoke execute on function public.has_course_access(bigint) from public, anon;
grant execute on function public.has_course_access(bigint) to authenticated;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, device_name text, user_agent text, ip_address inet,
  active boolean not null default true, last_seen timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(user_id, device_id)
);
create index if not exists user_sessions_user_active_idx on public.user_sessions(user_id, active, last_seen desc);
alter table public.user_sessions enable row level security;
drop policy if exists user_sessions_admin_all on public.user_sessions;
create policy user_sessions_admin_all on public.user_sessions for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists user_sessions_self_select on public.user_sessions;
create policy user_sessions_self_select on public.user_sessions for select to authenticated using(user_id=auth.uid() or public.is_admin());

create or replace function public.register_device(p_device_id text, p_device_name text default null, p_user_agent text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid:=auth.uid(); v_count integer;
begin
  if v_uid is null or p_device_id is null or length(trim(p_device_id))<16 then return false; end if;
  if exists(select 1 from public.user_sessions where user_id=v_uid and device_id=trim(p_device_id)) then
    update public.user_sessions set active=true,device_name=coalesce(p_device_name,device_name),user_agent=coalesce(p_user_agent,user_agent),last_seen=now()
    where user_id=v_uid and device_id=trim(p_device_id); return true;
  end if;
  select count(*) into v_count from public.user_sessions where user_id=v_uid and active=true;
  if v_count>=2 then return false; end if;
  insert into public.user_sessions(user_id,device_id,device_name,user_agent,active,last_seen) values(v_uid,trim(p_device_id),p_device_name,p_user_agent,true,now());
  return true;
end; $$;
revoke execute on function public.register_device(text,text,text) from public, anon;
grant execute on function public.register_device(text,text,text) to authenticated;

update public.user_courses set expires_at=coalesce(purchased_at,created_at,now())+interval '1 year' where status='active' and expires_at is null;
