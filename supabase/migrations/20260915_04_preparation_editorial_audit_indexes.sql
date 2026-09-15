-- Cover foreign keys used by preparation-scoped editorial audit queries and referential actions.
create index question_preparation_editorial_reviews_preparation_idx
  on public.question_preparation_editorial_reviews (preparation_id);

create index question_preparation_editorial_reviews_reviewer_idx
  on public.question_preparation_editorial_reviews (reviewed_by)
  where reviewed_by is not null;
