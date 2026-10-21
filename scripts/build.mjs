// Renders src/index.html + data/*.json into dist/. Everything a reader needs is in the HTML;
// assets/site.js only adds the contour survey, filters, theme toggle and copy button.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { esc, profileSvg, shortDate, surveyStakes } from "./lib.mjs";

const ROOT = new URL("../", import.meta.url);
const DIST = new URL("dist/", ROOT);
const read = async (p) => readFile(new URL(p, ROOT), "utf8");

const projects = JSON.parse(await read("data/projects.json"));
const gh = JSON.parse(await read("data/github.json"));
const repos = gh.repos || {};
const days = gh.contributions?.days || [];
const fmt = (n) => Number(n).toLocaleString("en-US");
const generated = gh.generatedAt || new Date().toISOString();

// Deterministic PRNG so the drawn grass and roots are identical on every build.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const f1 = (n) => n.toFixed(1);

// ---------- cover ----------
function zones() {
  const top = "12345678".split("").map((n) => `<span>${n}</span>`).join("");
  const side = "ABCD".split("").map((n) => `<span>${n}</span>`).join("");
  return `<div class="z-top">${top}</div><div class="z-bot">${top}</div><div class="z-left">${side}</div><div class="z-right">${side}</div>`;
}

function peakText() {
  if (!days.length) return "";
  const [date, count] = days.reduce((a, d) => (d[1] > a[1] ? d : a));
  return `Summit ${fmt(count)} contributions on ${date}. Move across the survey to read the ground.`;
}

function windowText() {
  if (!days.length) return "";
  const m = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${m(days[0][0])} to ${m(days[days.length - 1][0])}`;
}

function surveyJson() {
  const stakes = days.length ? surveyStakes(projects.sheets, repos, days[0][0], days[days.length - 1][0]) : [];
  return JSON.stringify({ days, stakes }).replace(/</g, "\\u003c");
}

// ---------- notes ----------
function revisions() {
  let lines = [];
  try {
    lines = execSync('git log -6 --date=short --format="%h%x09%ad%x09%s"', { cwd: new URL(".", ROOT), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim().split("\n").filter(Boolean);
  } catch { /* not a git checkout */ }
  if (!lines.length) return `<tr><td>A</td><td>${shortDate(generated)}</td><td>Issued for construction</td></tr>`;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return lines
    .map((l, i) => {
      const [hash, date, subject] = l.split("\t");
      const rev = letters[(lines.length - 1 - i) % 26];
      return `<tr><td><span class="delta">${rev}</span></td><td>${esc(date)}</td><td>${esc(subject)} <code>${esc(hash)}</code></td></tr>`;
    })
    .join("");
}

function revLetter() {
  try {
    const n = Number(execSync("git rev-list --count HEAD", { cwd: new URL(".", ROOT), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(n - 1) % 26] || "A";
  } catch { return "A"; }
}

// ---------- schedule ----------
function filters() {
  const counts = {};
  for (const s of projects.sheets) counts[s.discipline] = (counts[s.discipline] || 0) + 1;
  const chip = (f, label, n, on) => `<button type="button" class="chip" data-f="${f}" aria-pressed="${on}">${label}<span>${n}</span></button>`;
  return chip("all", "All", projects.sheets.length, true) +
    Object.entries(projects.disciplines).map(([k, v]) => chip(k, `${k} · ${esc(v)}`, counts[k] || 0, false)).join("");
}

function scheduleRows() {
  return projects.sheets.map((s) => {
    const r = s.repo ? repos[s.repo] : null;
    const repoUrl = r?.public ? `https://github.com/${projects.owner}/${s.repo}` : null;
    const href = s.link || repoUrl;
    const status = projects.statuses[s.status] || s.status;
    const title = href ? `<a href="${esc(href)}">${esc(s.title)}</a>` : `<span>${esc(s.title)}</span>`;
    const where = [];
    if (s.link) where.push(`<a class="where" href="${esc(s.link)}">${esc(s.link.replace(/^https:\/\//, ""))}</a>`);
    if (repoUrl && repoUrl !== s.link) where.push(`<a class="where" href="${repoUrl}">source</a>`);
    if (r && !r.public) where.push(`<span class="where">private source</span>`);
    const weekly = r?.weekly;
    const sum = weekly ? weekly.reduce((a, b) => a + b, 0) : 0;
    const profile = weekly && sum > 0
      ? `${profileSvg(weekly, { label: `${s.title}: ${sum} commits in 52 weeks` })}<span class="prof-n">${fmt(sum)}</span>`
      : `<span class="na">${r ? "quiet" : "n/a"}</span>`;
    return `<tr data-d="${s.discipline}" class="st-${s.status}">` +
      `<td class="c-mark"><span class="mark">${esc(s.mark)}</span></td>` +
      `<td class="c-item"><div class="item-t">${title}</div><p>${esc(s.summary)}</p><div class="item-w">${where.join("")}</div></td>` +
      `<td class="c-status"><span class="status s-${s.status}">${esc(status)}</span></td>` +
      `<td class="c-stack">${s.stack.map((x) => `<span>${esc(x)}</span>`).join("")}</td>` +
      `<td class="c-prof">${profile}</td>` +
      `<td class="c-last num">${r?.pushedAt ? shortDate(r.pushedAt) : "—"}</td></tr>`;
  }).join("");
}

