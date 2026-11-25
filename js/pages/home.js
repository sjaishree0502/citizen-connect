// pages/home.js — Home: banner, example proof card, live counts, track by ID, how it works,
// problem types, latest resolved fixes, first-visit tour.

import { h, icon } from "../helpers.js";
import { t, catName, prefs, setPref, ago } from "../i18n.js";
import { CATEGORIES } from "../data.js";
import { boot } from "../layout.js";
import * as store from "../store.js";
import { checkTrackId } from "../validate.js";
import { badge, pair } from "../ui.js";

let trackValue = "", trackErr = "", trackHit = null;

/** Banner with headline, actions and the example proof card. */
function hero() {
  const card = h("div", { class: "proof card" },
    h("span", { class: "sticker", text: t("Only you can close it") }),
    h("div", { class: "proof-head" }, h("b", { text: catName("pothole") }), badge("Fixed")),
    pair("img/street-before.svg", "img/street-after.svg"),
    h("p", { class: "proof-note" }, h("span", { class: "chip", text: t("EXAMPLE") }),
      h("span", { text: t("The person who reported it closes it with a new photo, or reopens it with a reason.") })));
  return h("section", { class: "hero" },
    h("img", { class: "hero-sky", src: "img/skyline-a.svg", alt: "", "aria-hidden": "true" }),
    h("div", { class: "wrap hero-in" },
      h("div", { class: "hero-copy" },
        h("span", { class: "pill", text: t("Pilot: Greater Chennai (15 zones) and Avadi") }),
        h("h1", { class: "hero-title" }, t("Report it. Fix it."), h("br"), h("span", { class: "accent", text: t("Prove it.") })),
        h("p", { class: "hero-sub" }, t("Raise a street problem in under a minute. When the Corporation fixes it, you check the proof and decide if it is really done.")),
        h("div", { class: "hero-actions" },
          h("a", { href: "raise.html", class: "btn btn-yellow btn-lg" }, icon("plus", 20), t("Raise a complaint")),
          h("a", { href: "my.html", class: "btn btn-outline-light btn-lg", text: t("Check my complaints") })),
        trackForm()),
      card));
}

/** "Already raised one? Track it by ID" with inline result. */
function trackForm() {
  const input = h("input", { id: "trk", type: "text", inputmode: "text", autocomplete: "off", maxlength: 9, placeholder: "CHN-001", value: trackValue, "aria-invalid": trackErr ? "true" : "false", "aria-describedby": trackErr ? "trk-err" : null });
  const form = h("form", { class: "track", novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    trackValue = input.value.trim().toUpperCase();
    const err = checkTrackId(trackValue);
    trackHit = null;
    if (err) trackErr = t(err);
    else {
      trackHit = store.get(trackValue);
      trackErr = trackHit ? "" : t("No complaint {id} on this phone", { id: trackValue });
    }
    redraw();
    document.getElementById("trk")?.focus();
  } },
    h("label", { for: "trk", class: "track-label", text: t("Already raised one? Track it by ID") }),
    h("div", { class: "track-row" }, input, h("button", { type: "submit", class: "btn btn-light", text: t("Track") })),
    trackErr ? h("p", { id: "trk-err", class: "track-err", role: "alert", text: trackErr }) : null,
    trackHit ? h("a", { class: "track-hit pop", href: `verify.html?id=${trackHit.id}` },
      h("span", {}, h("b", { text: `${trackHit.id} · ${catName(trackHit.cat)}` }), h("span", { class: "muted", text: ` ${trackHit.area} · ${ago(trackHit.createdAt)}` })),
      badge(trackHit.status), icon("arrow", 18)) : null);
  return form;
}

/** Five live status counts. */
function stats() {
  const c = store.counts();
  const card = (n, label, sub, cls, ico) => h("div", { class: "stat " + cls }, h("span", { class: "stat-ico" }, icon(ico, 20)), h("div", {}, h("p", { class: "stat-n", text: n }), h("p", { class: "stat-l", text: label }), h("p", { class: "stat-s", text: sub })));
  return h("section", { class: "wrap section", "aria-label": t("Complaint counts") },
    h("div", { class: "stats" },
      card(c.submitted, t("New"), t("need an officer"), "s-new", "plus"),
      card(c.inprogress, t("In progress"), t("being fixed"), "s-prog", "clock"),
      card(c.fixed, t("Awaiting check"), t("work done, citizen to check"), "s-fix", "search"),
      card(c.verified, t("Resolved"), t("closed by the citizen"), "s-ver", "check"),
      card(c.reopened, t("Reopened"), t("fix again"), "s-re", "reopen")));
}

