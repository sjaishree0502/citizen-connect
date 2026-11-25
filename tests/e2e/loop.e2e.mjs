// End-to-end test of the whole complaint loop in headless Chrome:
// raise → officer PIN → start work (fix date) → mark fixed (proof) → reopen → overdue → fix again → verify → erase.
// Run: npm install && npm run test:e2e   (set CHROME_PATH if Chrome is not in the default macOS place)

import { createServer } from "node:http";
import { readFile, copyFile, mkdtemp } from "node:fs/promises";
import { utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SPOT = { latitude: 13.1147, longitude: 80.101, accuracy: 15 }; // Avadi
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

let failed = 0;
const check = (ok, msg) => { console.log((ok ? "  ✔ " : "  ✖ ") + msg); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tiny static server for the app folder. */
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const BASE = `http://localhost:${server.address().port}/`;

// Test photos: copies of the app icon whose file time we control.
const dir = await mkdtemp(join(tmpdir(), "cc-e2e-"));
const photo = async (name, when) => { const p = join(dir, name); await copyFile(join(ROOT, "img/icons/icon-512.png"), p); utimesSync(p, when, when); return p; };
const before = await photo("before.png", new Date());
const old = await photo("old.png", new Date("2020-01-01"));
const freshPhoto = () => photo("after-" + Date.now() + ".png", new Date());

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
await browser.defaultBrowserContext().overridePermissions(BASE.slice(0, -1), ["geolocation"]);
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.setGeolocation(SPOT);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const go = async (path) => { await page.goto(BASE + path, { waitUntil: "networkidle0" }); await sleep(300); };
const text = () => page.evaluate(() => document.body.innerText);
const has = async (s) => (await text()).includes(s);
const click = async (label, sel = "button") => {
  const ok = await page.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(l)); el?.click(); return !!el; }, sel, label);
  if (!ok) throw new Error(`No ${sel} with "${label}"`);
  await sleep(400);
};
const upload = async (sel, file) => { await (await page.$(sel)).uploadFile(file); await sleep(800); };
const type = async (sel, value) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, value); };
const officerFix = async (note) => {
  await upload("#after", await freshPhoto());
  await click("Use my location");
  await sleep(600);
  await type("#onote", note);
  await click("Mark fixed");
  await sleep(500);
};

try {
  console.log("Fresh device");
  await go("index.html");
  await page.evaluate(() => document.querySelector(".tour .btn-quiet")?.click());
  check(!(await has("Latest proof of fix")) && !/CHN-\d/.test(await text()), "home shows no complaints");
  check((await page.$$eval(".stats .stat-n", (els) => els.map((e) => e.textContent))).every((n) => n === "0"), "home counts are all zero");
  await go("my.html");
  check(await has("You have not raised any complaints yet"), "My complaints shows the first-time empty state");

  console.log("Citizen raises a complaint");
  await go("raise.html");
  await page.click(".cat");
  await upload("#photo", before);
  await click("Use my location");
  await sleep(600);
  await type("#area", "Kamaraj Nagar, Avadi");
  await click("Submit complaint");
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  check(page.url().includes("my.html?new=CHN-001") && (await has("CHN-001")), "saved as CHN-001 and listed");
  check(await has("Waiting for an officer to start work"), "[Submitted] citizen is told what happens next");

  console.log("Officer signs in and starts work");
  await go("login.html");
  check(await has("Set up officer PIN"), "first visit asks to set a PIN");
  await type("#pin", "4821");
  await type("#pin2", "4821");
  await click("Save PIN and sign in");
  await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
  check(page.url().endsWith("officer.html") && (await has("CHN-001")), "dashboard lists CHN-001");
  const pin = await page.evaluate(() => localStorage.getItem("cc.officerPin.v1"));
  check(pin && !pin.includes("4821"), "PIN is stored only as a salted hash");
  await go("update.html?id=CHN-001");
  check(!!(await page.$('a[href*="google.com/maps/dir"]')), "officer gets directions to the spot");
  await click("Start work");
  check(await has("Choose the date the fix will be done by."), "Start work needs a fix date");
  await click("In 3 days");
  await click("Start work");
  check(await has("Fix promised by"), "Start work records the promised date");
  await go("verify.html?id=CHN-001");
  check(await has("Work has started"), "[In progress] citizen sees the promise");

  console.log("Officer marks it fixed");
  await go("update.html?id=CHN-001");
  await click("Mark fixed");
  check(await has("An after-photo is required"), "Mark fixed without a photo is blocked");
  await upload("#after", old);
  check(await has("taken before the complaint was raised"), "an old photo is refused");
  await officerFix("Drain cleared and cover replaced");
  check(await has("Waiting for the citizen to check"), "marked fixed with photo, GPS and note");

  console.log("Citizen reopens");
  await go("verify.html?id=CHN-001");
  check((await has("Is the problem really fixed?")) && (await has("Location matched")) && (await has("After-photo taken:")), "citizen sees the proof");
  await click("No, reopen it");
  await type("#reason", "Still overflowing near the gate");
  await click("Send back to officer");
  check(await has("Reopened · sent back to the officer"), "reopened with a reason");
  check(!(await has("Location matched")) && (await page.$$(".tl-photo")).length === 1, "old fix details cleared, old after-photo kept in the timeline");

  console.log("Officer misses the date, then fixes it again");
  await go("update.html?id=CHN-001");
  check(await has("Still overflowing near the gate"), "officer sees the reopen reason");
  await click("Today");
  await click("Start work");
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("cc.complaints.v2"));
    list[0].dueBy = new Date(Date.now() - 2 * 86400000).toISOString(); // pretend the date passed
    localStorage.setItem("cc.complaints.v2", JSON.stringify(list));
  });
  await go("officer.html");
  check(await has("Overdue"), "[Overdue] officer dashboard flags it");
  await go("verify.html?id=CHN-001");
  check(await has("The officer has missed the promised date"), "[Overdue] citizen is told");
  await go("update.html?id=CHN-001");
  await officerFix("Drain fully desilted this time");
  check(await has("Waiting for the citizen to check"), "second fix posted");

  console.log("Citizen closes it");
  await go("verify.html?id=CHN-001");
  check(await has("days late"), "citizen sees the fix was late");
  await click("Yes, it's fixed");
  await sleep(5500); // let the Undo window pass
  check(await has("CHN-001 is closed"), "verified and closed");
  await go("index.html");
  check(await has("Latest proof of fix"), "home shows the verified fix");

  console.log("Erase data");
  await click("Erase data on this device");
  await click("Erase data on this device");
  await sleep(1500);
  await go("my.html");
  check(await has("You have not raised any complaints yet"), "complaints erased");
  check((await page.evaluate(() => localStorage.getItem("cc.officerPin.v1"))) === null, "officer PIN erased");

  check(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
} catch (e) {
  failed++;
  console.error("  ✖ " + e.message);
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
