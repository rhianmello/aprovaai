import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { "Content-Type": "application/json" } });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { "Content-Type": "application/json" } });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { "Content-Type": "application/json" } });
    const adminClient = createClient(url, serviceKey);
    const { data: profile, error: profileError } = await adminClient.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || profile?.active !== true) return new Response(JSON.stringify({ error: "Acesso administrativo negado" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const body = await req.json();
    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const telefone = String(body?.telefone || "").trim();
    const password = String(body?.password || "");
    if (!nome || !email || password.length < 6) return new Response(JSON.stringify({ error: "Nome, e-mail e senha de pelo menos 6 caracteres são obrigatórios" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: nome, nome, telefone } });
    if (createError || !created.user) return new Response(JSON.stringify({ error: createError?.message || "Não foi possível criar o usuário" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { error: profileUpsertError } = await adminClient.from("profiles").upsert({ id: created.user.id, email, nome, telefone, role: "student", active: true }, { onConflict: "id" });
    if (profileUpsertError) { await adminClient.auth.admin.deleteUser(created.user.id); return new Response(JSON.stringify({ error: "Usuário criado, mas não foi possível criar o perfil: " + profileUpsertError.message }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } }); }
});