// ---------- upstream ----------
const prs = gh.upstream?.prs || [];
function upstreamRows() {
  if (!prs.length) return `<tr><td colspan="3">No public upstream merges recorded yet.</td></tr>`;
  return prs.map((p) => `<tr><td class="num">${shortDate(p.mergedAt)}</td><td><a href="https://github.com/${esc(p.repo)}">${esc(p.repo)}</a></td><td><a href="${esc(p.url)}">${esc(p.title)}</a></td></tr>`).join("");
}
function upstreamRepos() {
  const by = {};
  for (const p of prs) by[p.repo] = (by[p.repo] || 0) + 1;
  return Object.entries(by).sort((a, b) => b[1] - a[1])
    .map(([repo, n]) => `<li><b class="num">${n}</b><a href="https://github.com/${esc(repo)}">${esc(repo)}</a></li>`).join("");
}

// ---------- detail drawings ----------
function loadArrows() {
  let out = "";
  for (let x = 160; x <= 440; x += 40) out += `<path d="M${x} 18 V44"/><path class="fill-ink" d="M${x} 50 L${x - 4} 41 H${x + 4} Z"/>`;
  return out;
}

// Career profile: x is the calendar year, y rises with each alignment.
const X0 = 60, X1 = 940, Y0 = 2017, Y1 = 2027;
const px = (year) => X0 + ((year - Y0) / (Y1 - Y0)) * (X1 - X0);
const nowYear = (() => { const d = new Date(generated); return d.getUTCFullYear() + d.getUTCMonth() / 12 + d.getUTCDate() / 365; })();
const grade = [[2017.6, 222], [2021.4, 196], [2021.45, 196], [2024.85, 150], [nowYear, 64]];
const gradeY = (yr) => {
  for (let i = 1; i < grade.length; i++) {
    const [ax, ay] = grade[i - 1], [bx, by] = grade[i];
    if (yr <= bx) return ay + ((yr - ax) / (bx - ax || 1)) * (by - ay);
  }
  return grade[grade.length - 1][1];
};
function profileGrid() {
  let g = `<path class="ln-t" d="M${X0} 244 H${X1}"/>`;
  for (let y = Y0; y <= Y1; y++) {
    const x = px(y);
    g += `<path class="ln-grid" d="M${f1(x)} 24 V244"/><path class="ln-t" d="M${f1(x)} 244 V252"/>` +
      `<text class="t t-c t-s" x="${f1(x)}" y="266">${String(y).slice(2)}+00</text>`;
  }
  g += `<text class="t t-m" x="${X0}" y="284">STATION = YEAR · ELEVATION = RESPONSIBILITY, NTS</text>`;
  return g;
}
const gradeLine = () => "M" + grade.map(([x, y]) => `${f1(px(x))} ${y}`).join(" L");
const badlandLine = () => `M${f1(px(2024.0))} ${f1(gradeY(2024.0) - 34)} L${f1(px(nowYear))} 30`;
function profileMarks() {
  const pvi = [[2021.42, "PVI · KIEWIT · JUN 2021", -1], [2024.85, "PVI · X-ENERGY · NOV 2024", 1]];
  let m = "";
  for (const [yr, label, dir] of pvi) {
    const x = px(yr), y = gradeY(yr), y2 = y + dir * 44;
    m += `<circle class="pvi" cx="${f1(x)}" cy="${f1(y)}" r="5"/><path class="ln-t" d="M${f1(x)} ${f1(y + dir * 6)} V${f1(y2)}"/>` +
      `<text class="t t-c" x="${f1(x)}" y="${f1(y2 + (dir > 0 ? 12 : -6))}">${label}</text>`;
  }
  const xs = px(2017.6);
  m += `<circle class="pvi" cx="${f1(xs)}" cy="222" r="5"/><text class="t" x="${f1(xs + 10)}" y="236">POB · CLEMSON · 2017</text>`;
  const xn = px(nowYear);
  m += `<path class="ln-flag dash" d="M${f1(xn)} 18 V244"/><text class="t t-flag t-r" x="${f1(xn - 8)}" y="20">TODAY</text>`;
  m += `<text class="t-b" x="${f1(px(2018.4))}" y="200">CIVIL ENGINEERING</text>`;
  m += `<text class="t-b" x="${f1(px(2022.2))}" y="164">HEAVY CIVIL FIELD WORK</text>`;
  m += `<text class="t-b" x="${f1(px(2025.05))}" y="${f1(gradeY(2025.05) - 14)}">AI SOFTWARE</text>`;
  m += `<text class="t-b t-flag t-r" x="${f1(px(2024.0) - 10)}" y="${f1(gradeY(2024.0) - 30)}">BADLAND</text>`;
  return m;
}

