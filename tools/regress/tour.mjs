/**
 * The introduction inside the world (round 20): a first-run tour over the demo town. The world takes a browser that says
 * navigator.webdriver for a tool's and never starts the tour in it by itself (so no other group or tool sees it); this
 * group's browsers say false, as a person's does, so the fresh-browser road is the real one.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { openPage, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { dressed, list } from "../lib/world.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, origin, base: BASE, problems } = pass;
  const { town } = page;
  const { ok } = check;
  const { tag, shot } = out;
  const person = async (options = {}) => {
    const pg = await openPage(browser, { origin, problems, tag: "tour", initScripts: [() => Object.defineProperty(navigator, "webdriver", { get: () => false })], ...options });
    return pg;
  };
  const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const inside = (box, width, height) => !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
  const count = (pg) => pg.locator(".tour-count").innerText().then((t) => t.trim()).catch(() => "");
  const focusIn = (pg) => pg.evaluate(() => (document.querySelector(".tour-card")?.contains(document.activeElement) === true ? (document.activeElement?.textContent?.trim() ?? "") : "outside")).catch(() => "no page");

  const pg = await person();
  await pg.goto(BASE);
  await dressed(pg, 60000).catch(() => {});
  const card = pg.locator(".tour-card");
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  ok("tour: a fresh browser sees step 1 of 6 over the town, as a dialog named by its title", (await card.count()) === 1 && (await count(pg)) === "Step 1 of 6" && (await card.getAttribute("role")) === "dialog" && (await pg.locator(".tour-title").innerText().catch(() => "")) === "The town" && (await pg.evaluate(() => { const d = document.querySelector(".tour-card"); return document.getElementById(d?.getAttribute("aria-labelledby") ?? "")?.textContent === "The town"; })), await count(pg));
  ok("tour: the focus moved into the card, on Next", (await focusIn(pg)) === "Next", await focusIn(pg));
  await pg.keyboard.press("Tab");
  const cycled = await focusIn(pg);
  await pg.keyboard.press("Shift+Tab");
  ok("tour: Tab cycles in the card (Next → Skip and back)", cycled === "Skip" && (await focusIn(pg)) === "Next", cycled);
  await shot(pg, "41-tour-step1");
  await pg.getByRole("button", { name: "Next" }).click();
  await pg.waitForTimeout(400);
  const ring = await pg.locator(".tour-spot").boundingBox().catch(() => null);
  const jump = await pg.locator(".jump-button").boundingBox().catch(() => null);
  const text2 = (await pg.locator(".tour-text").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("tour: step 2 rings the jump list button and names it to a screen reader", (await count(pg)) === "Step 2 of 6" && !!ring && !!jump && ring.x <= jump.x && ring.y <= jump.y && ring.x + ring.width >= jump.x + jump.width && ring.y + ring.height >= jump.y + jump.height && /Highlighted on the screen: Jump to a district, project or agent\./.test(text2), text2.slice(-80));
  const cardBox = await card.boundingBox();
  ok("tour: the card does not cover what it describes", !overlaps(cardBox, jump) && inside(cardBox, 1440, 900));
  await shot(pg, "42-tour-step2");
  await pg.getByRole("button", { name: "Back" }).click();
  await pg.waitForTimeout(200);
  ok("tour: Back returns to step 1", (await count(pg)) === "Step 1 of 6", await count(pg));
  await pg.getByRole("button", { name: "Skip" }).click();
  await pg.waitForTimeout(200);
  const flag = await pg.evaluate(() => localStorage.getItem("crewhub-world.tour")).catch(() => null);
  ok("tour: Skip closes it and the browser remembers", (await card.count()) === 0 && flag === "done", String(flag));
  await pg.reload();
  await dressed(pg, 60000).catch(() => {});
  await pg.waitForTimeout(2500);
  ok("tour: after Skip and a reload it does not come back", (await card.count()) === 0);
  // Settings reopens it; the sheet closes so the card stands over the town; Escape skips it and the focus goes back to Settings.
  await pg.getByRole("button", { name: "Settings", exact: true }).click();
  await pg.getByRole("button", { name: "Show the introduction" }).click();
  await card.waitFor({ timeout: 3000 }).catch(() => {});
  ok("tour: Settings › Show the introduction reopens it, Settings closed, the focus inside", (await card.count()) === 1 && (await pg.locator(".settings-sheet").count()) === 0 && (await focusIn(pg)) === "Next", await focusIn(pg));
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);
  const backOn = await pg.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName).catch(() => "");
  ok("tour: Escape skips it and the focus returns to the Settings button", (await card.count()) === 0 && backOn === "Settings", backOn);
  // The "?" menu: Show the introduction, and the link to the document.
  await pg.getByRole("button", { name: "Help" }).click();
  const items = (await pg.locator('[role="menu"] [role="menuitem"]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
  ok("tour: the ? menu offers the introduction and the document", items.some((t) => /^Show the introduction/.test(t)) && items.some((t) => /^Read the introduction/.test(t)), items.join(" | "));
  await pg.getByRole("menuitem", { name: /Show the introduction/ }).click();
  await card.waitFor({ timeout: 3000 }).catch(() => {});
  ok("tour: the ? menu reopens it", (await card.count()) === 1);
  // Walk finding w2-1 (round 65): a dialog opened over the tour holds the focus and takes Escape first; the card stays
  // and the focus returns to the dialog's opener. Escape once more then skips the tour.
  await pg.getByRole("button", { name: "Settings", exact: true }).click();
  await pg.locator(".settings-sheet").waitFor({ timeout: 3000 }).catch(() => {});
  const sheetOver = (await pg.locator(".settings-sheet").count()) === 1 && (await card.count()) === 1;
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);
  const afterOne = { sheet: await pg.locator(".settings-sheet").count(), card: await card.count(), on: await pg.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName).catch(() => "") };
  ok("tour (w2-1): Escape with Settings open over the tour closes Settings, the card stays and the focus is back on the Settings button", sheetOver && afterOne.sheet === 0 && afterOne.card === 1 && afterOne.on === "Settings", `sheet over the card ${sheetOver}; after Escape: sheet ${afterOne.sheet}, card ${afterOne.card}, focus ${afterOne.on}`);
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);
  ok("tour (w2-1): Escape once more skips the tour", (await card.count()) === 0);
  await pg.context().close();
  // A phone: the card spans the width at the far edge from what it describes, inside the screen, no horizontal scroll.
  const phone = await person({ width: 375, theme: "dark" });
  await phone.goto(BASE);
  await dressed(phone, 60000).catch(() => {});
  const phoneCard = phone.locator(".tour-card");
  await phoneCard.waitFor({ timeout: 10000 }).catch(() => {});
  const box1 = await phoneCard.boundingBox();
  ok("tour: on a phone step 1 fits the screen", inside(box1, 375, 812) && (await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)), box1 ? `${Math.round(box1.x)},${Math.round(box1.y)} ${Math.round(box1.width)}x${Math.round(box1.height)}` : "no card");
  await phone.getByRole("button", { name: "Next" }).click();
  await phone.waitForTimeout(400);
  const box2 = await phoneCard.boundingBox();
  const jump2 = await phone.locator(".jump-button").boundingBox().catch(() => null);
  ok("tour: on a phone step 2 does not cover the jump button", inside(box2, 375, 812) && !overlaps(box2, jump2), box2 && jump2 ? `card y ${Math.round(box2.y)}, button y ${Math.round(jump2.y)}` : "no boxes");
  await shot(phone, "43-tour-phone");
  await phone.getByRole("button", { name: "Skip" }).click();
  await phone.context().close();
}
