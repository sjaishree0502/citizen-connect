// pages/login.js — Officer login. The first officer on a device sets a PIN (stored only as a hash);
// after that the PIN is asked for. This guards a shared device, but it is not real staff security.

import { h, icon, toastNext } from "../helpers.js";
import { t } from "../i18n.js";
import { boot, isOfficer, setOfficer, hasOfficerPin, setOfficerPin, checkOfficerPin } from "../layout.js";
import { checkPin } from "../validate.js";
import { field } from "../ui.js";

if (isOfficer()) location.replace("officer.html");

const MAX_TRIES = 5, LOCK_MS = 30000;
let pin = "", pin2 = "", err = "", tries = 0, lockedUntil = 0, busy = false;
let redraw = () => {};

/** Sign in and go to the dashboard. */
function enter(message) {
  setOfficer(true);
  toastNext(message);
  location.href = "officer.html";
}

/** First use: choose a PIN and type it twice. */
async function create() {
  const fmt = checkPin(pin);
  if (fmt) err = t(fmt);
  else if (pin !== pin2) err = t("The two PINs do not match.");
  else if (!(await setOfficerPin(pin))) err = t("Could not save. Please try again.");
  else return enter(t("Officer PIN set · signed in"));
  redraw();
}

/** Later visits: check the PIN, pausing after too many wrong tries. */
async function signIn() {
  if (Date.now() < lockedUntil) { err = t("Too many wrong tries. Wait 30 seconds."); redraw(); return; }
  const fmt = checkPin(pin);
  if (fmt) err = t(fmt);
  else if (await checkOfficerPin(pin)) return enter(t("Signed in"));
  else if (++tries >= MAX_TRIES) { tries = 0; lockedUntil = Date.now() + LOCK_MS; err = t("Too many wrong tries. Wait 30 seconds."); }
  else err = t("Wrong PIN. Try again.");
  redraw();
}

async function submit(e) {
  e.preventDefault();
  if (busy) return;
  busy = true;
  try { await (hasOfficerPin() ? signIn() : create()); } finally { busy = false; }
  document.getElementById("pin")?.focus();
}

/** A 4-digit PIN box. */
function pinInput(id, value, onInput, auto) {
  const input = h("input", { id, type: "password", inputmode: "numeric", autocomplete: auto, maxlength: 4, pattern: "\\d{4}", value, "aria-invalid": err ? "true" : "false" });
  input.addEventListener("input", () => { const v = input.value.replace(/\D/g, "").slice(0, 4); input.value = v; onInput(v); });
  return input;
}

/** Draw the page. */
function render(main) {
  const setup = !hasOfficerPin();
  const first = pinInput("pin", pin, (v) => { pin = v; }, setup ? "new-password" : "current-password");
  main.replaceChildren(h("div", { class: "wrap page narrow" },
    h("form", { class: "card block login", novalidate: true, onsubmit: submit },
      h("span", { class: "login-ico" }, icon("shield", 28)),
      h("h1", { class: "page-title", text: setup ? t("Set up officer PIN") : t("Officer login") }),
      h("p", { class: "muted", text: setup ? t("No officer PIN is set on this device yet. Choose a 4-digit PIN for the ward team.") : t("For ward teams in Greater Chennai and Avadi.") }),
      field({ id: "pin", label: setup ? t("New 4-digit PIN") : t("4-digit PIN"), control: first, error: setup ? "" : err }),
      setup ? field({ id: "pin2", label: t("Type the PIN again"), control: pinInput("pin2", pin2, (v) => { pin2 = v; }, "new-password"), error: err }) : null,
      h("button", { type: "submit", class: "btn btn-primary btn-lg btn-block", text: setup ? t("Save PIN and sign in") : t("Sign in") }),
      h("p", { class: "fine", text: t("Forgot the PIN? “Erase data on this device” in the footer resets it. A real system would use the Corporation's staff login.") }))));
}

const draw = boot({ page: "login", render, title: () => t("Officer login") });
redraw = () => draw();
