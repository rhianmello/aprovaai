import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

async function requireAdmin(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("unauthorized");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new Error("unauthorized");
  const { data: profile } = await db.from("profiles").select("role,active").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.active === false || !["admin", "super_admin"].includes(String(profile.role ?? "").toLowerCase())) throw new Error("forbidden");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);
    const key = Deno.env.get("QAPI_KEY");
    if (!key) throw new Error("QAPI_KEY não configurada");
    const url = new URL("https://qapi.otunac.com/api/questoes");
    url.searchParams.set("page", "1");
    url.searchParams.set("size", "10");
    const response = await fetch(url, { headers: { Accept: "application/json", "Q-Api-Key": key } });
    const data = await response.json().catch(() => ({}));
    const questions = Array.isArray(data.questoes) ? data.questoes : [];
    return reply({
      ok: response.ok, test_only: true, no_database_writes: true,
      requested_size: 10, received_size: questions.length,
      qapi_size: Number(data.size ?? 0), total: Number(data.total ?? 0), pages: Number(data.pages ?? 0),
    }, response.ok ? 200 : response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply({ ok: false, test_only: true, no_database_writes: true, error: message }, message === "unauthorized" ? 401 : message === "forbidden" ? 403 : 500);
  }
});