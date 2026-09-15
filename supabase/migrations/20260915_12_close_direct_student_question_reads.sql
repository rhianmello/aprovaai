drop policy if exists question_applicability_select_authorized on public.question_applicability;
drop policy if exists questions_select_authorized on public.questions;
drop policy if exists qac_select_authorized on public.question_applicability_content;

comment on function public.load_student_question_bank(bigint, uuid) is
  'Exclusive fail-closed student question loader: valid enrollment and exact preparation link, active applicability/question, and exact ADERENTE + APROVADA preparation review. Direct student SELECT on question catalog tables is intentionally denied by RLS.';
