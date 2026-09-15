-- Controlled QAPI import: database-level deduplication and one atomic transaction.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.questions'::regclass
      and conname = 'questions_source_type_source_reference_key'
  ) then
    alter table public.questions
      add constraint questions_source_type_source_reference_key
      unique (source_type, source_reference);
  end if;
end
$$;

create unique index if not exists question_editorial_metadata_full_hash_uidx
  on public.question_editorial_metadata (normalized_full_hash)
  where normalized_full_hash is not null;

create or replace function public.import_qapi_controlled_batch(
  p_requested_by uuid,
  p_page integer,
  p_size integer,
  p_materia text,
  p_preparation_slug text,
  p_parser_version text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_finished_at timestamptz;
  v_item jsonb;
  v_normalized jsonb;
  v_raw jsonb;
  v_external_id text;
  v_statement_hash text;
  v_full_hash text;
  v_question_id uuid;
  v_status text;
  v_action text;
  v_message text;
  v_errors jsonb;
  v_warnings jsonb;
  v_valid boolean;
  v_item_index integer := 0;
  v_found integer;
  v_valid_count integer := 0;
  v_imported integer := 0;
  v_reused integer := 0;
  v_duplicates integer := 0;
  v_rejected integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_size is null or p_size < 1 or p_size > 10 then
    raise exception 'size deve estar entre 1 e 10';
  end if;
  if p_page is null or p_page < 1 then
    raise exception 'page deve ser maior ou igual a 1';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items deve ser um array JSON';
  end if;

  v_found := jsonb_array_length(p_items);
  if v_found > p_size or v_found > 10 then
    raise exception 'o lote excede o limite controlado de 10 itens';
  end if;

  -- Serialize controlled imports. This prevents races between hash checks and inserts.
  perform pg_advisory_xact_lock(hashtextextended('qapi-controlled-import', 0));

  insert into public.question_import_batches (
    batch_name, preparation_slug, mode, status, total_items,
    imported_items, skipped_items, error_items, requested_by,
    source, target_per_discipline, requested, found, valid,
    imported, reused, duplicates, rejected, needs_review,
    pages_consulted, errors, log, started_at, resume_cursor,
    dry_run, config
  ) values (
    'qapi_import_' || to_char(v_started_at at time zone 'UTC', 'YYYYMMDD_HH24MISS_MS'),
    coalesce(nullif(btrim(p_preparation_slug), ''), 'qapi-controlled-import'),
    'import', 'running', v_found,
    0, 0, 0, p_requested_by,
    'QAPI', p_size, p_size, v_found, 0,
    0, 0, 0, 0, 0,
    1, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('at', v_started_at, 'event', 'controlled_import_started')),
    v_started_at,
    jsonb_build_object(
      'page', p_page,
      'next_page', case when v_found = p_size then p_page + 1 else null end,
      'size', p_size,
      'materia', p_materia
    ),
    false,
    jsonb_build_object(
      'parser_version', p_parser_version,
      'maximum_items', 10,
      'page', p_page,
      'size', p_size,
      'materia', p_materia,
      'atomic', true
    )
  ) returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_index := v_item_index + 1;
    v_normalized := coalesce(v_item->'normalized', '{}'::jsonb);
    v_raw := coalesce(v_item->'raw_payload', '{}'::jsonb);
    v_external_id := nullif(btrim(v_item->>'external_id'), '');
    v_statement_hash := nullif(v_item->>'normalized_statement_hash', '');
    v_full_hash := nullif(v_item->>'normalized_full_hash', '');
    v_errors := coalesce(v_item->'errors', '[]'::jsonb);
    v_warnings := coalesce(v_item->'warnings', '[]'::jsonb);
    v_valid := coalesce((v_item->>'valid')::boolean, false);
    v_question_id := null;
    v_message := null;

    if not v_valid then
      v_status := 'rejected';
      v_action := 'skip_invalid';
      v_rejected := v_rejected + 1;
    else
      v_valid_count := v_valid_count + 1;

      select q.id into v_question_id
      from public.questions q
      where q.source_type = 'QAPI'
        and q.source_reference = v_external_id
      limit 1;

      if v_question_id is not null then
        v_status := 'reused';
        v_action := 'reuse_source_reference';
        v_reused := v_reused + 1;
      else
        select m.question_id into v_question_id
        from public.question_editorial_metadata m
        where v_full_hash is not null
          and m.normalized_full_hash = v_full_hash
        limit 1;

        if v_question_id is not null then
          v_status := 'duplicate';
          v_action := 'skip_full_hash';
          v_duplicates := v_duplicates + 1;
        else
          select m.question_id into v_question_id
          from public.question_editorial_metadata m
          where v_statement_hash is not null
            and m.normalized_statement_hash = v_statement_hash
          limit 1;

          if v_question_id is not null then
            v_status := 'duplicate';
            v_action := 'skip_statement_hash';
            v_duplicates := v_duplicates + 1;
          else
            insert into public.questions (
              statement, alternatives, answer, explanation,
              source_type, source_reference, year, is_original, active
            ) values (
              v_normalized->>'statement',
              v_normalized->'alternatives',
              nullif(v_normalized->>'answer', ''),
              nullif(v_normalized->>'explanation', ''),
              'QAPI',
              v_external_id,
              nullif(v_normalized->>'year', '')::smallint,
              false,
              true
            ) returning id into v_question_id;

            insert into public.question_editorial_metadata (
              question_id, external_id, discipline, topic, question_type,
              editorial_status, source_year, source_banca, source_orgao,
              source_cargo, source_materia, source_exam, source_text_code,
              source, source_assunto, source_accessed_at, source_payload,
              source_metadata, display_banca, display_orgao, display_cargo,
              display_materia, display_assunto, import_batch_id, imported_at,
              validation_status, validation_errors, quality_score,
              normalized_statement_hash, normalized_full_hash,
              normalized_alternatives, generation_method, editorial_notes
            ) values (
              v_question_id,
              v_external_id,
              nullif(v_normalized->>'materia', ''),
              nullif(v_normalized->>'assunto', ''),
              nullif(v_item->>'question_type', ''),
              'approved',
              nullif(v_normalized->>'year', '')::smallint,
              nullif(v_normalized->>'banca', ''),
              nullif(v_normalized->>'orgao', ''),
              nullif(v_normalized->>'cargo', ''),
              nullif(v_normalized->>'materia', ''),
              nullif(v_normalized->>'exam', ''),
              nullif(v_normalized->>'textCode', ''),
              'QAPI',
              nullif(v_normalized->>'assunto', ''),
              v_started_at,
              v_raw,
              jsonb_build_object('page', p_page, 'size', p_size, 'parser_version', p_parser_version),
              nullif(v_normalized->>'banca', ''),
              nullif(v_normalized->>'orgao', ''),
              nullif(v_normalized->>'cargo', ''),
              nullif(v_normalized->>'materia', ''),
              nullif(v_normalized->>'assunto', ''),
              v_batch_id,
              v_started_at,
              'validated',
              '[]'::jsonb,
              100,
              v_statement_hash,
              v_full_hash,
              v_item->'normalized_alternatives',
              'qapi_import',
              'Importação controlada; parser ' || p_parser_version || '.'
            );

            v_status := 'imported';
            v_action := 'inserted';
            v_imported := v_imported + 1;
          end if;
        end if;
      end if;
    end if;

    insert into public.question_import_items (
      batch_id, item_index, external_id, question_id, status, message,
      source, source_reference, source_page, discipline, subject, action,
      validation_status, validation_errors, quality_score,
      duplicate_of_question_id, duplicate_score, raw_payload,
      normalized_payload, imported_at
    ) values (
      v_batch_id,
      v_item_index,
      v_external_id,
      v_question_id,
      v_status,
      v_message,
      'QAPI',
      v_external_id,
      p_page,
      nullif(v_normalized->>'materia', ''),
      nullif(v_normalized->>'assunto', ''),
      v_action,
      case when v_valid then 'validated' else 'rejected' end,
      v_errors,
      case when v_valid then 100 else 0 end,
      case when v_status = 'duplicate' then v_question_id else null end,
      case when v_status = 'duplicate' then 1 else null end,
      v_raw,
      jsonb_build_object(
        'statement', v_normalized->>'statement',
        'alternatives', v_normalized->'alternatives',
        'answer', v_normalized->>'answer',
        'question_type', v_item->>'question_type',
        'normalized_statement_hash', v_statement_hash,
        'normalized_full_hash', v_full_hash,
        'warnings', v_warnings
      ),
      case when v_status = 'imported' then v_started_at else null end
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'item_index', v_item_index,
      'external_id', v_external_id,
      'status', v_status,
      'action', v_action,
      'question_id', v_question_id,
      'errors', v_errors,
      'warnings', v_warnings
    ));
  end loop;

  v_finished_at := clock_timestamp();
  update public.question_import_batches
  set status = 'imported',
      valid = v_valid_count,
      imported_items = v_imported,
      skipped_items = v_found - v_imported,
      error_items = 0,
      imported = v_imported,
      reused = v_reused,
      duplicates = v_duplicates,
      rejected = v_rejected,
      finished_at = v_finished_at,
      log = jsonb_build_array(
        jsonb_build_object('at', v_started_at, 'event', 'controlled_import_started'),
        jsonb_build_object(
          'at', v_finished_at,
          'event', 'controlled_import_finished',
          'imported', v_imported,
          'skipped', v_found - v_imported,
          'errors', 0
        )
      )
  where id = v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'mode', 'import',
    'atomic', true,
    'maximum_items', 10,
    'batch_id', v_batch_id,
    'requested_size', p_size,
    'received_size', v_found,
    'page', p_page,
    'materia', p_materia,
    'summary', jsonb_build_object(
      'valid', v_valid_count,
      'invalid', v_rejected,
      'imported', v_imported,
      'reused', v_reused,
      'duplicates', v_duplicates,
      'rejected', v_rejected,
      'skipped', v_found - v_imported,
      'errors', 0
    ),
    'items', v_results,
    'resume_cursor', jsonb_build_object(
      'page', p_page,
      'next_page', case when v_found = p_size then p_page + 1 else null end,
      'size', p_size,
      'materia', p_materia
    )
  );
end;
$$;

revoke all on function public.import_qapi_controlled_batch(uuid, integer, integer, text, text, text, jsonb) from public;
revoke all on function public.import_qapi_controlled_batch(uuid, integer, integer, text, text, text, jsonb) from anon;
revoke all on function public.import_qapi_controlled_batch(uuid, integer, integer, text, text, text, jsonb) from authenticated;
grant execute on function public.import_qapi_controlled_batch(uuid, integer, integer, text, text, text, jsonb) to service_role;

comment on function public.import_qapi_controlled_batch(uuid, integer, integer, text, text, text, jsonb)
  is 'Atomically imports one authenticated, server-validated QAPI batch with at most 10 items.';
