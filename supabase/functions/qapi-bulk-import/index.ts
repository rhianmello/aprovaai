import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const QAPI_BASE = "https://qapi.otunac.com/api";
const MAX_ITEMS = 10;
const PARSER_VERSION = "qapi-controlled-import-v1";
const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QapiQuestion = Record<string, unknown>;
type ExistingQuestion = { id: string; source_reference: string | null };
type ExistingHash = {
  question_id: string;
  normalized_statement_hash: string | null;
  normalized_full_hash: string | null;
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function displayText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return nullableText(value);
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return nullableText(row.nome ?? row.name ?? row.titulo ?? row.title ?? row.descricao ?? row.description);
}

async function requireAdmin(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("unauthorized");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new Error("unauthorized");
  const { data: profile, error: profileError } = await db
    .from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  const role = text(profile?.role).toLowerCase();
  if (profileError || !profile || profile.active === false || !["admin", "super_admin"].includes(role)) {
    throw new Error("forbidden");
  }
  return data.user;
}

function firstValue(question: QapiQuestion, keys: string[]) {
  for (const key of keys) {
    const value = question[key];
    if (value !== undefined && value !== null && text(value) !== "") return { key, value };
  }
  return { key: null, value: null };
}

function optionLetter(value: unknown) {
  const raw = text(value).toUpperCase();
  const direct = raw.match(/^[A-E]$/)?.[0];
  if (direct) return direct;
  const described = raw.match(/(?:ALTERNATIVA|OPÇÃO|OPCAO)\s*[:.-]?\s*([A-E])/)?.[1];
  if (described) return described;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return "ABCDE"[numeric - 1];
  return "";
}

function optionText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return text(value);
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return text(row.texto ?? row.text ?? row.value ?? row.conteudo ?? row.descricao ?? row.resposta);
}

function extractAlternatives(question: QapiQuestion) {
  const alternatives: Record<string, string> = { A: "", B: "", C: "", D: "", E: "" };
  const containers = ["alternativas", "alternatives", "opcoes", "opções", "options", "respostas"];
  for (const containerName of containers) {
    const container = question[containerName];
    if (Array.isArray(container)) {
      container.slice(0, 5).forEach((entry, index) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        const explicit = row ? optionLetter(row.letra ?? row.letter ?? row.label ?? row.opcao ?? row.opção ?? row.id) : "";
        const letter = explicit || "ABCDE"[index];
        const value = optionText(entry);
        if (letter && value && !alternatives[letter]) alternatives[letter] = value;
      });
    } else if (container && typeof container === "object") {
      for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
        const letter = optionLetter(key);
        const candidate = optionText(value);
        if (letter && candidate && !alternatives[letter]) alternatives[letter] = candidate;
      }
    }
  }
  for (const letter of ["A", "B", "C", "D", "E"]) {
    const aliases = [
      "opcao" + letter, "opção" + letter, "opcao_" + letter.toLowerCase(),
      "opção_" + letter.toLowerCase(), "alternativa" + letter,
      "alternativa_" + letter.toLowerCase(), "option" + letter,
      "option_" + letter.toLowerCase(), letter, letter.toLowerCase(),
    ];
    const candidate = optionText(firstValue(question, aliases).value);
    if (candidate && !alternatives[letter]) alternatives[letter] = candidate;
  }
  return alternatives;
}

function extractAnswer(question: QapiQuestion, alternatives: Record<string, string>) {
  const found = firstValue(question, [
    "gabarito", "resposta", "answer", "correct_answer", "correctAnswer",
    "alternativaCorreta", "alternativa_correta", "opcaoCorreta", "opcao_correta",
  ]);
  let answer = optionLetter(found.value);
  if (!answer && found.value && typeof found.value === "object") {
    const row = found.value as Record<string, unknown>;
    answer = optionLetter(row.letra ?? row.letter ?? row.label ?? row.opcao ?? row.opção ?? row.id ?? row.index);
  }
  if (!answer) {
    const rawText = optionText(found.value);
    const match = Object.entries(alternatives).find(([, value]) => value && text(value) === rawText);
    if (match) answer = match[0];
  }
  return answer;
}

