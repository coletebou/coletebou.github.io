// Refreshes data/github.json from GitHub. Any part that cannot be fetched keeps its previous value,
// so a build never loses data because one call failed or a token cannot see a private repo.
//
// Token: GITHUB_TOKEN, else `gh auth token`. The Actions token sees public repos only; set the
// PROFILE_TOKEN secret (read-only, repo scope) to keep private-repo activity current too.

import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { parseContributions, selectUpstream } from "./lib.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/github.json", ROOT);
const projects = JSON.parse(await readFile(new URL("data/projects.json", ROOT), "utf8"));
const OWNER = projects.owner;
const EXCLUDED_OWNERS = [OWNER, "Badland-AI"];

let prev = {};
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execSync("gh auth token", { encoding: "utf8" }).trim(); } catch { return ""; }
}
const TOKEN = token();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${OWNER}-site-builder`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (res.status === 202) return { pending: true };
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// Repository statistics are computed lazily; GitHub answers 202 until they are ready.
async function participation(repo) {
  for (let i = 0; i < 6; i++) {
    const body = await api(`/repos/${OWNER}/${repo}/stats/participation`);
    if (!body.pending) return body.all;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`${repo}: participation still computing`);
}

const log = (...a) => console.log("[data]", ...a);
const out = { generatedAt: new Date().toISOString(), profile: prev.profile, contributions: prev.contributions, repos: { ...(prev.repos || {}) }, upstream: prev.upstream };

try {
  const u = await api(`/users/${OWNER}`);
  out.profile = { name: u.name, location: u.location, followers: u.followers, publicRepos: u.public_repos, since: u.created_at };
  log("profile ok");
} catch (e) { log("profile kept:", e.message); }

try {
  const res = await fetch(`https://github.com/users/${OWNER}/contributions`, { headers: { "User-Agent": "Mozilla/5.0 (site builder)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const days = parseContributions(await res.text());
  if (days.length < 300) throw new Error(`only ${days.length} days parsed`);
  out.contributions = { total: days.reduce((a, d) => a + d.count, 0), days: days.map((d) => [d.date, d.count]) };
  log(`contributions ok: ${days.length} days, ${out.contributions.total} total`);
} catch (e) { log("contributions kept:", e.message); }

for (const repo of [...new Set(projects.sheets.map((s) => s.repo).filter(Boolean))]) {
  try {
    const r = await api(`/repos/${OWNER}/${repo}`);
    const entry = { public: !r.private, createdAt: r.created_at, pushedAt: r.pushed_at, stars: r.stargazers_count, language: r.language };
    try { entry.weekly = await participation(repo); } catch (e) { entry.weekly = out.repos[repo]?.weekly; log(`${repo} weekly kept:`, e.message); }
    out.repos[repo] = entry;
    log(`${repo} ok`);
  } catch (e) { log(`${repo} kept:`, e.message); }
}

try {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const q = encodeURIComponent(`author:${OWNER} type:pr is:merged ${EXCLUDED_OWNERS.map((o) => `-user:${o}`).join(" ")}`);
    const body = await api(`/search/issues?q=${q}&per_page=100&page=${page}`);
    items.push(...body.items);
    if (items.length >= body.total_count || body.items.length === 0) break;
  }
  const prs = selectUpstream(items, EXCLUDED_OWNERS);
  // A token that can see private repos would surface PRs into them; only public repos are listed.
  const visible = new Map();
  for (const repo of new Set(prs.map((p) => p.repo))) {
    try { visible.set(repo, !(await api(`/repos/${repo}`)).private); } catch { visible.set(repo, false); }
  }
  out.upstream = { prs: prs.filter((p) => visible.get(p.repo)) };
  log(`upstream ok: ${out.upstream.prs.length} public merged PRs`);
} catch (e) { log("upstream kept:", e.message); }

await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
log("wrote data/github.json");
