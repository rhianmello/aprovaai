
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPORT_SCORE_SEARCH = "https://sportscore.com/api/v1/search/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function json(body: unknown, status = 200, maxAge = 120) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=300`
    }
  });
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function leagueScore(name = "") {
  const n = name.toLowerCase();
  let s = 40;
  if (/serie a|premier league|la liga|bundesliga|ligue 1|primeira liga|eredivisie|major league soccer|liga profesional|j1 league/.test(n)) s += 160;
  if (/serie b|championship|segunda|2\. bundesliga|ligue 2/.test(n)) s += 120;
  if (/serie c|serie d/.test(n)) s += 90;
  if (/copa do brasil|fa cup|copa del rey|coppa italia|dfb|coupe de france|cup/.test(n)) s += 80;
  if (/paulista|carioca|mineiro|gaucho|gaúcho|catarinense|paranaense|pernambucano|baiano|cearense/.test(n)) s += 50;
  if (/women|fem|u17|u18|u19|u20|u21|u23|youth|reserve|reserves|amateur/.test(n)) s -= 160;
  return s;
}

function norm(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}

async function client() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!adminKey) {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    adminKey = keys.default || "";
  }
  if (!supabaseUrl || !adminKey) throw new Error("server_config");
  return createClient(supabaseUrl, adminKey, { auth: { persistSession: false } });
}

async function getCachedDays(sb: any) {
  const { data } = await sb
    .from("football_daily_cache")
    .select("cache_date,payload")
    .order("cache_date", { ascending: true });
  return data || [];
}

async function sportScoreSearch(q: string) {
  try {
    const u = new URL(SPORT_SCORE_SEARCH);
    u.searchParams.set("q", q);
    u.searchParams.set("sport", "football");
    u.searchParams.set("limit", "20");
    u.searchParams.set("src", "nospassa.com.br");
    const r = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
    if (!r.ok) return [];
    const raw = await r.json();
    return raw.teams || [];
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    const sb = await client();
    const days = await getCachedDays(sb);

    if (action === "leagues") {
      const code = (url.searchParams.get("country") || "BR").toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) return json({ error: "invalid_country" }, 400);
      const cname = countryName(code);
      const map = new Map<string, any>();

      for (const day of days) {
        for (const f of (day.payload?.fixtures || [])) {
          const l = f.league || {};
          if (norm(l.country || "") !== norm(cname)) continue;
          const key = String(l.id || l.name || "");
          if (!key) continue;
          if (!map.has(key)) {
            map.set(key, {
              id: l.id,
              name: l.name,
              type: "League",
              logo: l.logo || null,
              country: l.country || cname,
              flag: l.flag || null,
              score: leagueScore(l.name || "")
            });
          }
        }
      }

      const leagues = [...map.values()]
        .sort((a,b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
        .slice(0,80);

      return json({ country_code: code, country_name: cname, leagues }, 200, 600);
    }

    if (action === "team-search") {
      const q = (url.searchParams.get("q") || "").trim().slice(0,60);
      if (q.length < 2) return json({ teams: [] });
      const nq = norm(q);
      const map = new Map<string, any>();

      for (const day of days) {
        for (const f of (day.payload?.fixtures || [])) {
          for (const side of ["home","away"]) {
            const t = f.teams?.[side];
            if (!t?.name || !norm(t.name).includes(nq)) continue;
            const key = norm(t.name);
            if (!map.has(key)) {
              map.set(key, {
                id: t.id || null,
                name: t.name,
                country: f.league?.country || null,
                founded: null,
                national: false,
                logo: t.logo || null,
                venue: null,
                provider: t.provider || f.provider || "cache"
              });
            }
          }
        }
      }

      const external = await sportScoreSearch(q);
      for (const t of external) {
        const key = norm(t.name || "");
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, {
            id: null,
            name: t.name,
            country: null,
            founded: null,
            national: false,
            logo: t.logo || null,
            venue: null,
            provider: "sportscore",
            slug: t.slug || null
          });
        } else if (t.slug) {
          map.get(key).slug = t.slug;
        }
      }

      const teams = [...map.values()]
        .sort((a,b) => {
          const an = norm(a.name), bn = norm(b.name);
          const penalty = (n:string) => /women|fem|u15|u17|u18|u19|u20|u21|u23|youth|beach/.test(n) ? 10 : 0;
          const ae = (an === nq ? 0 : an.startsWith(nq) ? 1 : 2) + penalty(an);
          const be = (bn === nq ? 0 : bn.startsWith(nq) ? 1 : 2) + penalty(bn);
          return ae - be || an.localeCompare(bn);
        })
        .slice(0,30);

      return json({ query: q, teams }, 200, 60);
    }

    if (action === "team-summary") {
      const id = Number(url.searchParams.get("id") || 0);
      const name = (url.searchParams.get("name") || "").trim();
      const nn = norm(name);
      if ((!Number.isFinite(id) || id <= 0) && !nn) return json({ error: "invalid_team" }, 400);

      const fixtures = new Map<string, any>();
      let meta: any = null;

      for (const day of days) {
        for (const f of (day.payload?.fixtures || [])) {
          const h = f.teams?.home;
          const a = f.teams?.away;
          const hitHome = h && ((id > 0 && Number(h.id) === id) || (nn && norm(h.name) === nn));
          const hitAway = a && ((id > 0 && Number(a.id) === id) || (nn && norm(a.name) === nn));

          if (hitHome || hitAway) {
            const t = hitHome ? h : a;
            if (!meta) {
              meta = {
                id: t.id || id || null,
                name: t.name || name,
                code: null,
                country: f.league?.country || null,
                founded: null,
                national: false,
                logo: t.logo || null,
                venue: null,
                provider: t.provider || f.provider || "cache"
              };
            }
            fixtures.set(String(f.id || f.match_slug || f.date + "|" + h?.name + "|" + a?.name), f);
          }
        }
      }

      if (!meta && name) {
        const external = await sportScoreSearch(name);
        const exact = external.find((t:any) => norm(t.name) === nn);
        if (exact) {
          meta = {
            id: null,
            name: exact.name,
            code: null,
            country: null,
            founded: null,
            national: false,
            logo: exact.logo || null,
            venue: null,
            provider: "sportscore",
            slug: exact.slug || null
          };
        }
      }

      if (!meta) return json({ error: "team_not_found" }, 404);

      const all = [...fixtures.values()];
      const now = Date.now();
      const next = all
        .filter((f:any) => new Date(f.date || 0).getTime() >= now - 2*60*60*1000 && !["FT","AET","PEN","CANC","ABD","AWD","WO"].includes(f.status?.short))
        .sort((a:any,b:any) => (a.timestamp||0)-(b.timestamp||0))
        .slice(0,15);

      const recent = all
        .filter((f:any) => ["FT","AET","PEN"].includes(f.status?.short))
        .sort((a:any,b:any) => (b.timestamp||0)-(a.timestamp||0))
        .slice(0,15);

      return json({ team: meta, next, recent, cache_based: true }, 200, 120);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "internal_error", message: String((e as any)?.message || e) }, 500);
  }
});