function normalizedToken(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceFields(question: QapiQuestion) {
  const banca = displayText(firstValue(question, ["banca", "board"]).value);
  const orgao = displayText(firstValue(question, ["orgao", "órgão", "agency"]).value);
  const cargo = displayText(firstValue(question, ["cargo", "position"]).value);
  const materia = displayText(firstValue(question, ["materia", "matéria", "disciplina", "discipline"]).value);
  const assunto = displayText(firstValue(question, ["assunto", "tema", "topic"]).value);
  const exam = displayText(firstValue(question, ["prova", "exam", "concurso"]).value);
  const textCode = displayText(firstValue(question, ["codigoTexto", "codigo_texto", "textCode", "text_code"]).value);
  const explanation = displayText(firstValue(question, ["comentario", "comentário", "explicacao", "explicação", "explanation"]).value);
  const rawYear = Number(firstValue(question, ["ano", "year"]).value);
  const year = Number.isInteger(rawYear) && rawYear >= 1900 && rawYear <= 2200 ? rawYear : null;
  return { banca, orgao, cargo, materia, assunto, exam, textCode, explanation, year };
}

async function prepareQuestion(question: QapiQuestion) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const externalId = text(question._id);
  const statement = text(question.enunciado);
  if (!externalId) errors.push("missing_external_id");
  if (!statement) errors.push("missing_statement");

  const answerSource = firstValue(question, [
    "gabarito", "resposta", "answer", "correct_answer", "correctAnswer",
    "alternativaCorreta", "alternativa_correta", "opcaoCorreta", "opcao_correta",
  ]);
  const rawAnswer = optionText(answerSource.value) || text(answerSource.value);
  const answerToken = normalizedToken(rawAnswer);
  const typeToken = normalizedToken(firstValue(question, [
    "tipo", "type", "formato", "modalidade", "tipoQuestao", "tipo_questao",
  ]).value);
  const isTrueFalse = answerToken === "certo" || answerToken === "errado" ||
    typeToken.includes("certo errado") || typeToken.includes("certo ou errado") ||
    typeToken.includes("verdadeiro falso");

  let questionType = "multipla_escolha";
  let alternatives: Record<string, string> | null = null;
  let answer = "";
  if (isTrueFalse) {
    questionType = "certo_errado";
    if (answerToken !== "certo" && answerToken !== "errado") errors.push("invalid_true_false_answer");
    answer = rawAnswer;
  } else {
    alternatives = extractAlternatives(question);
    answer = extractAnswer(question, alternatives);
    if (!answer) errors.push("invalid_answer");
    for (const option of ["A", "B", "C", "D"]) {
      if (!alternatives[option]) errors.push("missing_option_" + option);
    }
    if (answer && !alternatives[answer]) errors.push("answer_points_to_empty_option");
    if (!alternatives.E) warnings.push("empty_option_E");
  }

  const fields = sourceFields(question);
  const normalizedAlternatives = alternatives
    ? Object.fromEntries(Object.entries(alternatives).map(([key, value]) => [key, normalizedToken(value)]))
    : null;
  const statementHash = statement ? await sha256(normalizedToken(statement)) : null;
  const fullHash = statementHash ? await sha256(JSON.stringify({
    statement: normalizedToken(statement),
    question_type: questionType,
    alternatives: normalizedAlternatives,
    answer: normalizedToken(answer),
  })) : null;

  return {
    external_id: externalId,
    question_type: questionType,
    valid: errors.length === 0,
    errors,
    warnings,
    raw_payload: question,
    normalized: { statement, alternatives, answer, ...fields },
    normalized_statement_hash: statementHash,
    normalized_full_hash: fullHash,
    normalized_alternatives: normalizedAlternatives,
  };
}

