# coletebou.github.io

My GitHub Pages site, drawn as a set of engineering sheets: a cover with a contour survey of the
last year of contributions, system details, a schedule of work, an upstream as-built record, a
career profile, and a sheet for what I look at off the clock.

Live at <https://coletebou.github.io>.

## How it works

| Piece | What it does |
|-------|--------------|
| `data/projects.json` | Hand-edited. Every item on the schedule: mark, discipline, status, stack, summary, links. |
| `scripts/fetch-data.mjs` | Writes `data/github.json`: the public contribution calendar, per-repo activity, and merged PRs into other people's public repos. Any part that fails keeps its last value. |
| `scripts/build.mjs` | Renders `src/index.html` with the data into `dist/`. Everything a reader needs is static HTML. |
| `assets/site.js` | Progressive enhancement only: the contour survey (marching squares on canvas), filters, theme, copy. |
| `.github/workflows/pages.yml` | On every push and nightly: survey, build, test, deploy to Pages. |

Private repositories are never linked. Their rows show the live product where one exists, and
their activity profiles come from the committed `data/github.json` unless the optional
`PROFILE_TOKEN` secret (read-only, repo scope) is set.

## Commands

```sh
npm run data    # refresh data/github.json (uses GITHUB_TOKEN or `gh auth token`)
npm run build   # render dist/
npm test        # parser, renderer and output checks
npm run serve   # http://localhost:4173
node scripts/shoot.mjs   # screenshots + assets/og.png (needs Chrome and playwright-core)
```

## Editing

- **Add a project:** append to `sheets` in `data/projects.json`. Give it a `repo` to get live
  activity, a `link` for its live surface, or `since` (a date) to place a survey stake without a repo.
- **Change a drawing:** the static SVG details live in `src/index.html`; the generated ones
  (career profile, orbits, prairie, columns) are functions in `scripts/build.mjs`.
- **Theme:** every color is a token at the top of `assets/site.css`. Vellum is light, blueprint is dark.
