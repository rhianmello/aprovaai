BEGIN;

-- Reposiciona as alternativas das 20 questões iniciais do Nós Passa.
-- Objetivo: evitar padrão previsível de gabarito e manter o texto correto intacto.
-- A distribuição final é A/B/C/D/E = 4/4/4/4/4.
WITH ranked AS (
  SELECT id,
         answer,
         row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.questions
  WHERE source_reference LIKE 'Nos Passa | Transpetro 2026 SAP |%'
), targets AS (
  SELECT id,
         answer,
         (((rn - 1) % 5) + 1)::int AS target_idx
  FROM ranked
), rebuilt AS (
  SELECT t.id,
         chr((64 + t.target_idx)::int) AS target_letter,
         jsonb_agg(
           jsonb_build_object(
             'letra', chr((64 + (((x.ord::int - 1 - (ascii(t.answer) - 65) + (t.target_idx - 1) + 5) % 5) + 1))::int),
             'texto', x.elem ->> 'texto'
           )
           ORDER BY (((x.ord::int - 1 - (ascii(t.answer) - 65) + (t.target_idx - 1) + 5) % 5) + 1)
         ) AS alternatives
  FROM targets t
  JOIN LATERAL jsonb_array_elements(
    (SELECT q.alternatives FROM public.questions q WHERE q.id = t.id)
  ) WITH ORDINALITY x(elem, ord) ON true
  GROUP BY t.id, t.target_idx
)
UPDATE public.questions q
SET alternatives = r.alternatives,
    answer = r.target_letter
FROM rebuilt r
WHERE q.id = r.id;

COMMIT;
