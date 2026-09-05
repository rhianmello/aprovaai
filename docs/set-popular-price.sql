-- Execute no Supabase SQL Editor depois do commercial-access.sql
-- Preço popular: R$ 12,00 por curso com 1 ano de acesso.
update public.courses
set price_cents = 1200
where active = true;
