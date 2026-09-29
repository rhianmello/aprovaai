
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API_SPORTS_KEY = Deno.env.get("API_SPORTS_KEY") || "";
const API_SPORTS = "https://v3.football.api-sports.io/fixtures";
const SPORT_SCORE_FIXTURES = "https://sportscore.com/api/v1/fixtures/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=90"
    }
  });
}

function localDateSP() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const o = Object.fromEntries(p.map(x => [x.type, x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}

function dateInSP(d: string | Date) {
  const x = typeof d === "string" ? new Date(d) : d;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(x);
  const o = Object.fromEntries(p.map(z => [z.type, z.value]));
  return `${o.year}-${o.month}-${o.day}`;
}

function isValidDate(s: string | null) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
}

function detectCountry(req: Request) {
  const direct =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-country-code") ||
    req.headers.get("x-vercel-ip-country");
  if (direct && /^[A-Za-z]{2}$/.test(direct)) return direct.toUpperCase();

  const al = req.headers.get("accept-language") || "";
  const m = al.match(/[-_]([A-Za-z]{2})(?:[,;]|$)/);
  return m ? m[1].toUpperCase() : "BR";
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function inferCountry(competition = "") {
  const n = competition.toLowerCase();
  const tests: Array<[RegExp,string]> = [
    [/^brazilian|brasil|paulista|carioca|mineiro|gaucho|gaúcho|catarinense|paranaense|pernambucano|baiano|cearense/, "Brazil"],
    [/^mex|mexico|mexican/, "Mexico"],
    [/^english|premier league|championship|fa cup/, "England"],
    [/^spanish|la liga|copa del rey/, "Spain"],
    [/^italian|serie a|serie b|coppa italia/, "Italy"],
    [/^german|bundesliga|dfb/, "Germany"],
    [/^french|ligue 1|ligue 2|coupe de france/, "France"],
    [/^portuguese|primeira liga|liga portugal/, "Portugal"],
    [/^argentine|argentina/, "Argentina"],
    [/^dutch|netherlands|eredivisie/, "Netherlands"],
    [/^turkish|super lig|süper lig/, "Turkey"],
    [/^saudi/, "Saudi Arabia"],
    [/^usa|major league soccer|mls/, "USA"],
    [/^japanese|j1 league|j2 league/, "Japan"],
    [/^chinese|cfa|china/, "China"],
    [/^australian|a-league/, "Australia"],
    [/^indian/, "India"],
    [/^colombian/, "Colombia"],
    [/^chilean/, "Chile"],
    [/^uruguay/, "Uruguay"],
    [/^paraguay/, "Paraguay"],
    [/^peru|peruvian/, "Peru"],
    [/^ecuador/, "Ecuador"],
    [/^costa rica/, "Costa Rica"],
    [/^panama|panamanian/, "Panama"],
    [/^bangladesh/, "Bangladesh"]
  ];
  for (const [rx,c] of tests) if (rx.test(n)) return c;
  return "World";
}

function ssShort(status = "") {
  const s = status.toLowerCase();
  if (s === "live") return "LIVE";
  if (s === "finished") return "FT";
  if (s === "upcoming") return "NS";
  return s ? s.toUpperCase().slice(0,8) : "NS";
}

function matchSlug(url = "") {
  const m = url.match(/\/football\/match\/([^/]+)\/?/);
  return m?.[1] || "";
}

function normalizeSportScore(m: any) {
  const comp = m.competition || "Football";
  const slug = matchSlug(m.url || "");
  const home = m.home || "Home";
  const away = m.away || "Away";
  const status = ssShort(m.status || "");
  return {
    id: hash32("ss:" + (slug || home + "|" + away + "|" + m.time)),
    provider: "sportscore",
    match_slug: slug || null,
    date: m.time,
    timestamp: m.time ? Math.floor(new Date(m.time).getTime() / 1000) : null,
    timezone: "UTC",
    venue: null,
    status: {
      long: m.status_text || m.status || "",
      short: status,
      elapsed: m.live_minute != null ? Number(m.live_minute) : null,
      extra: null
    },
    league: {
      id: hash32("league:" + comp.toLowerCase()),
      name: comp,
      country: inferCountry(comp),
      logo: m.competition_logo || null,
      flag: null,
      season: null,
      round: null
    },
    teams: {
      home: {
        id: hash32("team:" + home.toLowerCase()),
        name: home,
        logo: m.home_logo || null,
        winner: status === "FT" && Number(m.home_score) > Number(m.away_score),
        provider: "sportscore"
      },
      away: {
        id: hash32("team:" + away.toLowerCase()),
        name: away,
        logo: m.away_logo || null,
        winner: status === "FT" && Number(m.away_score) > Number(m.home_score),
        provider: "sportscore"
      }
    },
    goals: {
      home: m.home_score == null || m.home_score === "" ? null : Number(m.home_score),
      away: m.away_score == null || m.away_score === "" ? null : Number(m.away_score)
    },
    score: null
  };
}

function normalizeApiSports(x: any) {
  return {
    id: x.fixture?.id,
    provider: "api-football",
    match_slug: null,
    date: x.fixture?.date,
    timestamp: x.fixture?.timestamp,
    timezone: x.fixture?.timezone,
    venue: x.fixture?.venue ? { name: x.fixture.venue.name, city: x.fixture.venue.city } : null,
    status: {
      long: x.fixture?.status?.long,
      short: x.fixture?.status?.short,
      elapsed: x.fixture?.status?.elapsed,
      extra: x.fixture?.status?.extra
    },
    league: {
      id: x.league?.id,
      name: x.league?.name,
      country: x.league?.country,
      logo: x.league?.logo,
      flag: x.league?.flag,
      season: x.league?.season,
      round: x.league?.round
    },
    teams: {
      home: { id: x.teams?.home?.id, name: x.teams?.home?.name, logo: x.teams?.home?.logo, winner: x.teams?.home?.winner, provider: "api-football" },
      away: { id: x.teams?.away?.id, name: x.teams?.away?.name, logo: x.teams?.away?.logo, winner: x.teams?.away?.winner, provider: "api-football" }
    },
    goals: { home: x.goals?.home, away: x.goals?.away },
    score: x.score || null
  };
}

async function fetchSportScore(params: Record<string,string>) {
  const u = new URL(SPORT_SCORE_FIXTURES);
  u.searchParams.set("sport", "football");
  u.searchParams.set("limit", "200");
  u.searchParams.set("src", "nospassa.com.br");
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("sportscore_http_" + r.status);
  const raw = await r.json();
  return (raw.matches || []).map(normalizeSportScore);
}

async function fetchApiSports(params: Record<string,string>) {
  if (!API_SPORTS_KEY) throw new Error("api_football_not_configured");
  const u = new URL(API_SPORTS);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u.toString(), { headers: { "x-apisports-key": API_SPORTS_KEY } });
  const raw = await r.json().catch(() => ({}));
  if (!r.ok || (raw?.errors && Object.keys(raw.errors).length)) throw new Error("api_football_unavailable");
  return (raw.response || []).map(normalizeApiSports);
}

async function getClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!adminKey) {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    adminKey = keys.default || "";
  }
  if (!supabaseUrl || !adminKey) throw new Error("server_config");
  return createClient(supabaseUrl, adminKey, { auth: { persistSession: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = new URL(req.url);
    const viewerCountry = detectCountry(req);
    const viewerCountryName = countryName(viewerCountry);
    const liveMode = url.searchParams.get("live") === "all";
    const date = url.searchParams.get("date") || localDateSP();

    if (!liveMode && !isValidDate(date)) return json({ error: "invalid_date" }, 400);

    const sb = await getClient();

    if (liveMode) {
      const cacheKey = "live:all";
      const { data: cached } = await sb.from("football_catalog_cache")
        .select("payload,fetched_at,expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cached?.payload && new Date(cached.expires_at).getTime() > Date.now()) {
        return json({
          ...cached.payload,
          viewer_country: viewerCountry,
          viewer_country_name: viewerCountryName,
          cached: true,
          fetched_at: cached.fetched_at
        });
      }

      let fixtures: any[] = [];
      let source = "sportscore";
      try {
        fixtures = await fetchSportScore({ status: "live" });
      } catch {
        try {
          source = "api-football";
          fixtures = await fetchApiSports({ live: "all", timezone: "America/Sao_Paulo" });
        } catch {
          // An old live score must never be presented as a current live score.
          return json({ mode: "live", source: "unavailable", results: 0, fixtures: [],
            stale: true, fetched_at: cached?.fetched_at || null,
            viewer_country: viewerCountry, viewer_country_name: viewerCountryName }, 200, 0);
        }
      }

      const fetchedAt = new Date().toISOString();
      const payload = {
        mode: "live",
        source,
        timezone: "America/Sao_Paulo",
        results: fixtures.length,
        fixtures,
        refresh_minutes: 1
      };

      await sb.from("football_catalog_cache").upsert({
        cache_key: cacheKey,
        payload,
        fetched_at: fetchedAt,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      });

      return json({
        ...payload,
        viewer_country: viewerCountry,
        viewer_country_name: viewerCountryName,
        cached: false,
        fetched_at: fetchedAt
      });
    }

    const { data: cached } = await sb.from("football_daily_cache")
      .select("payload,fetched_at,expires_at")
      .eq("cache_date", date)
      .maybeSingle();

    const today = localDateSP();
    const fetchedDate = cached?.fetched_at ? dateInSP(cached.fetched_at) : null;
    const valid =
      cached?.payload &&
      new Date(cached.expires_at).getTime() > Date.now() &&
      !(date === today && fetchedDate !== today) &&
      cached.payload?.source === "sportscore";

    if (valid) {
      return json({
        ...cached.payload,
        viewer_country: viewerCountry,
        viewer_country_name: viewerCountryName,
        cached: true,
        fetched_at: cached.fetched_at
      });
    }

    let fixtures: any[] = [];
    let source = "sportscore";
    try {
      fixtures = await fetchSportScore({ date });
    } catch {
      try {
        source = "api-football";
        fixtures = await fetchApiSports({ date, timezone: "America/Sao_Paulo" });
      } catch {
        if (cached?.payload) return json({
          ...cached.payload, cached: true, stale: true, fetched_at: cached.fetched_at,
          viewer_country: viewerCountry, viewer_country_name: viewerCountryName
        }, 200, 0);
        return json({ error: "football_feed_unavailable", date, fixtures: [] }, 503, 0);
      }
    }

    const fetchedAt = new Date().toISOString();
    const ttlMinutes = date === today ? 3 : (date > today ? 180 : 720);
    const payload = {
      date,
      source,
      timezone: "America/Sao_Paulo",
      results: fixtures.length,
      fixtures
    };

    await sb.from("football_daily_cache").upsert({
      cache_date: date,
      payload,
      fetched_at: fetchedAt,
      expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString()
    });

    return json({
      ...payload,
      viewer_country: viewerCountry,
      viewer_country_name: viewerCountryName,
      cached: false,
      fetched_at: fetchedAt,
      refresh_minutes: ttlMinutes
    });
  } catch (e) {
    return json({ error: "football_feed_unavailable", message: String((e as any)?.message || e) }, 502);
  }
});

