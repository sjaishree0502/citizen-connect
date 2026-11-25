// End-to-end test of the whole complaint loop in headless Chrome:
// raise (Avadi) → officer PIN → start work (fix date) → follow-up update → work done → citizen reopens
// → overdue → work done → citizen resolves with a new photo → erase. Also the logo intro and city menu.
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

try {
  console.log("Fresh device");
  await go("index.html");
  await page.evaluate(() => document.querySelector(".tour .btn-quiet")?.click());
  check(!(await has("Latest proof of fix")) && !/CHN-\d/.test(await text()), "home shows no complaints");
  check(!/\bnull\b|undefined/.test(await text()), "home shows no stray 'null' text (empty sections are skipped)");
  check((await page.$$eval(".stats .stat-n", (els) => els.map((e) => e.textContent))).every((n) => n === "0"), "home counts are all zero");
  check((await page.$(".brand-logo.intro")) !== null, "logo intro plays on the first page");
  const tiles = () => page.$$eval(".types .type:not(.type-more)", (els) => els.length);
  const shown = await tiles();
  await click("more problem types");
  check(page.url().endsWith("index.html") && shown === 9 && (await tiles()) === 14, "'+5 more problem types' shows all 14 here on Home");
  await click("Show fewer problem types");
  check((await tiles()) === 9, "'Show fewer' hides them again");
  await click("தமிழ்");
  check((await page.$(".brand-logo.intro")) === null, "logo intro does not replay after switching language");
  await click("EN");
  await page.click(".city-btn");
  const cities = await page.$$eval(".city-opt", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  check(cities.includes("Avadi Live") && cities.includes("Greater Chennai Live") && cities.includes("Tambaram Coming next"), "city menu: Chennai and Avadi live, Tambaram next");
  await go("my.html");
  check((await page.$(".brand-logo.intro")) === null, "logo intro does not replay on the next page");
  check(await has("You have not raised any complaints yet"), "My complaints shows the first-time empty state");

  console.log("Citizen raises a complaint in Avadi");
  await go("raise.html");
  await page.click(".cat");
  await upload("#photo", before);
  await click("Use my location");
  await sleep(600);
  check(await has("Avadi City Corporation"), "an Avadi pin is labelled Avadi City Corporation");
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

  console.log("Officer follows up (no photos)");
  check((await page.$('input[type="file"]')) === null, "officer page has no photo upload");
  await click("Post update");
  check(await has("Write what was done (at least 5 characters)."), "an update needs a note");
  await type("#onote", "Material ordered, crew visits Friday");
  await click("In 1 week");
  await click("Post update");
  check((await has("Officer update")) && (await has("Material ordered, crew visits Friday")), "update appears in the timeline");
  await go("verify.html?id=CHN-001");
  check((await has("Material ordered, crew visits Friday")) && (await has("The officer is working on it")), "[In progress] citizen sees the update and the promise");
  await go("update.html?id=CHN-001");
  await type("#onote", "Drain cleared and cover replaced");
  await click("Work done");
  check(await has("They will check it at the spot and resolve it with a new photo"), "officer marks work done and waits for the citizen");
  check(!(await has("Mark resolved")), "officer cannot resolve the complaint");

  console.log("Citizen checks and reopens");
  await go("my.html");
  check((await page.$eval(".count", (e) => e.textContent).catch(() => "")) === "1", "nav badge shows 1 complaint to check");
  await go("verify.html?id=CHN-001");
  check((await has("The officer says the work is done")) && (await has("Drain cleared and cover replaced")), "citizen sees the officer's work-done note");
  await click("Not fixed — reopen");
  await type("#reason", "Still overflowing near the gate");
  await click("Send back to officer");
  check(await has("Reopened · sent back to the officer"), "reopened with a reason");
  check(!(await has("Officer’s note:")), "the old work-done note is cleared");

  console.log("Officer misses the date, then finishes");
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
  const earlyPhoto = await freshPhoto(); // taken before the officer says "work done"
  await sleep(1100);
  await go("update.html?id=CHN-001");
  await type("#onote", "Drain fully desilted this time");
  await click("Work done");

  console.log("Citizen resolves it with a new photo");
  await go("verify.html?id=CHN-001");
  check(await has("days late"), "citizen sees the work was done late");
  await click("Mark resolved");
  check(await has("Take a new photo at the spot"), "Mark resolved without a photo is blocked");
  await upload("#after", old);
  check(await has("taken before the officer finished the work"), "an old photo is refused");
  await upload("#after", earlyPhoto);
  check(await has("taken before the officer finished the work"), "a photo from before 'work done' is refused");
  await upload("#after", await freshPhoto());
  check((await page.$(".cmp")) !== null, "the new photo is shown next to the first photo");
  await click("Use my location");
  await sleep(600);
  check(await has("m from your first pin"), "distance from the first pin is shown");
  await click("Mark resolved");
  await sleep(5500); // let the Undo window pass
  check((await has("Resolved")) && (await has("CHN-001 is closed with your photo")), "citizen resolved and closed it");
  check(await has("Resolution photo taken:"), "the resolution photo time is recorded");
  await go("officer.html");
  await click("Resolved");
  check(await has("CHN-001"), "[Resolved] officer sees it closed");
  await go("index.html");
  check(await has("Latest proof of fix"), "home shows the resolved fix");

  console.log("Demo mode (presenting without a camera or GPS)");
  check(!(await has("Use a demo photo")), "demo buttons are hidden while demo mode is off");
  await page.click(".tool-switch");
  await sleep(500);
  check((await has("Demo mode is on")) && (await page.$eval(".tool-switch", (e) => e.getAttribute("aria-checked"))) === "true", "demo switch turns on at once and the banner shows");
  await go("raise.html");
  await page.click(".cat");
  await click("Use a demo photo");
  await sleep(600);
  await click("Use demo location (Avadi)");
  await type("#area", "Demo street, Avadi");
  await click("Submit complaint");
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  check(await has("CHN-002"), "complaint raised with a demo photo and location");
  await go("update.html?id=CHN-002");
  await click("Today");
  await click("Start work");
  await type("#onote", "Cleared during the demo");
  await click("Work done");
  await go("verify.html?id=CHN-002");
  await click("Use a demo photo");
  await sleep(600);
  check((await page.$(".cmp")) !== null, "demo photo passes the date check and shows next to the first photo");
  await click("Use demo location");
  await click("Mark resolved");
  await sleep(5500);
  check((await has("CHN-002 is closed with your photo")) && (await has("Demo mode: a sample photo or location was used.")), "resolved in demo mode, and labelled as demo");
  await page.click(".tool-switch");
  await sleep(500);
  check(!(await has("Demo mode is on")), "demo mode turns off again");

  console.log("Erase data");
  const tapErase = () => page.$eval(".tool-danger", (b) => b.click()); // a toast may cover the footer
  await tapErase();
  check(await has("Tap again to erase everything"), "first tap on erase asks again on the button");
  await tapErase();
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
