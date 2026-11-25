// End-to-end test of the whole complaint loop in headless Chrome:
// raise (Avadi) → officer PIN → start work (fix date) → follow-up update → work done → citizen reopens
// → overdue → work done → citizen resolves with a new photo → demo mode (sample complaints, demo officer,
// kept apart from the real data, reset) → erase. Also the logo intro and city menu.
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
/** Click something that opens another page, and wait for that page. */
const clickAway = async (label, sel = "button") => {
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.includes(l))?.click(), sel, label)]);
  await sleep(300);
};
/** Choose a city in the top-bar menu. */
const chooseCity = async (name) => {
  await page.click(".city-btn");
  await page.evaluate((n) => [...document.querySelectorAll(".city-opt")].find((e) => e.textContent.startsWith(n))?.click(), name);
  await sleep(400);
};
const cityShown = () => page.$eval(".city-btn", (e) => e.textContent.replace("▾", "").trim());
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
  const selected = await page.$$eval('.city-opt[aria-selected="true"]', (els) => els.map((e) => e.textContent));
  check((await cityShown()) === "Greater Chennai" && selected.length === 1 && selected[0].startsWith("Greater Chennai"), "one city is chosen: Greater Chennai by default");
  await page.evaluate(() => [...document.querySelectorAll(".city-opt")].find((e) => e.textContent.startsWith("Tambaram")).click());
  await sleep(300);
  check((await cityShown()) === "Greater Chennai" && (await has("Tambaram is coming next")), "a city that is not live cannot be chosen");
  await chooseCity("Avadi");
  check((await cityShown()) === "Avadi" && (await page.$$eval('.city-opt[aria-selected="true"]', (els) => els.length)) === 1, "choosing Avadi shows it in the top bar");
  await chooseCity("Greater Chennai");
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
  check((await has("This spot is in Avadi, so the city at the top is now Avadi.")) && (await cityShown()) === "Avadi", "an Avadi spot while Greater Chennai is chosen switches the city to Avadi, and says so");
  await type("#area", "Kamaraj Nagar, Avadi");
  await click("Submit complaint");
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  check(page.url().includes("my.html?new=CHN-001") && (await has("CHN-001")), "saved as CHN-001 and listed (in Avadi)");
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

  console.log("Demo mode: sample complaints, kept apart from the real ones");
  const realSaved = await page.evaluate(() => localStorage.getItem("cc.complaints.v2"));
  const statNums = () => page.$$eval(".stats .stat-n", (els) => els.map((e) => e.textContent).join(","));
  check(!(await has("Use a demo photo")), "demo buttons are hidden while demo mode is off");
  check(await has("Erase data on this device"), "footer offers to erase data while demo mode is off");
  await page.click(".tool-switch");
  await sleep(500);
  check((await has("Demo mode — showing sample complaints. Your own are safe")) && (await page.$eval(".tool-switch", (e) => e.getAttribute("aria-checked"))) === "true", "demo switch turns on at once and the banner says the user's data is safe");
  check((await statNums()) === "1,1,1,1,1" && (await has("CHN-103 · Pothole")) && !(await has("CHN-001")), "[Home · Avadi] counts and proof of fix come from the Avadi samples, not the real complaint");
  await chooseCity("Greater Chennai");
  check((await statNums()) === "1,3,1,3,1", "[Home · Chennai] switching city changes the counts: 1 new, 3 in progress, 1 work done, 3 resolved, 1 reopened");
  check((await has("Latest proof of fix")) && (await has("CHN-104 · Streetlight off")) && !(await has("CHN-103")), "[Home · Chennai] latest proof of fix shows Chennai samples only");
  await type("#trk", "CHN-105");
  await click("Track");
  check(await has("CHN-105 · Water pipe leak") && (await has("in Avadi")), "track by ID still finds an Avadi complaint and says where it is");
  check(await has("Reset demo data"), "footer offers 'Reset demo data' instead of erase");
  await go("my.html");
  check((await has("10 complaints in Greater Chennai raised from this browser · 1 need your check")) && (await has("All · 10")) && (await has("Open · 5")) && (await has("Closed · 4")), "[My complaints · Chennai] 10 samples across the tabs");
  check((await has("CHN-115")) && (await has("Overdue")) && (await has("Work done — check it")) && !(await has("CHN-001")) && !(await has("CHN-114")), "[My complaints · Chennai] samples shown (overdue, work done); Avadi and real complaints hidden");
  check((await page.$eval(".count", (e) => e.textContent).catch(() => "")) === "1", "nav badge counts the sample to check in this city");
  await chooseCity("Avadi");
  check((await has("All · 5")) && (await has("CHN-114")) && !(await has("CHN-115")), "[My complaints · Avadi] switching city shows the 5 Avadi samples");
  await go("verify.html?id=CHN-106");
  check((await has("Officer update")) && (await has("Road cut done and the new pipe laid")) && (await has("Fix promised by")) && (await has("LB Road, Adyar")), "[In progress] sample has officer updates and a moved fix date");
  await go("verify.html?id=CHN-101");
  check((await page.$(".cmp")) !== null && (await has("Fixed on time")) && (await has("Location matched")), "[Resolved] sample shows before/after, on time, location matched");
  await go("verify.html?id=CHN-102");
  check(await has("days late"), "[Resolved] another sample was fixed late");
  await go("verify.html?id=CHN-105");
  check((await has("Reopened · sent back to the officer")) && (await has("Avadi City Corporation")), "[Reopened] sample in Avadi with the citizen's reason");

  console.log("Demo officer (no PIN)");
  await go("officer.html");
  await clickAway("Sign out");
  await go("login.html");
  await clickAway("Sign in as demo officer");
  check(page.url().endsWith("officer.html") && (await page.evaluate(() => sessionStorage.getItem("cc.officer"))) === "demo", "demo officer signs in without a PIN");
  const ids = () => page.$$eval(".orow:not(.ohead) .o-id b", (els) => els.map((e) => e.textContent));
  const avadiIds = await ids();
  check(avadiIds[0] === "CHN-105" && avadiIds.length === 5 && !avadiIds.includes("CHN-001") && (await statNums()) === "1,1,1,1,1", "[Dashboard · Avadi] 5 Avadi samples, reopened first, no real complaint");
  await chooseCity("Greater Chennai");
  const chennaiIds = await ids();
  check(chennaiIds[0] === "CHN-107" && chennaiIds.length === 9 && !chennaiIds.includes("CHN-113") && !chennaiIds.includes("CHN-105"), "[Dashboard · Chennai] switching city: 9 Chennai samples, reopened first, withdrawn hidden");
  check((await statNums()) === "1,3,1,3,1" && (await has("Overdue")) && (await has("Officer mode")), "[Dashboard · Chennai] counts and the overdue flag");

  console.log("Raise and resolve a new complaint in demo mode");
  await go("raise.html");
  await page.click(".cat");
  await click("Use a demo photo");
  await sleep(600);
  await click("Use demo location (Avadi)");
  check((await cityShown()) === "Avadi", "the demo location (Avadi) switches the city from Greater Chennai to Avadi");
  await type("#area", "Demo street, Avadi");
  await click("Submit complaint");
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  check(page.url().includes("new=CHN-116") && (await has("CHN-116")), "complaint raised with a demo photo and location continues after the samples (CHN-116) and is listed in Avadi");
  await go("update.html?id=CHN-116");
  await click("Today");
  await click("Start work");
  await type("#onote", "Cleared during the demo");
  await click("Work done");
  await go("verify.html?id=CHN-116");
  await click("Use a demo photo");
  await sleep(600);
  check((await page.$(".cmp")) !== null, "demo photo passes the date check and shows next to the first photo");
  await click("Use demo location");
  await click("Mark resolved");
  await sleep(5500);
  check((await has("CHN-116 is closed with your photo")) && (await has("Demo mode: a sample photo or location was used.")), "resolved in demo mode, and labelled as demo");
  const demoPhotoKey = await page.evaluate(() => JSON.parse(localStorage.getItem("cc.demo.complaints.v1")).find((c) => c.id === "CHN-116").beforePhoto.slice(4));
  check(await page.evaluate(() => localStorage.getItem("cc.complaints.v2")) === realSaved, "real complaints unchanged by everything done in demo mode");

  console.log("Demo mode off: only the real data again");
  await go("officer.html");
  await clickAway("Demo mode", ".tool-switch");
  check(page.url().endsWith("login.html") && !(await has("Sign in as demo officer")) && (await has("4-digit PIN")), "the demo officer is signed out when demo mode is turned off; PIN login is back");
  check(!(await has("showing sample complaints")), "demo banner is gone");
  await go("my.html");
  check((await has("CHN-001")) && !/CHN-1\d\d/.test(await text()), "[My complaints · Avadi] only the real complaint");
  await chooseCity("Greater Chennai");
  check(await has("No complaints in Greater Chennai"), "[My complaints · Chennai] no real complaints there, and it says the others are in the other city");
  await chooseCity("Avadi");
  await go("index.html");
  check((await statNums()) === "0,0,0,1,0" && (await has("CHN-001")) && !/CHN-1\d\d/.test(await text()), "[Home] real counts and proof of fix only");
  await go("verify.html?id=CHN-001");
  check((await has("CHN-001 is closed with your photo")) && !(await has("Demo mode:")), "the real complaint is as it was");

  console.log("Reset demo data");
  await clickAway("Demo mode", ".tool-switch"); // from a real complaint's page: it is not in the samples, so go to the list
  check(page.url().endsWith("my.html") && (await has("CHN-116")), "turning demo on from a real complaint opens My complaints; demo changes were kept");
  const tapReset = () => page.$eval(".tool-danger", (b) => b.click());
  await tapReset();
  check(await has("Tap again to reset the demo data"), "first tap on reset asks again");
  await tapReset();
  await sleep(1500);
  await go("my.html");
  check((await has("All · 5")) && !(await has("CHN-116")), "reset puts back the 5 Avadi samples, without the new one");
  const photoKeys = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("citizen-connect"); r.onsuccess = () => { const q = r.result.transaction("photos").objectStore("photos").getAllKeys(); q.onsuccess = () => res(q.result); }; }));
  const realKeys = JSON.parse(realSaved).flatMap((c) => [c.beforePhoto, c.afterPhoto]).filter(Boolean).map((r) => r.slice(4));
  check(!photoKeys.includes(demoPhotoKey) && realKeys.every((k) => photoKeys.includes(k)), "reset deletes only demo photos; real photos are kept");
  check(await page.evaluate(() => localStorage.getItem("cc.complaints.v2")) === realSaved, "reset does not touch real complaints");
  await page.click(".tool-switch");
  await sleep(500);
  check(!(await has("showing sample complaints")) && (await has("CHN-001")), "demo mode turns off again");

  console.log("Erase data");
  const tapErase = () => page.$eval(".tool-danger", (b) => b.click()); // a toast may cover the footer
  await tapErase();
  check(await has("Tap again to erase everything"), "first tap on erase asks again on the button");
  await tapErase();
  await sleep(1500);
  await go("my.html");
  check(await has("You have not raised any complaints yet"), "complaints erased");
  check((await page.evaluate(() => localStorage.getItem("cc.officerPin.v1"))) === null, "officer PIN erased");
  check((await page.evaluate(() => localStorage.getItem("cc.demo.complaints.v1"))) === null, "the demo copy is erased too (fresh samples next time)");

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
