// Offline tests with invented pages: the parsers that read the schedule and the player chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../sdk/validate.mjs";
import { firstIframe, streamUrlOf, parseSchedule } from "../plugin.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Kino accepts the manifest and the exports", async () => {
  const r = await validate(root);
  assert.deepEqual(r.problems, []);
});

test("firstIframe resolves absolute, protocol-relative and root-relative sources", () => {
  assert.equal(firstIframe('<div><iframe class="x" src="https://xstream.st/canal.php?stream=E5"></iframe>', "https://a.org/ver/x.php"), "https://xstream.st/canal.php?stream=E5");
  assert.equal(firstIframe("<iframe src='//xstream.st/c.php'></iframe>", "https://a.org/x"), "https://xstream.st/c.php");
  assert.equal(firstIframe('<iframe src="/espn2hd.php"></iframe>', "https://a.org/ver/espn2.php"), "https://a.org/espn2hd.php");
  assert.equal(firstIframe("<p>nothing</p>", "https://a.org/"), null);
});

test("streamUrlOf takes the first stream, unescaped, and only https", () => {
  assert.equal(streamUrlOf('var streamUrls = ["https:\/\/cdn.example\/live.m3u8?a=1\u0026b=2", "https://other/x.m3u8"];'), "https://cdn.example/live.m3u8?a=1&b=2");
  assert.equal(streamUrlOf('streamUrls = ["http://insecure/x.m3u8"]'), null);
  assert.equal(streamUrlOf("no list here"), null);
});

test("parseSchedule keeps valid matches, sorted by hour, and drops bad channel paths", () => {
  const out = parseSchedule([
    { hora_utc: "2026-11-03T20:00:00Z", liga: "UEFA Champions League:", equipos: "Barcelona  vs. Aston Villa", canales: [{ nombre: "ESPN", url: "/ver/espn.php", calidad: "720p" }] },
    { hora_utc: "2026-11-03T17:45:00Z", liga: "UEFA Champions League:", equipos: "Galatasaray vs. VfB Stuttgart", canales: [{ nombre: "ESPN 5", url: "/ver/espn5.php" }, { nombre: "Raro", url: "https://evil.example/x" }] },
    { hora_utc: "2026-11-03T18:00:00Z", equipos: "Sin canales", canales: [] },
    null,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, "Galatasaray vs. VfB Stuttgart");
  assert.equal(out[0].league, "UEFA Champions League");
  assert.deepEqual(out[0].channels.map((c) => c.path), ["/ver/espn5.php"]);
  assert.equal(out[1].title, "Barcelona vs. Aston Villa");
  assert.deepEqual(parseSchedule("not a list"), []);
});

test("every id the plugin hands out is one Kino accepts", async () => {
  const ok = /^[A-Za-z0-9._~-]{1,128}$/;
  const schedule = [{ hora_utc: new Date(Date.now() + 3600e3).toISOString(), liga: "Liga: Ñandú Ç", equipos: "Peñarol vs. Fénix", canales: [{ nombre: "ESPN 2 HD", url: "/ver/espn2.php", calidad: "720p" }] }];
  globalThis.kino = { lang: "es", fetch: async () => ({ ok: true, json: () => schedule }), error: (c, m) => new Error(c + m) };
  const { liveCategories, liveChannels } = await import("../plugin.js");
  const cats = await liveCategories();
  assert.ok(cats.length >= 2 && cats.every((c) => ok.test(c.id)), JSON.stringify(cats));
  for (const c of cats) {
    const { items } = await liveChannels({ categoryId: c.id });
    assert.ok(items.length > 0 && items.every((i) => ok.test(i.id)), c.id);
  }
});

test("a match carries its league logo from the site, and only a safe path", () => {
  const [a, b] = parseSchedule([
    { hora_utc: "2026-11-03T20:00:00Z", logo: "img/cha.png", equipos: "A vs. B", canales: [{ nombre: "X", url: "/ver/x.php" }] },
    { hora_utc: "2026-11-03T21:00:00Z", logo: "https://evil.example/x.png", equipos: "C vs. D", canales: [{ nombre: "X", url: "/ver/x.php" }] },
  ]);
  assert.equal(a.logo, "https://elcanaldeportivo.org/img/cha.png");
  assert.equal(b.logo, "");
});
