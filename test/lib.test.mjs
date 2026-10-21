import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, parseContributions, profileSvg, selectUpstream, surveyStakes } from "../scripts/lib.mjs";

const calendar = `
<table><tbody><tr>
<td tabindex="0" data-ix="0" aria-selected="false" style="width: 10px" data-date="2025-10-20" id="contribution-day-component-1-0" data-level="2" role="gridcell" class="ContributionCalendar-day"></td>
<td data-level="0" id="contribution-day-component-0-1" data-date="2025-10-19" class="ContributionCalendar-day"></td>
<td data-date="2025-10-21" id="contribution-day-component-2-0" data-level="4" class="ContributionCalendar-day"></td>
</tr></tbody></table>
<tool-tip id="t1" for="contribution-day-component-1-0" popover="manual" class="sr-only">12 contributions on October 20th.</tool-tip>
<tool-tip id="t2" for="contribution-day-component-0-1" popover="manual" class="sr-only">No contributions on October 19th.</tool-tip>
<tool-tip id="t3" for="contribution-day-component-2-0" popover="manual" class="sr-only">1,204 contributions on October 21st.</tool-tip>`;

test("parseContributions reads days in date order regardless of attribute order", () => {
  assert.deepEqual(parseContributions(calendar), [
    { date: "2025-10-19", level: 0, count: 0 },
    { date: "2025-10-20", level: 2, count: 12 },
    { date: "2025-10-21", level: 4, count: 1204 },
  ]);
});

test("parseContributions returns nothing for a page without a calendar", () => {
  assert.deepEqual(parseContributions("<html><body>rate limited</body></html>"), []);
});

test("profileSvg draws a labelled profile and survives an all-zero series", () => {
  const svg = profileSvg([0, 2, 5, 1], { label: "X: 8 commits" });
  assert.match(svg, /aria-label="X: 8 commits"/);
  assert.match(svg, /<polyline class="profile-line" points="[^"]+"/);
  assert.doesNotMatch(profileSvg([0, 0, 0]), /NaN/);
  assert.equal(profileSvg([]), "");
});

test("esc neutralises markup and attribute quotes", () => {
  assert.equal(esc(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("selectUpstream drops the owner's own repos and sorts newest first", () => {
  const item = (repo, merged) => ({ repository_url: `https://api.github.com/repos/${repo}`, title: repo, html_url: "u", pull_request: { merged_at: merged } });
  const out = selectUpstream([item("openclaw/imsg", "2026-09-12"), item("coletebou/Badland", "2026-10-01"), item("Badland-AI/.github", "2026-10-02"), item("openclaw/clawpatch", "2026-10-03")], ["coletebou", "badland-ai"]);
  assert.deepEqual(out.map((p) => p.repo), ["openclaw/clawpatch", "openclaw/imsg"]);
});

test("surveyStakes places projects at their week and weekday inside the window only", () => {
  const sheets = [
    { mark: "P2", title: "Tallgrass", repo: "tallgrass" },
    { mark: "A1", title: "Agents", since: "2025-10-28" },
    { mark: "P1", title: "Old", repo: "old" },
  ];
  const repos = { tallgrass: { createdAt: "2025-11-05T12:00:00Z" }, old: { createdAt: "2024-01-01T00:00:00Z" } };
  assert.deepEqual(surveyStakes(sheets, repos, "2025-10-19", "2026-10-21"), [
    { mark: "P2", title: "Tallgrass", date: "2025-11-05", week: 2, weekday: 3 },
    { mark: "A1", title: "Agents", date: "2025-10-28", week: 1, weekday: 2 },
  ]);
});
