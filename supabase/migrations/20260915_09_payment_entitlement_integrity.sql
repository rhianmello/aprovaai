-- Keep one canonical purchase per Mercado Pago subscription while allowing its renewal events.
drop index if exists public.purchases_provider_subscription_uidx;

create unique index purchases_provider_subscription_uidx
  on public.purchases (provider_subscription_id)
  where provider_subscription_id is not null
    and billing_mode <> 'recurring';

create or replace function public.grant_course_on_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_duration interval;
  v_expiry timestamptz;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    v_start := coalesce(new.paid_at, now());
    v_duration := case
      when coalesce(new.billing_mode, 'one_time') in ('monthly', 'recurring')
        then interval '1 month'
      else interval '1 year'
    end;
    v_expiry := v_start + v_duration;

    insert into public.user_courses(user_id, course_id, status, purchased_at, expires_at)
    values(new.user_id, new.course_id, 'active', v_start, v_expiry)
    on conflict(user_id, course_id) do update set
      status = 'active',
      purchased_at = coalesce(public.user_courses.purchased_at, excluded.purchased_at),
      expires_at = greatest(
        coalesce(public.user_courses.expires_at, v_start),
        v_start
      ) + v_duration;
  end if;
  return new;
end;
$$;

create or replace function public.revoke_course_on_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase record;
  v_expiry timestamptz;
  v_duration interval;
begin
  if new.status in ('refunded', 'cancelled')
     and old.status is distinct from new.status then
    for v_purchase in
      select p.paid_at, p.billing_mode
      from public.purchases p
      where p.user_id = new.user_id
        and p.course_id = new.course_id
        and p.id <> new.id
        and p.status = 'paid'
        and p.paid_at is not null
      order by p.paid_at, p.created_at, p.id
    loop
      v_duration := case
        when coalesce(v_purchase.billing_mode, 'one_time') in ('monthly', 'recurring')
          then interval '1 month'
        else interval '1 year'
      end;
      v_expiry := greatest(coalesce(v_expiry, v_purchase.paid_at), v_purchase.paid_at)
                  + v_duration;
    end loop;

    update public.user_courses
    set status = case
          when v_expiry is not null and v_expiry > now() then 'active'
          else 'blocked'
        end,
        expires_at = coalesce(v_expiry, expires_at)
    where user_id = new.user_id
      and course_id = new.course_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.grant_course_on_paid() from public, anon, authenticated;
revoke execute on function public.revoke_course_on_refund() from public, anon, authenticated;
