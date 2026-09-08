-- Nós Passa — identificação de alunos e tentativas de pagamento
alter table public.profiles add column if not exists telefone text;

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, telefone, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'nome', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'telefone', ''),
    'student',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        nome = case when excluded.nome <> '' then excluded.nome else public.profiles.nome end,
        telefone = case when excluded.telefone <> '' then excluded.telefone else public.profiles.telefone end;
  return new;
end;
$$;

-- Execute este arquivo no Supabase > SQL Editor uma única vez.