async function fetchControlled(size: number, materia?: string, page = 1) {
  const key = Deno.env.get("QAPI_KEY");
  if (!key) throw new Error("QAPI_KEY não configurada");
  const url = new URL(QAPI_BASE + "/questoes");
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  if (materia) url.searchParams.set("materia", materia);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Q-Api-Key": key },
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { throw new Error("QAPI retornou JSON inválido"); }
    if (!response.ok) throw new Error("QAPI " + response.status + ": " + text(data.error));
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function findExisting(validations: Awaited<ReturnType<typeof prepareQuestion>>[]) {
  const ids = validations.map((item) => item.external_id).filter(Boolean);
  const statementHashes = validations.map((item) => item.normalized_statement_hash).filter(Boolean) as string[];
  const fullHashes = validations.map((item) => item.normalized_full_hash).filter(Boolean) as string[];
  const [byReference, byStatement, byFull] = await Promise.all([
    ids.length
      ? db.from("questions").select("id,source_reference").eq("source_type", "QAPI").in("source_reference", ids)
      : Promise.resolve({ data: [], error: null }),
    statementHashes.length
      ? db.from("question_editorial_metadata").select("question_id,normalized_statement_hash,normalized_full_hash").in("normalized_statement_hash", statementHashes)
      : Promise.resolve({ data: [], error: null }),
    fullHashes.length
      ? db.from("question_editorial_metadata").select("question_id,normalized_statement_hash,normalized_full_hash").in("normalized_full_hash", fullHashes)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byReference.error) throw byReference.error;
  if (byStatement.error) throw byStatement.error;
  if (byFull.error) throw byFull.error;
  return {
    byReference: new Map(((byReference.data ?? []) as ExistingQuestion[]).map((row) => [row.source_reference, row.id])),
    byStatement: new Map(((byStatement.data ?? []) as ExistingHash[]).map((row) => [row.normalized_statement_hash, row.question_id])),
    byFull: new Map(((byFull.data ?? []) as ExistingHash[]).map((row) => [row.normalized_full_hash, row.question_id])),
  };
}

function classify(validations: Awaited<ReturnType<typeof prepareQuestion>>[], existing: Awaited<ReturnType<typeof findExisting>>) {
  const seenReferences = new Map<string, number>();
  const seenStatements = new Map<string, number>();
  const seenFull = new Map<string, number>();
  return validations.map((item, index) => {
    if (!item.valid) return { kind: "rejected", status: "rejected", action: "skip_invalid", duplicateOf: null, duplicateIndex: null };
    const existingReference = existing.byReference.get(item.external_id);
    if (existingReference) return { kind: "reused", status: "reused", action: "reuse_source_reference", duplicateOf: existingReference, duplicateIndex: null };
    const existingFull = item.normalized_full_hash ? existing.byFull.get(item.normalized_full_hash) : null;
    if (existingFull) return { kind: "duplicate", status: "duplicate", action: "skip_full_hash", duplicateOf: existingFull, duplicateIndex: null };
    const existingStatement = item.normalized_statement_hash ? existing.byStatement.get(item.normalized_statement_hash) : null;
    if (existingStatement) return { kind: "duplicate", status: "duplicate", action: "skip_statement_hash", duplicateOf: existingStatement, duplicateIndex: null };
    const repeatedReference = seenReferences.get(item.external_id);
    const repeatedFull = item.normalized_full_hash ? seenFull.get(item.normalized_full_hash) : undefined;
    const repeatedStatement = item.normalized_statement_hash ? seenStatements.get(item.normalized_statement_hash) : undefined;
    if (repeatedReference !== undefined || repeatedFull !== undefined || repeatedStatement !== undefined) {
      return {
        kind: "duplicate", status: "duplicate", action: "skip_in_batch_duplicate", duplicateOf: null,
        duplicateIndex: (repeatedReference ?? repeatedFull ?? repeatedStatement ?? 0) + 1,
      };
    }
    seenReferences.set(item.external_id, index);
    if (item.normalized_full_hash) seenFull.set(item.normalized_full_hash, index);
    if (item.normalized_statement_hash) seenStatements.set(item.normalized_statement_hash, index);
    return { kind: "import", status: "validated", action: "insert", duplicateOf: null, duplicateIndex: null };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let mode = "dry_run";
  try {
    const admin = await requireAdmin(req);
    if (req.method !== "POST") return respond({ ok: false, error: "Use POST." }, 405);
    const body = await req.json().catch(() => ({}));
    mode = text(body.mode || "dry_run");
    if (!["dry_run", "import"].includes(mode)) {
      return respond({ ok: false, error: "mode deve ser dry_run ou import." }, 400);
    }
    const rawSize = Number(body.size ?? MAX_ITEMS);
    if (!Number.isInteger(rawSize) || rawSize < 1 || rawSize > MAX_ITEMS) {
      return respond({ ok: false, error: "size deve ser um inteiro entre 1 e 10." }, 400);
    }
    const size = rawSize;
    const page = Math.max(1, Number(body.page ?? 1) || 1);
    const materia = text(body.materia) || undefined;
    const preparationSlug = text(body.preparation_slug) || "qapi-controlled-import";
    const qapi = await fetchControlled(size, materia, page);
    const rows = Array.isArray(qapi.questoes) ? qapi.questoes as QapiQuestion[] : [];
    const controlledRows = rows.slice(0, MAX_ITEMS).slice(0, size);
    const validations = await Promise.all(controlledRows.map(prepareQuestion));
    const existing = await findExisting(validations);
    const decisions = classify(validations, existing);
    const summary = {
      valid: validations.filter((item) => item.valid).length,
      invalid: validations.filter((item) => !item.valid).length,
      warnings: validations.filter((item) => item.warnings.length > 0).length,
      importable: decisions.filter((item) => item.kind === "import").length,
      reused: decisions.filter((item) => item.kind === "reused").length,
      duplicates: decisions.filter((item) => item.kind === "duplicate").length,
      rejected: decisions.filter((item) => item.kind === "rejected").length,
    };

    if (mode === "dry_run") {
      return respond({
        ok: true, mode, no_database_writes: true,
        write_guard: "Dry-run executes no insert, update or delete in any table.",
        requested_size: size, received_size: controlledRows.length, page,
        materia: materia ?? null, qapi_total: Number(qapi.total ?? 0),
        qapi_pages: Number(qapi.pages ?? 0), summary,
        items: validations.map((item, index) => ({
          item_index: index + 1, external_id: item.external_id,
          question_type: item.question_type, valid: item.valid,
          decision: decisions[index].action, errors: item.errors,
          warnings: item.warnings, raw_payload: item.raw_payload,
        })),
        resume_cursor: { page, next_page: controlledRows.length === size ? page + 1 : null, size, materia: materia ?? null },
      });
    }

    const startedAt = new Date().toISOString();
    const { data: batch, error: batchError } = await db.from("question_import_batches").insert({
      batch_name: `qapi_import_${startedAt}`,
      preparation_slug: preparationSlug,
      mode: "import", status: "running", total_items: validations.length,
      requested_by: admin.id, source: "QAPI", target_per_discipline: size,
      requested: size, found: validations.length, valid: summary.valid,
      imported: 0, reused: summary.reused, duplicates: summary.duplicates,
      rejected: summary.rejected, needs_review: 0, pages_consulted: 1,
      errors: [], log: [{ at: startedAt, event: "controlled_import_started" }],
      started_at: startedAt, dry_run: false,
      resume_cursor: { page, next_page: controlledRows.length === size ? page + 1 : null, size, materia: materia ?? null },
      config: { parser_version: PARSER_VERSION, maximum_items: MAX_ITEMS, page, size, materia: materia ?? null },
    }).select("id").single();
    if (batchError || !batch) throw batchError ?? new Error("Falha ao criar batch.");

    const importedAt = new Date().toISOString();
    let imported = 0;
    const itemResults: Record<string, unknown>[] = [];
    for (let index = 0; index < validations.length; index++) {
      const item = validations[index];
      const decision = decisions[index];
      let questionId: string | null = decision.duplicateOf;
      let status = decision.status;
      let action = decision.action;
      let message: string | null = decision.duplicateIndex ? `Duplicado do item ${decision.duplicateIndex}.` : null;
      const normalized = item.normalized;

      if (decision.kind === "import") {
        const { data: insertedQuestion, error: questionError } = await db.from("questions").insert({
          statement: normalized.statement,
          alternatives: normalized.alternatives,
          answer: normalized.answer,
          explanation: normalized.explanation,
          source_type: "QAPI",
          source_reference: item.external_id,
          year: normalized.year,
          is_original: false,
          active: true,
        }).select("id").single();
        if (questionError || !insertedQuestion) {
          status = "error";
          action = "insert_failed";
          message = questionError?.message ?? "Falha ao inserir questão.";
        } else {
          questionId = insertedQuestion.id;
          const { error: metadataError } = await db.from("question_editorial_metadata").insert({
            question_id: questionId,
            external_id: item.external_id,
            discipline: normalized.materia,
            topic: normalized.assunto,
            question_type: item.question_type,
            editorial_status: "approved",
            source_year: normalized.year,
            source_banca: normalized.banca,
            source_orgao: normalized.orgao,
            source_cargo: normalized.cargo,
            source_materia: normalized.materia,
            source_exam: normalized.exam,
            source_text_code: normalized.textCode,
            source: "QAPI",
            source_assunto: normalized.assunto,
            source_url: `${QAPI_BASE}/questoes/${encodeURIComponent(item.external_id)}`,
            source_title: null,
            source_accessed_at: importedAt,
            source_payload: item.raw_payload,
            source_metadata: { page, size, parser_version: PARSER_VERSION },
            display_banca: normalized.banca,
            display_orgao: normalized.orgao,
            display_cargo: normalized.cargo,
            display_materia: normalized.materia,
            display_assunto: normalized.assunto,
            import_batch_id: batch.id,
            imported_at: importedAt,
            validation_status: "validated",
            validation_errors: [],
            quality_score: 100,
            normalized_statement_hash: item.normalized_statement_hash,
            normalized_full_hash: item.normalized_full_hash,
            normalized_alternatives: item.normalized_alternatives,
            generation_method: "qapi_import",
            editorial_notes: `Importação controlada; parser ${PARSER_VERSION}.`,
          });
          if (metadataError) {
            status = "error";
            action = "metadata_failed";
            message = metadataError.message;
          } else {
            status = "imported";
            action = "inserted";
            imported++;
          }
        }
      }

      const { error: itemError } = await db.from("question_import_items").insert({
        batch_id: batch.id,
        item_index: index + 1,
        external_id: item.external_id || null,
        question_id: questionId,
        status,
        message,
        source: "QAPI",
        source_reference: item.external_id || null,
        source_page: page,
        discipline: normalized.materia,
        subject: normalized.assunto,
        action,
        validation_status: item.valid ? "validated" : "rejected",
        validation_errors: item.errors,
        quality_score: item.valid ? 100 : 0,
        duplicate_of_question_id: decision.kind === "duplicate" ? questionId : null,
        duplicate_score: decision.kind === "duplicate" ? 1 : null,
        raw_payload: item.raw_payload,
        normalized_payload: {
          statement: normalized.statement,
          alternatives: normalized.alternatives,
          answer: normalized.answer,
          question_type: item.question_type,
          normalized_statement_hash: item.normalized_statement_hash,
          normalized_full_hash: item.normalized_full_hash,
        },
        imported_at: status === "imported" ? importedAt : null,
      });
      if (itemError) throw itemError;
      itemResults.push({ item_index: index + 1, external_id: item.external_id, status, action, question_id: questionId, errors: item.errors, warnings: item.warnings });
    }

    const errorItems = itemResults.filter((item) => item.status === "error").length;
    const skippedItems = validations.length - imported - errorItems;
    const finishedAt = new Date().toISOString();
    const finalStatus = errorItems > 0 ? "failed" : "imported";
    const { error: finishError } = await db.from("question_import_batches").update({
      status: finalStatus,
      imported_items: imported,
      skipped_items: skippedItems,
      error_items: errorItems,
      imported,
      errors: itemResults.filter((item) => item.status === "error").map((item) => ({ item_index: item.item_index, action: item.action })),
      log: [
        { at: startedAt, event: "controlled_import_started" },
        { at: finishedAt, event: "controlled_import_finished", imported, skipped: skippedItems, errors: errorItems },
      ],
      finished_at: finishedAt,
    }).eq("id", batch.id);
    if (finishError) throw finishError;

    return respond({
      ok: errorItems === 0,
      mode: "import",
      maximum_items: MAX_ITEMS,
      batch_id: batch.id,
      requested_size: size,
      received_size: controlledRows.length,
      page,
      materia: materia ?? null,
      summary: { ...summary, imported, skipped: skippedItems, errors: errorItems },
      items: itemResults,
      resume_cursor: { page, next_page: controlledRows.length === size ? page + 1 : null, size, materia: materia ?? null },
    }, errorItems > 0 ? 207 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "forbidden" ? 403 : 500;
    return respond({ ok: false, mode, error: message }, status);
  }
});
