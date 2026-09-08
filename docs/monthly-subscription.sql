-- Nós Passa — assinatura mensal R$1
-- Execute UMA vez no Supabase > SQL Editor.
-- O acesso é por curso e permanece liberado somente até expires_at.
-- O usuário continua podendo entrar na conta; apenas o curso fica bloqueado quando vencer.

-- Novo preço comercial: R$1 por mês.
alter table public.courses add column if not exists price_cents integer not null default 100;
update public.courses set price_cents = 100 where id in (1,2,3);

alter table public.purchases
  add column if not exists billing_mode text not null default 'one_time';

alter table public.purchases
  add column if not exists provider_subscription_id text;

alter table public.purchases
  add column if not exists next_billing_at timestamptz;

create unique index if not exists purchases_provider_subscription_uidx
  on public.purchases(provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists purchases_billing_mode_idx
  on public.purchases(billing_mode, created_at desc);

-- A partir desta migração, compras mensais concedem 1 mês por pagamento aprovado.
-- Compras antigas continuam preservando a regra anual.
create or replace function public.grant_course_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_expiry timestamptz;
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    v_start := coalesce(new.paid_at, now());

    if coalesce(new.billing_mode, 'one_time') = 'monthly' then
      v_expiry := v_start + interval '1 month';
    else
      v_expiry := v_start + interval '1 year';
    end if;

    insert into public.user_courses(user_id,course_id,status,purchased_at,expires_at)
    values(new.user_id,new.course_id,'active',v_start,v_expiry)
    on conflict(user_id,course_id) do update set
      status='active',
      purchased_at=excluded.purchased_at,
      expires_at=greatest(coalesce(public.user_courses.expires_at, now()), excluded.expires_at);
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_paid_grant_access on public.purchases;
create trigger purchases_paid_grant_access
after insert or update of status on public.purchases
for each row execute procedure public.grant_course_on_paid();

-- Renovação mensal atômica. É chamada pelo webhook após cada pagamento aprovado.
create or replace function public.renew_monthly_course_access(
  p_user_id uuid,
  p_course_id bigint,
  p_paid_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base timestamptz;
begin
  select greatest(coalesce(expires_at, now()), p_paid_at)
    into v_base
  from public.user_courses
  where user_id=p_user_id and course_id=p_course_id
  for update;

  if v_base is null then
    insert into public.user_courses(user_id,course_id,status,purchased_at,expires_at)
    values(p_user_id,p_course_id,'active',p_paid_at,p_paid_at + interval '1 month')
    on conflict(user_id,course_id) do update set
      status='active',
      purchased_at=coalesce(public.user_courses.purchased_at, excluded.purchased_at),
      expires_at=greatest(coalesce(public.user_courses.expires_at, p_paid_at), p_paid_at) + interval '1 month';
  else
    update public.user_courses
       set status='active',
           expires_at=v_base + interval '1 month'
     where user_id=p_user_id and course_id=p_course_id;
  end if;
end;
$$;

revoke execute on function public.renew_monthly_course_access(uuid,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.renew_monthly_course_access(uuid,bigint,timestamptz) to service_role;

-- Reafirma a regra de acesso: curso vencido não é acessível.
create or replace function public.has_course_access(p_course_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists(
    select 1 from public.user_courses uc
    where uc.user_id=auth.uid()
      and uc.course_id=p_course_id
      and uc.status='active'
      and (uc.expires_at is null or uc.expires_at>now())
  );
$$;

revoke execute on function public.has_course_access(bigint) from public, anon;
grant execute on function public.has_course_access(bigint) to authenticated;