// ---------- off-the-clock drawings ----------
function orbits() {
  // Earth sits at the lower left; each radius is proportional to log10(altitude / 100 km).
  const cx = 36, cy = 262, re = 26, k = 60;
  const r = (km) => re + k * Math.log10(km / 100);
  const rings = [
    ["ISS", "≈ 420 KM", 420],
    ["GPS", "20,200 KM", 20200],
    ["GEO", "35,786 KM", 35786],
    ["MOON", "≈ 384,400 KM", 384400],
  ];
  let s = `<path class="earth" d="M${cx} ${cy} V${cy - re} A${re} ${re} 0 0 1 ${cx + re} ${cy} Z"/>` +
    `<path class="ln-h" d="M${cx} ${cy - re} A${re} ${re} 0 0 1 ${cx + re} ${cy}"/>` +
    `<text class="t t-s" x="${cx - 4}" y="${cy + 14}">EARTH</text>`;
  rings.forEach(([name, alt, km], i) => {
    const R = r(km);
    const a = [40, 72, 28, 56][i] * (Math.PI / 180);
    const bx = cx + R * Math.cos(a), by = cy - R * Math.sin(a);
    const left = name === "GPS";
    s += `<path class="${name === "MOON" ? "ln-flag" : "ln"} ${name === "GEO" ? "dash" : ""}" d="M${cx} ${f1(cy - R)} A${f1(R)} ${f1(R)} 0 0 1 ${f1(cx + R)} ${cy}"/>` +
      `<circle class="${name === "MOON" ? "fill-flag" : "fill-ink"}" cx="${f1(bx)}" cy="${f1(by)}" r="${name === "MOON" ? 6 : 3}"/>` +
      `<text class="t-b${left ? " t-r" : ""}" x="${f1(bx + (left ? -9 : 9))}" y="${f1(by - 4)}">${name}</text>` +
      `<text class="t t-m t-s${left ? " t-r" : ""}" x="${f1(bx + (left ? -9 : 9))}" y="${f1(by + 9)}">${alt}</text>`;
  });
  s += `<path class="ln-t" d="M${cx} ${cy} H392"/>`;
  return s;
}

