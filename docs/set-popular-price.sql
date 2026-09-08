-- Nós Passa — preço popular atual
-- Execute no Supabase > SQL Editor.
-- A oferta atual é R$ 1,00 por mês, via assinatura.
update public.courses
set price_cents = 100
where active = true;
