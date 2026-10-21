// Pure helpers shared by fetch-data.mjs and build.mjs. No I/O here, so test/ can cover them.

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// Parses the public contribution calendar served at github.com/users/<login>/contributions.
// Each day is a <td data-date data-level id>; its count lives in a <tool-tip for="<id>">.
export function parseContributions(html) {
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*>[^<]*<\/tool-tip>/g)) {
    const tag = m[0];
    const id = attr(tag, "for");
    const text = tag.replace(/<[^>]+>/g, "").trim();
    const n = text.match(/^([\d,]+) contributions?/);
    if (id) counts.set(id, n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*data-date="[^"]*"[^>]*>/g)) {
    const tag = m[0];
    const date = attr(tag, "data-date");
    const id = attr(tag, "id");
    const level = Number(attr(tag, "data-level") ?? 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    days.push({ date, level, count: counts.get(id) ?? 0 });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

// An elevation profile for a weekly series: area under a polyline, baseline, emphasized endpoint.
export function profileSvg(values, { width = 132, height = 30, label = "" } = {}) {
  if (!Array.isArray(values) || values.length < 2) return "";
  const max = Math.max(...values);
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v) => (max === 0 ? height - pad : height - pad - (v / max) * (height - pad * 2));
  const pts = values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  const area = `M${pad},${height - pad} L${pts.join(" L")} L${width - pad},${height - pad} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    `<svg class="profile" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" ` +
    `aria-label="${esc(label || `${total} commits in 52 weeks`)}">` +
    `<path class="profile-area" d="${area}"/>` +
    `<line class="profile-base" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"/>` +
    `<polyline class="profile-line" points="${pts.join(" ")}"/>` +
    `<circle class="profile-end" cx="${last[0]}" cy="${last[1]}" r="2.2"/></svg>`
  );
}

export function shortDate(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

// Upstream PRs: drop the owner's own repos and orgs, keep the newest first.
export function selectUpstream(items, excludedOwners) {
  const skip = new Set(excludedOwners.map((o) => o.toLowerCase()));
  return items
    .map((it) => ({
      repo: it.repository_url.replace(/^.*\/repos\//, ""),
      title: it.title,
      url: it.html_url,
      mergedAt: it.pull_request?.merged_at || it.closed_at,
    }))
    .filter((pr) => !skip.has(pr.repo.split("/")[0].toLowerCase()))
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
}

// Survey stakes: projects started inside the calendar window, placed at (week, weekday) of that date.
export function surveyStakes(sheets, repos, firstDay, lastDay) {
  const start = Date.parse(firstDay);
  const end = Date.parse(lastDay);
  const stakes = [];
  for (const s of sheets) {
    const since = s.since || repos[s.repo]?.createdAt;
    if (!since) continue;
    const t = Date.parse(since.slice(0, 10));
    if (t < start || t > end) continue;
    const day = Math.round((t - start) / 864e5);
    stakes.push({ mark: s.mark, title: s.title, date: since.slice(0, 10), week: Math.floor(day / 7), weekday: day % 7 });
  }
  return stakes;
}
