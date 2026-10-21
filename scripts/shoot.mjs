// Screenshots dist/ in both themes at desktop and phone widths, and writes assets/og.png.
// Needs Chrome plus playwright-core; set PLAYWRIGHT_CORE to its path if it is not resolvable.
//   node scripts/shoot.mjs [outDir]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const ROOT = new URL("../", import.meta.url);
const DIST = new URL("dist/", ROOT);
const OUT = process.argv[2] || new URL("shots/", ROOT).pathname;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html").slice(1);
  try { res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }).end(await readFile(new URL(path, DIST))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
for (const [name, viewport, scheme, full] of [
  ["desktop-light", { width: 1400, height: 900 }, "light", true],
  ["desktop-dark", { width: 1400, height: 900 }, "dark", true],
  ["phone-light", { width: 390, height: 844 }, "light", true],
  ["phone-dark", { width: 390, height: 844 }, "dark", false],
]) {
  const page = await browser.newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`${name}: page scrolls sideways by ${overflow}px`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await page.close();
}

const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: "dark", deviceScaleFactor: 1 });
await og.goto(url, { waitUntil: "networkidle" });
await og.addStyleTag({ content: ".setbar{display:none}.set{padding-top:0}" });
await og.waitForTimeout(2600);
await og.screenshot({ path: new URL("assets/og.png", ROOT).pathname });

await browser.close();
server.close();
console.log(errors.length ? errors.join("\n") : "[shoot] no console errors, no sideways scroll");
