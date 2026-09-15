import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const QAPI_BASE = "https://qapi.otunac.com/api";
const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function nonEmptyParams(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value).trim()]),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const requestParams: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
    if (req.method === "POST") {
      try {
        Object.assign(requestParams, await req.json());
      } catch {
        // JSON is optional for this read-only proxy.
      }
    }

    const action = String(requestParams.action ?? "questoes").toLowerCase().trim();
    const endpoints: Record<string, string> = {
      questoes: "/questoes", bancas: "/bancas", materias: "/materias",
      assuntos: "/assuntos", orgaos: "/orgaos", provas: "/provas", concursos: "/concursos",
    };
    let endpoint = endpoints[action];
    if (action === "concurso") {
      const id = String(requestParams.codigo ?? requestParams.id ?? requestParams.concurso_id ?? "").trim();
      if (!id) return respond({ ok: false, error: "codigo é obrigatório para a ação concurso." }, 400);
      endpoint = "/concursos/" + encodeURIComponent(id);
      delete requestParams.codigo; delete requestParams.id; delete requestParams.concurso_id;
    } else if (action === "textos") {
      const id = String(requestParams.codigo ?? requestParams.id ?? requestParams.texto_id ?? "").trim();
      if (!id) return respond({ ok: false, error: "codigo é obrigatório para a ação textos." }, 400);
      endpoint = "/textos/" + encodeURIComponent(id);
      delete requestParams.codigo; delete requestParams.id; delete requestParams.texto_id;
    }
    if (!endpoint) return respond({ ok: false, error: "Ação QAPI inválida." }, 400);

    const key = Deno.env.get("QAPI_KEY");
    if (!key) return respond({ ok: false, error: "QAPI_KEY não configurada." }, 500);
    delete requestParams.action;
    const target = new URL(QAPI_BASE + endpoint);
    for (const [key, value] of Object.entries(nonEmptyParams(requestParams))) target.searchParams.set(key, value);

    const upstream = await fetch(target, { headers: { Accept: "application/json", "Q-Api-Key": key } });
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    return respond({ ok: upstream.ok, action, endpoint, data }, upstream.status);
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});