/** Three steps. */
function how() {
  const step = (n, title, text) => h("li", { class: "how-step" }, h("span", { class: "how-n", text: n }), h("div", {}, h("h3", { text: title }), h("p", { text })));
  return h("section", { class: "wrap section" },
    h("h2", { class: "sec-title", text: t("How it works") }),
    h("ol", { class: "how" },
      step(1, t("You report"), t("the problem with a photo and the exact location.")),
      step(2, t("The officer follows up"), t("promises a fix date and posts updates until the work is done.")),
      step(3, t("You resolve it."), t("Only you can close it — with a new photo taken at the spot. Not fixed? Reopen it."))));
}

/** First 8 problem types + link to the rest. */
function types() {
  const tile = (c) => h("a", { href: `raise.html?cat=${c.key}`, class: "type" }, h("img", { src: `img/scenes/${c.scene}.svg`, alt: "", loading: "lazy", width: 240, height: 160 }), h("span", { text: t(c.en) }));
  return h("section", { class: "wrap section" },
    h("h2", { class: "sec-title", text: t("What can you report?") }),
    h("div", { class: "types" }, CATEGORIES.slice(0, 9).map(tile),
      h("a", { href: "raise.html?more=1", class: "type type-more" }, h("span", { class: "more-n", text: "+" + (CATEGORIES.length - 9) }), h("span", { text: t("more problem types") }))));
}

/** Latest resolved fixes from the store. */
function latest() {
  const done = store.all().filter((c) => c.status === "Verified" && c.afterPhoto).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
  if (!done.length) return null;
  return h("section", { class: "wrap section" },
    h("div", { class: "sec-row" }, h("h2", { class: "sec-title", text: t("Latest proof of fix") }), h("p", { class: "muted", text: t("Every fix here was confirmed by the person who reported it") })),
    h("div", { class: "fixes" }, done.map((c) => h("article", { class: "card fix" },
      pair(c.beforePhoto, c.afterPhoto),
      h("div", { class: "fix-body" }, h("p", { class: "fix-title" }, h("b", { text: `${c.id} · ${catName(c.cat)}` })), h("p", { class: "muted", text: c.area }), h("p", { class: "ok-line" }, icon("check", 16), t("Resolved by citizen")))))));
}

/** First-visit tour (3 short steps). */
function tour() {
  if (prefs().tour) return null;
  let i = 0;
  const steps = [
    [t("Raise it in a minute"), t("Pick the problem, add a photo and your location. That's it.")],
    [t("The officer follows up"), t("You see the promised fix date and every update.")],
    [t("You have the final say"), t("Only you can close it, with a new photo at the spot. Not fixed? Reopen it.")],
  ];
  const close = () => { setPref("tour", true); dlg.remove(); };
  const body = h("div", { class: "tour-body" });
  const dots = h("div", { class: "tour-dots", "aria-hidden": "true" });
  const next = h("button", { type: "button", class: "btn btn-primary" });
  const show = () => {
    body.replaceChildren(h("p", { class: "tour-step", text: t("Step {a} of {b}", { a: i + 1, b: 3 }) }), h("h2", { id: "tour-t", text: steps[i][0] }), h("p", { text: steps[i][1] }));
    dots.replaceChildren(...steps.map((_, k) => h("span", { class: k === i ? "on" : "" })));
    next.textContent = i < 2 ? t("Next") : t("Start");
  };
  next.addEventListener("click", () => { if (i < 2) { i++; show(); next.focus(); } else close(); });
  const dlg = h("div", { class: "tour", role: "dialog", "aria-modal": "true", "aria-labelledby": "tour-t" },
    h("div", { class: "tour-card pop" }, h("img", { src: "img/logo-96.png", alt: "", width: 56, height: 56, class: "tour-logo" }), body,
      h("div", { class: "tour-foot" }, dots, h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-quiet", text: t("Skip"), onclick: close }), next))));
  dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  show();
  setTimeout(() => next.focus(), 50);
  return dlg;
}

/** Draw the page. */
function render(main) {
  // latest() and tour() return null when there is nothing to show; replaceChildren would print "null".
  main.replaceChildren(...[hero(), stats(), how(), types(), latest(), tour()].filter(Boolean));
}

let redraw = () => {};
const draw = boot({ page: "home", render, title: () => t("Home") });
redraw = () => draw();
