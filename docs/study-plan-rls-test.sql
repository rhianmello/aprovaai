-- Nós Passa — testes de isolamento do Meu Plano
-- Use em ambiente de teste. Substitua os UUIDs pelos usuários de teste.
-- Estes testes são deliberadamente destrutivos apenas dentro de uma transação que termina com ROLLBACK.

-- Usuário A: deve conseguir ler o próprio plano.
-- Usuário B: deve receber 0 linhas ao tentar ler o plano de A.
-- As tentativas de INSERT/UPDATE/DELETE cruzadas devem ser rejeitadas pela combinação de RLS + FKs compostas.

-- 1) Confirme a existência das policies.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('study_plans','study_plan_activities','study_sessions','study_session_intervals')
order by tablename, policyname;

-- 2) Confirme as FKs compostas.
select
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name=kcu.constraint_name
 and tc.table_schema=kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name=tc.constraint_name
 and ccu.table_schema=tc.table_schema
where tc.constraint_type='FOREIGN KEY'
  and tc.table_schema='public'
  and tc.table_name in ('study_plan_activities','study_sessions','study_session_intervals')
order by tc.table_name,tc.constraint_name,kcu.ordinal_position;

-- 3) Verifique os índices de isolamento/concorrência.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('study_plans','study_plan_activities','study_sessions','study_session_intervals')
order by tablename,indexname;

-- 4) Teste manual com dois usuários autenticados.
-- O SQL Editor normalmente executa como postgres; para teste real de RLS use
-- um cliente autenticado como cada usuário (ou a conexão Supabase com o role
-- authenticated e os claims do usuário). Não considere este diagnóstico como
-- substituto de uma requisição autenticada real.
--
-- Usuário A deve conseguir:
--   select * from public.study_plans;
--   select * from public.study_plan_activities;
--   select * from public.study_sessions;
--   select * from public.study_session_intervals;
--
-- Usuário B não deve enxergar nenhuma linha de A e deve ter os seguintes testes rejeitados:
--   select * from public.study_plans where id = '<PLAN_A>';
--   select * from public.study_plan_activities where id = '<ACTIVITY_A>';
--   insert into public.study_plan_activities(plan_id,user_id,course_id,day_of_week,start_time,subject,topic,planned_duration,order_index)
--     values('<PLAN_A>','<USER_B>','<COURSE_A>',1,'08:00','Teste','Teste',30,99);
--   update public.study_plan_activities set topic='Tentativa' where id='<ACTIVITY_A>';
--   delete from public.study_plan_activities where id='<ACTIVITY_A>';
--   insert into public.study_sessions(user_id,course_id,plan_activity_id,planned_duration,status)
--     values('<USER_B>','<COURSE_A>','<ACTIVITY_A>',30,'running');
