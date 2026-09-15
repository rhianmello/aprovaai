import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const QAPI_BASE = "https://qapi.otunac.com/api";
const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QapiQuestion = Record<string, unknown>;
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function text(value: unknown) { return String(value ?? "").trim(); }

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
  const fieldsUsed: string[] = [];
  const containers = ["alternativas", "alternatives", "opcoes", "opções", "options", "respostas"];

  for (const containerName of containers) {
    const container = question[containerName];
    if (Array.isArray(container)) {
      fieldsUsed.push(containerName);
      container.slice(0, 5).forEach((entry, index) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        const explicit = row ? optionLetter(row.letra ?? row.letter ?? row.label ?? row.opcao ?? row.opção ?? row.id) : "";
        const letter = explicit || "ABCDE"[index];
        const value = optionText(entry);
        if (letter && value && !alternatives[letter]) alternatives[letter] = value;
      });
    } else if (container && typeof container === "object") {
      fieldsUsed.push(containerName);
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
    const found = firstValue(question, aliases);
    const candidate = optionText(found.value);
    if (candidate && !alternatives[letter]) {
      alternatives[letter] = candidate;
      if (found.key) fieldsUsed.push(found.key);
    }
  }
  return { alternatives, fieldsUsed: [...new Set(fieldsUsed)] };
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
  return { answer, fieldUsed: found.key };
}

function validateQuestion(question: QapiQuestion) {
  const { alternatives, fieldsUsed } = extractAlternatives(question);
  const { answer, fieldUsed } = extractAnswer(question, alternatives);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!text(question._id)) errors.push("missing_external_id");
  if (!text(question.enunciado)) errors.push("missing_statement");
  if (!answer) errors.push("invalid_answer");
  for (const option of ["A", "B", "C", "D"]) if (!alternatives[option]) errors.push("missing_option_" + option);
  if (answer && !alternatives[answer]) errors.push("answer_points_to_empty_option");
  if (!alternatives.E) warnings.push("empty_option_E");
  return {
    external_id: text(question._id),
    answer,
    alternatives,
    valid: errors.length === 0,
    errors,
    warnings,
    parser: {
      payload_keys: Object.keys(question).sort(),
      alternatives_fields_used: fieldsUsed,
      answer_field_used: fieldUsed,
    },
    raw_payload: question,
  };
}
async function fetchTen(materia?: string, page = 1) {
  const key = Deno.env.get("QAPI_KEY");
  if (!key) throw new Error("QAPI_KEY não configurada");
  const url = new URL(QAPI_BASE + "/questoes");
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", "10"); // fixed server-side ceiling for controlled dry-runs
  if (materia) url.searchParams.set("materia", materia);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "Q-Api-Key": key }, signal: controller.signal });
    const raw = await response.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { throw new Error("QAPI retornou JSON inválido"); }
    if (!response.ok) throw new Error("QAPI " + response.status + ": " + text(data.error));
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return respond({ ok: false, error: "Use POST." }, 405);
    const body = await req.json().catch(() => ({}));
    const mode = text(body.mode || "dry_run");
    if (mode !== "dry_run") {
      return respond({
        ok: false,
        error: "Importação está bloqueada nesta fase. Use mode=dry_run; nenhuma escrita é permitida.",
        no_database_writes: true,
      }, 409);
    }
    if (body.size !== undefined && Number(body.size) !== 10) {
      return respond({ ok: false, error: "Neste dry-run controlado, size deve ser exatamente 10." }, 400);
    }
    const page = Math.max(1, Number(body.page ?? 1) || 1);
    const materia = text(body.materia) || undefined;
    const qapi = await fetchTen(materia, page);
    const rows = Array.isArray(qapi.questoes) ? qapi.questoes as QapiQuestion[] : [];
    const firstTen = rows.slice(0, 10);
    const validations = firstTen.map(validateQuestion);
    const ids = validations.map((item) => item.external_id).filter(Boolean);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const { data: existing, error: existingError } = ids.length
      ? await db.from("questions").select("source_reference").eq("source_type", "QAPI").in("source_reference", ids)
      : { data: [], error: null };
    if (existingError) throw existingError;

    // WRITE GUARD: dry_run deliberately performs only the read above. There is no insert/update/delete call.
    return respond({
      ok: true,
      mode: "dry_run",
      no_database_writes: true,
      write_guard: "No insert, update or delete is executed in any table; public.questions is read-only.",
      requested_size: 10,
      received_size: firstTen.length,
      page,
      materia: materia ?? null,
      qapi_total: Number(qapi.total ?? 0),
      qapi_pages: Number(qapi.pages ?? 0),
      summary: {
        valid: validations.filter((item) => item.valid).length,
        invalid: validations.filter((item) => !item.valid).length,
        warnings: validations.filter((item) => item.warnings.length > 0).length,
        already_existing_in_questions: (existing ?? []).length,
        duplicate_external_ids_in_response: [...new Set(duplicateIds)].length,
      },
      items: validations.map((item, index) => ({
        item_index: index + 1,
        external_id: item.external_id,
        valid: item.valid,
        answer: item.answer,
        alternatives: item.alternatives,
        errors: item.errors,
        warnings: item.warnings,
        parser: item.parser,
        raw_payload: item.raw_payload,
      })),
      resume_cursor: { page, next_page: firstTen.length === 10 ? page + 1 : null, size: 10, materia: materia ?? null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "unauthorized" ? 401 : message === "forbidden" ? 403 : 500;
    return respond({ ok: false, mode: "dry_run", no_database_writes: true, error: message }, status);
  }
});