function prairie() {
  const rand = rng(1907);
  const ground = 108;
  let grass = "", roots = "";
  for (let x = 18; x < 300; x += 7 + rand() * 6) {
    const h = 44 + rand() * 52;
    const lean = (rand() - 0.5) * 26;
    grass += `<path d="M${f1(x)} ${ground} Q${f1(x + lean * 0.3)} ${f1(ground - h * 0.6)} ${f1(x + lean)} ${f1(ground - h)}"/>`;
    if (rand() > 0.72) { // a seed head, the turkey-foot of big bluestem
      const tx = x + lean, ty = ground - h;
      grass += `<path d="M${f1(tx)} ${f1(ty)} l-6 -10 M${f1(tx)} ${f1(ty)} l0 -12 M${f1(tx)} ${f1(ty)} l6 -10"/>`;
    }
    const d = 90 + rand() * 120;
    let rx = x, ry = ground, path = `M${f1(rx)} ${ground}`;
    for (let i = 0; i < 5; i++) { rx += (rand() - 0.5) * 16; ry += d / 5; path += ` L${f1(rx)} ${f1(Math.min(ry, 262))}`; }
    roots += `<path d="${path}"/>`;
  }
  const horizons = [[108, "O"], [132, "A"], [176, "B"], [226, "C"]];
  let h = "";
  for (const [y, n] of horizons) h += `<path class="ln-t dash" d="M10 ${y} H306"/><text class="t-b" x="312" y="${y + 13}">${n}</text>`;
  return `<path class="ln-h" d="M10 ${ground} H306"/><g class="grass">${grass}</g><g class="roots">${roots}</g>${h}` +
    `<path class="ln-t" d="M352 ${ground} V262 M346 ${ground} H358 M346 262 H358"/>` +
    `<text class="t t-c" transform="translate(370 185) rotate(-90)">ROOTS TO ≈ 2–3 M</text>` +
    `<text class="t t-s" x="314" y="34">BIG BLUESTEM</text><text class="t t-s" x="314" y="46">TURKEYFOOT, TYP.</text><path class="ln-t" d="M312 42 L290 56"/>` +
    `<text class="t t-m" x="12" y="282">SECTION THROUGH TALLGRASS PRAIRIE · NTS</text>`;
}

function columns() {
  let c = "";
  for (let x = 64; x < 232; x += 21) c += `<rect x="${x - 3}" y="122" width="6" height="6"/><rect x="${x - 3}" y="176" width="6" height="6"/>`;
  return c;
}

// ---------- assemble ----------
const live = projects.sheets.filter((s) => s.status === "live").length;
const vars = {
  rev: revLetter(),
  zones: zones(),
  totalFmt: fmt(gh.contributions?.total ?? 0),
  upstreamCount: fmt(prs.length),
  generatedDate: shortDate(generated),
  window: windowText(),
  peak: esc(peakText()),
  surveyJson: surveyJson(),
  revisions: revisions(),
  sheetCount: projects.sheets.length,
  liveCount: live,
  filters: filters(),
  schedule: scheduleRows(),
  upstream: upstreamRows(),
  upstreamRepos: upstreamRepos(),
  loadArrows: loadArrows(),
  profileGrid: profileGrid(),
  gradeLine: gradeLine(),
  badlandLine: badlandLine(),
  profileMarks: profileMarks(),
  orbits: orbits(),
  prairie: prairie(),
  columns: columns(),
};

let html = await read("src/index.html");
html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`template variable {{${k}}} has no value`);
  return String(vars[k]);
});

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(new URL("assets/", ROOT), new URL("assets/", DIST), { recursive: true });
await writeFile(new URL("index.html", DIST), html);
await writeFile(new URL(".nojekyll", DIST), "");
console.log(`[build] dist/index.html ${(html.length / 1024).toFixed(1)} KB, ${projects.sheets.length} items, ${prs.length} upstream PRs`);
