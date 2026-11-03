// DeporTV: live matches from the El Canal Deportivo schedule, as channels in Kino's En vivo tab, grouped by league.
// The schedule is a JSON list (hour, league, teams, channels). A channel's page holds an iframe chain that ends in a
// player page; the player page lists its stream in a script. Only the xstream.st player is understood so far.

const HOST = "https://elcanaldeportivo.org";
const PLAYER_HOST = "xstream.st";
const MAX_FRAMES = 3; // pages followed from a channel page to its player
const TODAY_ID = "today";
const ON_AIR_MS = 3 * 60 * 60 * 1000; // a match that started up to 3 hours ago is still on air
const DAY_MS = 24 * 60 * 60 * 1000;

const TEXTS = {
  es: {
    today: "Hoy",
    unavailable: "La agenda de DeporTV no responde ahora. Intenta de nuevo en un rato.",
    noSignal: "Este canal no tiene señal ahora mismo. Si el partido aún no empieza, vuelve más tarde.",
    unsupported: "Este canal usa un reproductor que DeporTV aún no entiende.",
  },
  en: {
    today: "Today",
    unavailable: "The DeporTV schedule is not answering right now. Try again in a moment.",
    noSignal: "This channel has no signal right now. If the match has not started yet, come back later.",
    unsupported: "This channel uses a player DeporTV does not understand yet.",
  },
};

function t(key) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  return TEXTS[lang][key] || TEXTS.es[key] || key;
}

// A page asked for as an iframe, the way a browser loads an embedded player.
function frameHeaders(referer) {
  return { Referer: referer, "Sec-Fetch-Dest": "iframe", Accept: "text/html" };
}

async function getText(url, referer) {
  const r = await kino.fetch(url, { headers: frameHeaders(referer) });
  if (!r.ok) throw kino.error("unavailable", url + " answered " + r.status, { userMessage: t("noSignal") });
  return r.text();
}

function absolute(src, base) {
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("//")) return "https:" + src;
  return base.replace(/^(https?:\/\/[^/]+).*$/i, "$1") + (src.startsWith("/") ? "" : "/") + src;
}

/** The first iframe source of [html], resolved against [base], or null. */
export function firstIframe(html, base) {
  const m = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  return m ? absolute(m[1], base) : null;
}

/** The first stream of the player's `streamUrls = ["…"]` list, unescaped, or null. */
export function streamUrlOf(script) {
  const m = /streamUrls\s*=\s*\[\s*"([^"]+)"/.exec(script);
  if (!m) return null;
  const url = m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  return /^https:\/\//.test(url) ? url : null;
}

/** Matches of the schedule as { league, title, utc, logo, channels: [{ name, path, quality }] }; the hour as epoch ms. */
export function parseSchedule(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.equipos !== "string") continue;
    const channels = (Array.isArray(m.canales) ? m.canales : [])
      .filter((c) => c && typeof c.url === "string" && /^\/ver\/[\w.-]+\.php$/.test(c.url))
      .map((c) => ({ name: String(c.nombre || "").slice(0, 60), path: c.url, quality: String(c.calidad || "") }));
    if (!channels.length) continue;
    out.push({
      league: String(m.liga || "").replace(/:\s*$/, "").trim() || "Otros",
      title: m.equipos.replace(/\s+/g, " ").trim().slice(0, 120),
      utc: Date.parse(m.hora_utc) || 0,
      logo: /^img\/[\w.-]+$/.test(m.logo || "") ? HOST + "/" + m.logo : "",
      channels,
    });
  }
  return out.sort((a, b) => a.utc - b.utc);
}

async function schedule() {
  const r = await kino.fetch(HOST + "/partidos.json?v=" + Math.floor(Date.now() / 60000), { headers: { Accept: "application/json", Referer: HOST + "/" } });
  if (!r.ok) throw kino.error("unavailable", "schedule answered " + r.status, { userMessage: t("unavailable") });
  return parseSchedule(r.json());
}

function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Kino accepts ids of letters, digits and . _ ~ - only.
function leagueId(league) {
  return "l_" + slug(league).slice(0, 60);
}

function clock(utc) {
  const d = new Date(utc);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC";
}

function channelsOf(match, categoryId) {
  return match.channels.map((c) => ({
    id: (match.utc + "_" + slug(match.title).slice(0, 60) + "_" + slug(c.name).slice(0, 30)).slice(0, 120),
    title: match.title + " · " + c.name + (c.quality ? " (" + c.quality + ")" : "") + " · " + clock(match.utc),
    ref: c.path,
    categoryId,
    ...(match.logo ? { logo: match.logo } : {}),
  }));
}

export async function home() {
  return [];
}

export async function liveCategories() {
  const matches = await schedule();
  const leagues = [...new Set(matches.map((m) => m.league))];
  return [{ id: TODAY_ID, title: t("today"), genre: "deportes" }, ...leagues.map((l) => ({ id: leagueId(l), title: l, genre: "deportes" }))];
}

export async function liveChannels({ categoryId }) {
  const matches = await schedule();
  const now = Date.now();
  const picked = categoryId === TODAY_ID ? matches.filter((m) => m.utc > now - ON_AIR_MS && m.utc < now + DAY_MS) : matches.filter((m) => leagueId(m.league) === categoryId);
  return { items: picked.flatMap((m) => channelsOf(m, categoryId)).slice(0, 200) };
}

export async function liveSearch({ query }) {
  const q = slug(String(query || ""));
  if (!q) return { items: [] };
  const matches = (await schedule()).filter((m) => slug(m.title + " " + m.league).includes(q));
  return { items: matches.flatMap((m) => channelsOf(m, TODAY_ID)).slice(0, 100) };
}

export async function resolve(ref) {
  if (typeof ref !== "string" || !/^\/ver\/[\w.-]+\.php$/.test(ref)) throw kino.error("not_found");
  // Channel page -> its player frames -> the player page that lists the stream.
  let page = HOST + ref;
  let referer = HOST + "/";
  for (let i = 0; i < MAX_FRAMES; i++) {
    const html = await getText(page, referer);
    if (new URL(page).host === PLAYER_HOST) {
      const url = streamUrlOf(html);
      if (!url) throw kino.error("not_found", "no stream in the player", { userMessage: t("noSignal") });
      return { url, mime: "application/vnd.apple.mpegurl", headers: { Referer: page, Origin: "https://" + PLAYER_HOST } };
    }
    const next = firstIframe(html, page);
    if (!next) throw kino.error("not_found", "no frame", { userMessage: t("noSignal") });
    const host = new URL(next).host;
    if (host !== new URL(HOST).host && host !== PLAYER_HOST) throw kino.error("not_found", "player " + host, { userMessage: t("unsupported") });
    referer = page;
    page = next;
  }
  throw kino.error("not_found", "too many frames", { userMessage: t("noSignal") });
}
