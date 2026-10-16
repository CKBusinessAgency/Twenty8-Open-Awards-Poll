// The Twenty8 Open awards voting: Cloudflare Worker + D1.
const AWARDS = ["dressed", "social", "hustler", "improved", "wall"];

// Attendee list. Loaded into the database automatically the first time the app runs.
// Format: [id, first, last, onBallot (1/0), allowedAwards (JSON text or null)]
const PEOPLE = [
  ["whitneydokes", "Whitney", "Dokes", 1, null],
  ["datreesethomas", "Datreese", "Thomas", 1, null],
  ["ebonyd", "Ebony", "D.", 1, null],
  ["alyssapage", "Alyssa", "Page", 1, null],
  ["linhchinguyen", "Linhchi", "Nguyen", 1, null],
  ["camrynschwartz", "Camryn", "Schwartz", 1, null],
  ["samauramccloe", "Samaura", "McCloe", 1, null],
  ["sarnomillion", "Sarno", "Million", 1, null],
  ["irinaandria", "Irina", "Andria", 1, null],
  ["osaoriakhi", "Osa", "Oriakhi", 1, null],
  ["natashablanco", "Natasha", "Blanco", 1, null],
  ["arielhill", "Ariel", "Hill", 1, null],
  ["itzelbolanos", "Itzel", "Bolanos", 1, null],
  ["isabellalzate", "Isabell", "Alzate", 1, null],
  ["yasmins", "Yasmin", "S", 1, null],
  ["danaenash", "Danae", "Nash", 1, null],
  ["snowthai", "Snow", "Thai", 1, null],
  ["sofiacollantes", "Sofia", "Collantes", 1, null],
  ["selenanguyen", "Selena", "Nguyen", 1, null],
  ["caratom", "Cara", "Tom", 1, null],
  ["alexisdavalt", "Alexis", "DaValt", 1, null],
  ["zyjirathomas", "Zyjira", "Thomas", 1, null],
  ["anoviaandrews", "Anovia", "Andrews", 1, null],
  ["datranellmcintyre", "Datranell", "McIntyre", 1, null],
  ["selithahaudey", "Selitha", "Haudey", 1, null],
  ["chloelacy", "Chloè", "Lacy", 0, null],
  ["coachmussi", "Coach", "Mussi", 0, '["improved","wall","hustler"]'],
];

let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS names (id TEXT PRIMARY KEY, first TEXT NOT NULL, last TEXT NOT NULL DEFAULT '', nominee INTEGER NOT NULL DEFAULT 1, only TEXT, added INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS votes (voter TEXT PRIMARY KEY, picks TEXT NOT NULL, ts INTEGER NOT NULL)").run();
  const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM names").first();
  if (!c || c.c === 0) {
    await env.DB.batch(PEOPLE.map(([id, first, last, nominee, only]) =>
      env.DB.prepare("INSERT OR IGNORE INTO names (id,first,last,nominee,only) VALUES (?,?,?,?,?)").bind(id, first, last, nominee, only)));
  }
  ready = true;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const clean = (s, max = 40) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const row = (r) => ({
  id: r.id, first: r.first, last: r.last,
  nominee: !!r.nominee, only: r.only ? JSON.parse(r.only) : null,
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p.startsWith("/api/")) await setup(env);
      if (p === "/api/names" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id,first,last,nominee,only FROM names ORDER BY first,last").all();
        return json(results.map(row));
      }

      if (p === "/api/names" && req.method === "POST") {
        const b = await req.json();
        const first = clean(b.first), last = clean(b.last);
        const id = slug(first + last);
        if (!first || !id) return json({ error: "Enter a first name." }, 400);
        await env.DB.prepare("INSERT OR IGNORE INTO names (id,first,last,nominee,added) VALUES (?,?,?,1,1)")
          .bind(id, first, last).run();
        const r = await env.DB.prepare("SELECT id,first,last,nominee,only FROM names WHERE id=?").bind(id).first();
        return json(row(r));
      }

      if (p === "/api/vote" && req.method === "POST") {
        const b = await req.json();
        const voter = await env.DB.prepare("SELECT id,only FROM names WHERE id=?").bind(String(b.voter)).first();
        if (!voter) return json({ error: "Unknown voter." }, 400);
        const allowed = voter.only ? JSON.parse(voter.only) : AWARDS;
        const { results } = await env.DB.prepare("SELECT id FROM names WHERE nominee=1").all();
        const nominees = new Set(results.map((r) => r.id));
        const picks = {};
        for (const [award, who] of Object.entries(b.picks || {})) {
          if (AWARDS.includes(award) && allowed.includes(award) && nominees.has(who)) picks[award] = who;
        }
        if (!Object.keys(picks).length) return json({ error: "Pick at least one award." }, 400);
        await env.DB.prepare("INSERT OR REPLACE INTO votes (voter,picks,ts) VALUES (?,?,?)")
          .bind(voter.id, JSON.stringify(picks), Date.now()).run();
        return json({ ok: true });
      }

      if (p === "/api/results" && req.method === "GET") {
        if (!sameKey(req.headers.get("x-host-key") || "", env.HOST_KEY || "")) return json({ error: "Not allowed." }, 401);
        const names = (await env.DB.prepare("SELECT id,first,last,nominee,only FROM names").all()).results.map(row);
        const votes = (await env.DB.prepare("SELECT voter,picks,ts FROM votes").all()).results
          .map((v) => ({ voter: v.voter, picks: JSON.parse(v.picks), ts: v.ts }));
        return json({ names, votes });
      }

      return json({ error: "Not found." }, 404);
    } catch (e) {
      return json({ error: "Something went wrong. Try again." }, 500);
    }
  },
};
