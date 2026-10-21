// Builds the real site from the committed data and checks the output a visitor gets.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
let html, projects, gh;

before(async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT });
  html = await readFile(new URL("dist/index.html", ROOT), "utf8");
  projects = JSON.parse(await readFile(new URL("data/projects.json", ROOT), "utf8"));
  gh = JSON.parse(await readFile(new URL("data/github.json", ROOT), "utf8"));
});

test("every template variable is filled with a real value", async () => {
  // Only the template's own placeholders and rendered values are checked, so ordinary text in
  // commit subjects or PR titles ("handle undefined", "{{x}}") can never block a deploy.
  const template = await readFile(new URL("src/index.html", ROOT), "utf8");
  for (const [, name] of template.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(!html.includes(`{{${name}}}`), name);
  assert.doesNotMatch(html, /="(?:undefined|NaN|null)"|>(?:undefined|NaN|null)</);
  assert.doesNotMatch(html, /\b(?:d|points|x|y|cx|cy|r)="[^"]*NaN/);
});

test("every schedule item is rendered with its mark", () => {
  for (const s of projects.sheets) assert.ok(html.includes(`<span class="mark">${s.mark}</span>`), s.mark);
});

test("no page links into a private repository", () => {
  for (const [name, r] of Object.entries(gh.repos)) {
    if (r.public) continue;
    assert.ok(!html.includes(`github.com/${projects.owner}/${name}"`), `${name} is private but linked`);
  }
});

test("upstream record lists only public repositories outside the owner's", () => {
  for (const p of gh.upstream.prs) {
    assert.ok(!p.repo.toLowerCase().startsWith(`${projects.owner.toLowerCase()}/`), p.repo);
    assert.ok(html.includes(p.url), p.url);
  }
});

test("survey data is embedded as parseable JSON", () => {
  const m = html.match(/<script type="application\/json" id="survey-data">([\s\S]*?)<\/script>/);
  assert.ok(m, "survey script present");
  const data = JSON.parse(m[1]);
  assert.ok(data.days.length >= 300);
  for (const s of data.stakes) assert.ok(s.weekday >= 0 && s.weekday < 7 && s.week >= 0);
});

test("all seven sheets are present and in the index", () => {
  for (const id of ["cover", "notes", "details", "schedule", "asbuilt", "record", "offclock"]) {
    assert.match(html, new RegExp(`<section class="sheet[^"]*" id="${id}"`));
    assert.ok(html.includes(`href="#${id}"`), id);
  }
});
