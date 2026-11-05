/**
 * The chat over the key (round 12), the no-chat road (round 19) and road 2 (round 28), each over a fake and a host started
 * here: the bubbles, the marks, the text view's lines, the Recent answers list, and every fetch the page makes to the fake.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import path from "node:path";
import { drawn, level, openPage, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { speed } from "../lib/world.mjs";
import { startRig } from "../lib/rig.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, opts, origin, dist: DIST, problems, noteLoops, road2Routes: ROAD2_ROUTES } = pass;
  const { open, town, canvas } = page;
  const { ok, info } = check;
  const { tag, shot } = out;
  // 17. The chat over the key (round 12; the one road since round 19, the sign-in road gone with the switch to the viewer
  // key): over a fake whose viewer key reads the chat (the key road), then over a fake whose key does not (no bubbles,
  // the plain words). The host serves the built world on a free port (or listens on --host-port behind your Vite, as the
  // live and ops groups do).
  // Each road has its rig (lib/rig.mjs): a fake, the host over it (serving the built world when it is there, else
  // behind your Vite), pairing off, the host's lines kept.
  const hostPort = Number(opts["host-port"]);
  const serve = { dist: DIST, origin, hostPort };
  // The key road: a loops whose viewer key may read the chat (world/viewer-key, 8292): no sign-in at all.
  const rig2 = await startRig({ loops: { fake: { heartbeatMs: 1000, speed: 1, startAt: 200_000, keyReadsChat: true } }, web: true, serve, pairing: "off", onLoops: noteLoops });
  const { fake: fake2, web: web2, host: host2, lines: lines2 } = rig2;
  const keyOrigin = rig2.origin;
  info(`chat (key road): fake on 127.0.0.1:${fake2.port} whose key reads the chat, host on 127.0.0.1:${host2.port}`);
  const own2 = [];
  const pg2 = await openPage(browser, { origin: keyOrigin, problems: own2, tag: "chat key" });
  const ctx2 = pg2.context();
  try {
    await pg2.goto(`${keyOrigin}/`);
    await pg2.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg2.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    const health2 = await pg2.request.get(`${keyOrigin}/world-api/health`).then((r) => r.json());
    await pg2.locator(".connection-chip").first().click();
    await pg2.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    const words = (await pg2.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("chat (key road): health says session key, the panel's Chat section says a sign-in is not needed for the bubbles and shows no sign-in form, the host's log says the key reads the chat", health2.connection?.session?.state === "key" && /A sign-in is not needed for the bubbles: this crewhub-loops lets the world's key read the chat/.test(words) && (await pg2.getByLabel("Password").count()) === 0 && lines2.some((l) => /the key reads the chat on this crewhub-loops/.test(l)), `${health2.connection?.session?.state}; ${words.slice(0, 100)}`);
    await shot(pg2, "57-chat-key-not-needed");
    await pg2.keyboard.press("Escape");
    // Round 17: the glance on the key road says the bubbles need no sign-in, in one clause.
    await pg2.locator(".chat-open").click();
    await pg2.waitForSelector(".chat-sheet-lead", { timeout: 5000 }).catch(() => {});
    const glanceKey = await pg2.locator(".chat-sheet-lead").evaluate((el) => ({ what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null })).catch(() => null);
    ok("chat (key road, round 17): the panel's glance says sign in below to type and that the answers come as bubbles without it, About this chat closed", glanceKey !== null && glanceKey.what === "crewhub-loops' own chat, framed here." && glanceKey.todo === "Sign in to crewhub-loops below to type; the answers come as bubbles without it." && glanceKey.aboutOpen === false, glanceKey ? `"${glanceKey.todo}"` : "no lead");
    await shot(pg2, "57b-chat-key-glance");
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    const bubble2 = pg2.locator('.bubble.said[data-said-agent="g-man"]');
    await bubble2.waitFor({ timeout: 90000 }).catch(() => {});
    const said2 = (await bubble2.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    ok("chat (key road): an agent's answer comes over the key's own stream and shows as a bubble, with no session anywhere", /Busy and calm/.test(said2) && fake2.sessionsOpen() === 0, said2.slice(0, 100) || `no bubble; host: ${lines2.slice(-4).join(" | ").slice(0, 200)}`);
    await shot(pg2, "58-chat-key-bubble");
    // Walk finding w3-2 (round 65): at the town the figure's name pill is not drawn, so the bubble carries the speaker's
    // name above its line; the title and the accessible name say it as before.
    const name2 = (await bubble2.locator(".bubble-name").innerText().catch(() => "")).trim();
    const pill2 = await pg2.locator('.agent-stack:has(.bubble.said[data-said-agent="g-man"]) .name-pill').count();
    const nameAbove2 = await bubble2.evaluate((el) => { const n = el.querySelector(".bubble-name"); const t = el.querySelector(".bubble-text"); return !!n && !!t && n.getBoundingClientRect().bottom <= t.getBoundingClientRect().top + 1; }).catch(() => false);
    ok("chat (w3-2): at the town, with no name pill drawn, the bubble carries the speaker's name above its line", name2 === "G-Man" && pill2 === 0 && nameAbove2 && /^G-Man says: /.test((await bubble2.getAttribute("aria-label").catch(() => "")) ?? ""), `name "${name2}", pills ${pill2}, name above the line ${nameAbove2}`);
    await bubble2.click().catch(() => {});
    await pg2.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const agent2 = await pg2.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    ok("chat (key road): a tap on the bubble opens the Chat panel on that agent", agent2 !== null && /g-man/.test(agent2), `data-agent ${agent2}`);
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // Round 14: an agent inside a building answers (the fake's sendDm: the person writes to cr-lead, in the lead's office
    // of CrewHub World, and its scripted reply comes 8 s later). From the town the figure inside is not drawn, so a chat
    // mark stands over the building (in one row with the pin when the building has one), the text view carries the
    // line with its place and an "answered" chip beside the building, and the mark enters the building, where the
    // bubble wraps to at most three lines, keeps clear of the name label, and has an accessible name that joins the
    // sentences without a double full stop. The mark goes when the bubble does.
    const noOverlap = (a, b) => !a || !b || a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    const bubbleFacts = (locator) =>
      locator
        .evaluate((el) => {
          const text = el.querySelector(".bubble-text");
          const cs = getComputedStyle(el);
          const ts = getComputedStyle(text);
          const label = el.parentElement?.querySelector(".name-pill, .agent-plate") ?? null;
          const r = el.getBoundingClientRect();
          const l = label?.getBoundingClientRect() ?? null;
          const lineHeight = parseFloat(ts.lineHeight) || parseFloat(ts.fontSize) * 1.2;
          return {
            aria: el.getAttribute("aria-label"),
            title: el.getAttribute("title"),
            whiteSpace: cs.whiteSpace,
            clamp: ts.webkitLineClamp,
            lines: Math.round(text.getBoundingClientRect().height / lineHeight),
            clipped: text.scrollHeight > text.clientHeight + 1,
            bubble: { x: r.left, y: r.top, width: r.width, height: r.height, bottom: r.bottom },
            label: l && { x: l.left, y: l.top, width: l.width, height: l.height, top: l.top, text: label.textContent },
            viewport: innerWidth,
          };
        })
        .catch(() => null);
    const answered = async (p, label) => {
      fake2.sendDm("cr-lead", `Is the reading nook done? (${label})`);
      const mark = p.locator('.chat-mark[data-said-mark="cr-lead"]');
      await mark.waitFor({ timeout: 30000 }).catch(() => {});
      return mark;
    };
    const mark = await answered(pg2, "desk");
    const markName = await mark.getAttribute("aria-label").catch(() => null);
    const markBox = await mark.boundingBox().catch(() => null);
    const pinBox = await pg2.locator('.need-anchor[data-anchor="n:crewhub"] .need-pin').boundingBox().catch(() => null);
    const figureInside = await pg2.locator('.bubble.said[data-said-agent="cr-lead"]').count();
    ok("chat (key road, round 14): an agent inside a building answered: from the town a chat mark stands over that building, named for a screen reader, not on the pin when both", markName === "CR Lead answered: open CrewHub World" && markBox !== null && figureInside === 0 && noOverlap(markBox, pinBox), `${markName}; mark ${markBox ? "shown" : "missing"}; pin ${pinBox ? "beside it" : "none"}; bubbles inside drawn from the town: ${figureInside}; host: ${lines2.slice(-2).join(" | ").slice(0, 160)}`);
    await shot(pg2, "59-chat-mark-town");
    await pg2.keyboard.press("t");
    await pg2.waitForSelector("#text-view", { timeout: 5000 }).catch(() => {});
    const tv = (await sheet(pg2).innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg2, "60-chat-text-view");
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector("#text-view", { state: "detached", timeout: 5000 }).catch(() => {});
    const saysLine = tv.match(/CR Lead says: .*?\(in the [^)]*\)/)?.[0] ?? null;
    ok("chat (key road, round 14): the text view carries the agent's line with its place in the Town section and an 'answered' chip beside the building, from the same source as the bubble", saysLine !== null && /^CR Lead says: \(demo reply\) .*\(in the lead's office of CrewHub World\)$/.test(saysLine) && /CR Lead answered/.test(tv) && /Chat: crewhub-loops' own chat.*A sign-in is not needed for the bubbles/.test(tv), saysLine ?? tv.slice(0, 200));
    await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').click().catch(() => {});
    await pg2.waitForFunction(() => /CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const bubble3 = pg2.locator('.bubble.said[data-said-agent="cr-lead"]');
    await bubble3.waitFor({ timeout: 5000 }).catch(() => {});
    const facts = await bubbleFacts(bubble3);
    await shot(pg2, "61-chat-bubble-wrapped");
    ok("chat (key road, round 14): the mark enters the building; the bubble there wraps to two or three lines (clamped at three, nothing cut off) and stands clear above the name label", (await level(pg2)) === "CrewHub World" && facts !== null && facts.whiteSpace === "normal" && facts.clamp === "3" && facts.lines >= 2 && facts.lines <= 3 && !facts.clipped && facts.label !== null && noOverlap(facts.bubble, facts.label) && facts.bubble.bottom <= facts.label.top, facts ? `${facts.lines} line(s), clamp ${facts.clamp}, clipped ${facts.clipped}, bubble bottom ${Math.round(facts.bubble.bottom)} vs label top ${facts.label ? Math.round(facts.label.top) : "none"}` : `no bubble inside; level ${await level(pg2)}`);
    ok("chat (w3-2): inside, with the name pill drawn under the bubble, the bubble carries no name of its own", facts !== null && facts.label !== null && /CR Lead/.test(facts.label.text ?? "") && (await bubble3.locator(".bubble-name").count()) === 0, facts?.label ? `pill "${(facts.label.text ?? "").trim().slice(0, 30)}", names on the bubble ${await bubble3.locator(".bubble-name").count()}` : "no pill under the bubble");
    ok("chat (key road, round 14): the bubble's accessible name joins the line and the action without a double full stop", facts !== null && /^CR Lead says: \(demo reply\) .*\. Open CR Lead$/.test(facts.aria ?? "") && !/\.\./.test(facts.aria ?? "") && facts.title === (facts.aria ?? "").replace(/ Open CR Lead$/, ""), facts?.aria ?? "no bubble");
    await pg2.keyboard.press("Escape");
    await pg2.waitForFunction(() => !/CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const markBack = (await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').count()) === 1;
    await pg2.waitForSelector('.chat-mark[data-said-mark="cr-lead"]', { state: "detached", timeout: 20000 }).catch(() => {});
    const markGone = (await pg2.locator('.chat-mark[data-said-mark="cr-lead"]').count()) === 0;
    const bubbleGone = (await pg2.locator('.bubble.said[data-said-agent="cr-lead"]').count()) === 0;
    ok("chat (key road, round 14): back in the town the mark stands while the bubble lives and goes when it expires", markBack && markGone && bubbleGone, `mark on return ${markBack}, gone ${markGone}, bubble gone ${bubbleGone}`);
    // Round 16: the text view's Recent answers section lists both answers newest first (cr-lead's, then g-man's) with
    // their times, after both bubbles went; its row opens the Chat panel on that agent.
    await pg2.keyboard.press("t");
    await pg2.waitForSelector("#text-view .text-recent", { timeout: 5000 }).catch(() => {});
    const recentSection = (await pg2.locator("#text-view .text-recent").innerText().catch(() => "")).replace(/\s+/g, " ");
    const recentAgents = await pg2.locator("#text-view .text-recent .recent-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-answer-agent"))).catch(() => []);
    await shot(pg2, "66-chat-recent-text-view");
    await pg2.locator("#text-view .text-recent .recent-row").first().click().catch(() => {});
    await pg2.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const fromText = await pg2.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    ok("chat (key road, round 16): the text view's Recent answers section lists both answers, newest first, with their times, and its first row opens the Chat panel on cr-lead", /^Recent answers \(2\)/.test(recentSection) && recentAgents.length === 2 && recentAgents[0] === "cr-lead" && recentAgents[1] === "g-man" && /\d\d:\d\d:\d\d CR Lead \(demo reply\)/.test(recentSection) && /\d\d:\d\d:\d\d [^ ]+ Busy and calm/.test(recentSection) && fromText === "cr-lead", `${recentAgents.join(", ")}; ${recentSection.slice(0, 160)}; opened ${fromText}`);
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    await pg2.keyboard.press("Escape");
    await pg2.waitForSelector("#text-view", { state: "detached", timeout: 5000 }).catch(() => {});
    // Round 24: the thread's own facts reach the card over the key road: the host read the threads again after the
    // dm.* events and sent them to the tab, so G-Man's card says when its last message was written and that one is
    // unread (its answer, which the person never read). Last here: the jump moves the camera to the town hall, which
    // the mark checks above must not see.
    await canvas(pg2).focus();
    await pg2.keyboard.press("/");
    await pg2.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg2.keyboard.type("G-Man");
    await pg2.waitForTimeout(400);
    await pg2.keyboard.press("Enter");
    await pg2.waitForTimeout(1500);
    await canvas(pg2).focus();
    await pg2.keyboard.press("Enter");
    await pg2.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    await pg2.waitForFunction(() => /Chat\s*last message/.test(document.querySelector(".agent-card")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const gmanCard = (await pg2.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("chat (key road, rounds 24 and 25): G-Man's card says the thread's own facts from the host (last message just now, 1 unread in the key maker's view) above its answer", /Chat\s*last message (just now|\d+ min ago), 1 unread in the key maker's view/.test(gmanCard) && /Busy and calm/.test(gmanCard), gmanCard.replace(/^.*?ANSWERS/, "ANSWERS").slice(0, 240));
    await shot(pg2, "58b-chat-key-card-thread");
    for (let i = 0; i < 3; i++) {
      await pg2.keyboard.press("Escape");
      await pg2.waitForTimeout(300);
    }
    // A phone, dark: the same answer; the bubble fits the width and stays clear of the label there too.
    const ph2 = await openPage(browser, { origin: keyOrigin, width: 375, theme: "dark", problems: own2, tag: "chat key phone" });
    const phoneCtx = ph2.context();
    try {
      await ph2.goto(`${keyOrigin}/`);
      await ph2.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
      await ph2.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
      const phoneMark = await answered(ph2, "phone");
      await shot(ph2, "62-chat-mark-phone-dark");
      await phoneMark.click().catch(() => {});
      await ph2.waitForFunction(() => /CrewHub World/.test(document.querySelector("nav.world-breadcrumb .crumb-current")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
      const phoneBubble = ph2.locator('.bubble.said[data-said-agent="cr-lead"]');
      await phoneBubble.waitFor({ timeout: 5000 }).catch(() => {});
      const phoneFacts = await bubbleFacts(phoneBubble);
      await shot(ph2, "63-chat-bubble-phone-dark");
      ok("chat (key road, round 14): on a phone in the dark theme the mark enters the building and the bubble fits the width, wraps within three lines and stays clear of the name label", phoneFacts !== null && phoneFacts.bubble.x >= 0 && phoneFacts.bubble.x + phoneFacts.bubble.width <= phoneFacts.viewport && phoneFacts.lines <= 3 && !phoneFacts.clipped && noOverlap(phoneFacts.bubble, phoneFacts.label), phoneFacts ? `${phoneFacts.lines} line(s), x ${Math.round(phoneFacts.bubble.x)} to ${Math.round(phoneFacts.bubble.x + phoneFacts.bubble.width)} of ${phoneFacts.viewport}, label ${phoneFacts.label ? "clear" : "none"}` : `no bubble on the phone; level ${await level(ph2)}`);
      // Round 16: the Chat panel on the phone (the whole screen) lists the answer; the row fits the width.
      await ph2.keyboard.press("Escape");
      await ph2.waitForTimeout(300);
      await ph2.locator(".chat-open").click().catch(() => {});
      await ph2.waitForSelector(".chat-recent .recent-row", { timeout: 5000 }).catch(() => {});
      const phoneRow = await ph2.locator(".chat-recent .recent-row").first().boundingBox().catch(() => null);
      const phoneRows = await ph2.locator(".chat-recent .recent-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-answer-agent"))).catch(() => []);
      await shot(ph2, "67-chat-recent-phone-dark");
      ok("chat (key road, round 16): on the phone the Chat panel's Recent answers block lists cr-lead's answer in a row that fits the width", phoneRows.length === 1 && phoneRows[0] === "cr-lead" && phoneRow !== null && phoneRow.x >= 0 && phoneRow.x + phoneRow.width <= 375, `${phoneRows.join(", ")}; row ${phoneRow ? `${Math.round(phoneRow.x)} to ${Math.round(phoneRow.x + phoneRow.width)}` : "none"}`);
    } finally {
      await phoneCtx.close().catch(() => {});
    }
    problems.push(...own2.filter((x) => !(x.kind === "external" && (x.url ?? "").startsWith(`${web2.url}/`))));
  } finally {
    await ctx2.close().catch(() => {});
    await rig2.close();
  }

  // No chat road (round 19): a loops that does not let the key read the chat (a plain external bot's key, an older
  // loops, 8291 today): health has no session, the Connection panel's Chat section, the Chat panel's glance and About
  // this chat, Recent answers' empty state and the text view's Chat line all say so and point to a viewer key; the
  // sign-in road is gone (a write to /world-api/session is refused by the write gate, 405; a read is 404); an agent's
  // answer on loops shows no mark and no bubble.
  const rig3 = await startRig({ loops: { fake: { heartbeatMs: 1000, speed: 1, startAt: 200_000 } }, web: true, serve, pairing: "off", onLoops: noteLoops });
  const { fake: fake3, web: web3, host: host3, lines: lines3 } = rig3;
  const noneOrigin = rig3.origin;
  info(`chat (no chat road): fake on 127.0.0.1:${fake3.port} whose key does not read the chat, host on 127.0.0.1:${host3.port}`);
  const own3 = [];
  const pg3 = await openPage(browser, { origin: noneOrigin, problems: own3, tag: "chat none" });
  const ctx3 = pg3.context();
  try {
    await pg3.goto(`${noneOrigin}/`);
    await pg3.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg3.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    // Round 28: the page's probe asks the loops web origin the host names (the stub: no CORS header), so the verdict is
    // "the origin is not set"; the words of every place are that verdict's, with this page's origin as the value to set.
    await pg3.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "origin-not-set", null, { timeout: 10000 }).catch(() => {});
    const health3 = await pg3.request.get(`${noneOrigin}/world-api/health`).then((r) => r.json());
    const goneWrite = await pg3.request.post(`${noneOrigin}/world-api/session`, { headers: { origin: noneOrigin, "content-type": "application/json" }, data: { id: "nicky", password: "x" } }).then((r) => r.status()).catch(() => -1);
    const goneRead = await pg3.request.get(`${noneOrigin}/world-api/session`).then((r) => r.status()).catch(() => -1);
    await pg3.locator(".connection-chip").first().click();
    await pg3.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    const words3 = (await pg3.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road3 = await pg3.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    const probe3 = await pg3.locator(".connection-chat").getAttribute("data-probe").catch(() => null);
    await shot(pg3, "68-chat-none-panel");
    ok("chat (no chat road, round 19; round 28's words): health has no session, /world-api/session is gone (a write refused 405, a read 404), the panel's Chat section says this crewhub-loops does not let the world's key read the chat and nor this page (the probe's verdict over the fake: the world's origin is not set there), and points first to the setting with this page's exact origin, then to a viewer key, with no sign-in form; the host's log says the same", health3.connection?.session === undefined && goneWrite === 405 && goneRead === 404 && road3 === "none" && /^No bubbles: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there\. For the agents' answers as bubbles, set CHL_WORLD_ORIGIN=http:\/\/127\.0\.0\.1:\d+ on that crewhub-loops and restart it, or make a viewer key in Settings > Agents > Connect CrewHub World \(it reads only the chat of the person who makes it\) and paste it in the world's Connect screen\./.test(words3.replace(/^Chat /, "")) && probe3 === "origin-not-set" && (await pg3.getByLabel("Password").count()) === 0 && (await pg3.getByRole("button", { name: /Sign in|Forget the session/ }).count()) === 0 && lines3.some((l) => /the key does not read the chat on this crewhub-loops \(no viewer key\): no bubbles over the key; make a viewer key .*, or set CHL_WORLD_ORIGIN/.test(l)), `session ${JSON.stringify(health3.connection?.session)}; /session write ${goneWrite}, read ${goneRead}; data-road ${road3}, data-probe ${probe3}; ${words3.slice(0, 120)}`);
    await pg3.keyboard.press("Escape");
    await pg3.waitForTimeout(200);
    await pg3.locator(".chat-open").click();
    await pg3.waitForSelector(".chat-sheet-lead", { timeout: 5000 }).catch(() => {});
    const glance3 = await pg3.locator(".chat-sheet-lead").evaluate((el) => ({ what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null })).catch(() => null);
    await pg3.locator(".chat-about > summary").click().catch(() => {});
    await pg3.waitForTimeout(200);
    const about3 = (await pg3.locator(".chat-about").innerText().catch(() => "")).replace(/\s+/g, " ");
    if (!(await pg3.locator(".chat-recent").evaluate((el) => el.open).catch(() => false))) await pg3.locator(".chat-recent > summary").click().catch(() => {});
    await pg3.waitForTimeout(200);
    const empty3 = (await pg3.locator('.chat-recent [data-recent="empty"]').innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg3, "69-chat-none-chat-panel");
    ok("chat (no chat road, round 19; round 28's words): the Chat panel's glance says no bubbles here (the world's origin is not set on this loops), About this chat holds the same story as the Connection panel, and Recent answers' empty state says no answer can arrive, the exact CHL_WORLD_ORIGIN value to set and how to make a viewer key", glance3 !== null && glance3.what === "crewhub-loops' own chat, framed here." && glance3.todo === "Sign in to crewhub-loops below to type; no bubbles: the world's origin is not set on crewhub-loops (see About)." && glance3.aboutOpen === false && /No bubbles: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there/.test(about3) && /Typing in the framed chat is crewhub-loops' own/.test(about3) && /^No answers can arrive: this crewhub-loops does not let the world's key read the chat, nor this page: the world's origin is not set there\. For bubbles, set CHL_WORLD_ORIGIN=http:\/\/127\.0\.0\.1:\d+ on that crewhub-loops and restart it, or make a viewer key in Settings > Agents > Connect CrewHub World/.test(empty3), glance3 ? `"${glance3.todo}"; about: ${about3.slice(0, 100)}; empty: ${empty3.slice(0, 100)}` : "no lead");
    await pg3.keyboard.press("Escape");
    await pg3.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // An agent answers on loops: the key's stream never carries it, so no mark and no bubble; the text view says why.
    fake3.sendDm("cr-lead", "Is the reading nook done? (no chat road)");
    await pg3.waitForSelector('.chat-mark[data-said-mark="cr-lead"], .bubble.said', { timeout: 15000 }).catch(() => {});
    const marks3 = await pg3.locator(".chat-mark").count();
    const bubbles3 = await pg3.locator(".bubble.said").count();
    await pg3.keyboard.press("t");
    await pg3.waitForSelector("#text-view", { timeout: 5000 }).catch(() => {});
    const tv3 = (await sheet(pg3).innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg3, "70-chat-none-text-view");
    await pg3.keyboard.press("Escape");
    ok("chat (no chat road, round 19): an agent's answer on loops shows no mark and no bubble (the key's stream never carries it), and the text view's Chat line and Recent answers say why", marks3 === 0 && bubbles3 === 0 && /Chat: crewhub-loops' own chat.*No bubbles: this crewhub-loops does not let the world's key read the chat/.test(tv3) && /No answers can arrive: this crewhub-loops does not let the world's key read the chat/.test(tv3), `marks ${marks3}, bubbles ${bubbles3}; ${tv3.slice(0, 160)}`);
    problems.push(...own3.filter((x) => !(x.kind === "external" && (x.url ?? "").startsWith(`${web3.url}/`))));
  } finally {
    await ctx3.close().catch(() => {});
    await rig3.close();
  }

  // Road 2 (round 28): the page reads loops itself. The fake names the page's origin as its CHL_WORLD_ORIGIN (the
  // guard and the CORS headers of loops main, packages/loops-fake); the host's key does not read the chat and the host
  // names the fake as the loops web origin, so the page's probe asks the fake with the person's own cookie: signed in
  // at the fake's own login (the cookie in this browser context; the world never sees a password), the probe says on
  // and the road is page; an agent inside a building answers (the fake's sendDm to cr-lead) and the page's own poll
  // brings it: the chat mark over the building, the bubble inside, the Recent answers row; every request the page
  // made to the fake was a GET on the four routes with the events query loops forces, and the console has no CORS line.
  const rig4 = await startRig({ loops: { fake: { heartbeatMs: 1000, speed: 1, startAt: 200_000 } }, serve, pairing: "off", onLoops: noteLoops });
  const { fake: fake4, host: host4, lines: lines4 } = rig4;
  const pageOrigin4 = rig4.origin;
  fake4.setWorldOrigin(pageOrigin4);
  info(`chat (road 2): fake on 127.0.0.1:${fake4.port} with CHL_WORLD_ORIGIN=${pageOrigin4}, host on 127.0.0.1:${host4.port} naming the fake as the loops web origin`);
  const own4 = [];
  const pg4 = await openPage(browser, { origin: pageOrigin4, problems: own4, tag: "chat road 2" });
  const ctx4 = pg4.context();
  const asks4 = [];
  pg4.on("request", (r) => {
    if (!r.url().startsWith(fake4.url)) return;
    const url = new URL(r.url());
    asks4.push({ method: r.method(), path: url.pathname, query: url.search, type: r.resourceType() });
  });
  try {
    const login4 = await ctx4.request.post(`${fake4.url}/api/auth/login`, { data: { id: fake4.person.id, password: fake4.person.password } });
    const cookies4 = (await ctx4.cookies(fake4.url)).map((c) => c.name);
    await pg4.goto(`${pageOrigin4}/`);
    await pg4.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg4.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    await pg4.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "on", null, { timeout: 15000 }).catch(() => {});
    const stores4 = await pg4.evaluate(() => window.__worldStores?.().pageChat ?? null).catch(() => null);
    const health4 = await pg4.request.get(`${pageOrigin4}/world-api/health`).then((r) => r.json());
    await pg4.locator(".connection-chip").first().click();
    await pg4.waitForSelector(".connection-chat", { timeout: 5000 }).catch(() => {});
    await pg4.locator(".connection-chat").scrollIntoViewIfNeeded().catch(() => {});
    const words4 = (await pg4.locator(".connection-chat").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road4 = await pg4.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    await shot(pg4, "71-chat-road2-panel");
    const wanted4 = `^Chat The bubbles come from your own chat: this crewhub-loops lets this page read the chat as you, signed in there in this browser \\(the world's origin is set there, CHL_WORLD_ORIGIN=${pageOrigin4.replace(/[.]/g, "\\.")}\\), so the agents' answers to you show as bubbles; nothing of it goes through the host, and the world keeps nothing\\.`;
    ok("chat (road 2, round 28): signed in at the fake in this browser (its own login; the cookie lives in the context, the world sees no password) with the fake naming this page's origin as CHL_WORLD_ORIGIN, the page's probe says on and the road is page while the host's key reads no chat (health has no session), and the panel's Chat section says the bubbles come from your own chat with this page's exact origin as the setting's value", login4.status() === 200 && cookies4.includes("chl_session") && health4.connection?.session === undefined && stores4?.probe === "on" && stores4?.road === "page" && stores4?.polling === true && road4 === "page" && new RegExp(wanted4).test(words4), `login ${login4.status()}, cookies ${cookies4.join(",")}; session ${JSON.stringify(health4.connection?.session)}; ${JSON.stringify(stores4)}; ${words4.slice(0, 140)}`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForTimeout(200);
    // An agent inside a building answers (the fake's sendDm to cr-lead: its scripted reply 8 s later in demo time): the
    // page's own poll brings it, never the host (its key reads no chat): the chat mark over the building from the town,
    // the bubble inside after a tap on the mark, the Recent answers row, the glance on this road.
    fake4.sendDm("cr-lead", "Is the reading nook done? (road 2)");
    const mark4 = pg4.locator('.chat-mark[data-said-mark="cr-lead"]');
    await mark4.waitFor({ timeout: 30000 }).catch(() => {});
    const markText4 = (await mark4.getAttribute("title").catch(() => null)) ?? "";
    await shot(pg4, "72-chat-road2-mark");
    await mark4.click().catch(() => {});
    const bubble4 = pg4.locator('.bubble.said[data-said-agent="cr-lead"]');
    await bubble4.waitFor({ timeout: 10000 }).catch(() => {});
    const said4 = (await bubble4.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await shot(pg4, "73-chat-road2-bubble");
    const stores4b = await pg4.evaluate(() => window.__worldStores?.().pageChat ?? null).catch(() => null);
    ok("chat (road 2): the agent's answer comes through the page's own poll (the host's log never says its key reads the chat): the chat mark over its building from the town, then the bubble inside with the message's first line", markText4 !== "" && said4 !== "" && (stores4b?.lines ?? 0) >= 1 && !lines4.some((l) => /the key reads the chat/.test(l)), `mark "${markText4.slice(0, 70)}"; bubble "${said4.slice(0, 70)}"; ${JSON.stringify(stores4b)}; host: ${lines4.slice(-3).join(" | ").slice(0, 200)}`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForTimeout(300);
    await pg4.locator(".chat-open").click();
    await pg4.waitForSelector(".chat-recent", { timeout: 5000 }).catch(() => {});
    if (!(await pg4.locator(".chat-recent").evaluate((el) => el.open).catch(() => false))) await pg4.locator(".chat-recent > summary").click().catch(() => {});
    await pg4.waitForTimeout(200);
    const rows4 = await pg4.locator(".recent-row").count();
    const rowAgent4 = await pg4.locator(".recent-row").first().getAttribute("data-answer-agent").catch(() => null);
    const glance4 = (await pg4.locator(".chat-sheet-todo").innerText().catch(() => "")).replace(/\s+/g, " ");
    await shot(pg4, "74-chat-road2-recent");
    ok("chat (road 2): Recent answers lists the answer with the agent, and the panel's glance says type below, you are signed in there, and the answers come as bubbles because this page reads your own chat", rows4 >= 1 && rowAgent4 === "cr-lead" && glance4 === "Type to an agent below (you are signed in there); the answers come as bubbles: this page reads your own chat.", `${rows4} row(s), first ${rowAgent4}; "${glance4}"`);
    await pg4.keyboard.press("Escape");
    await pg4.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    // The page's every ask of the fake (the Chat panel's frame asks the fake's root too: a document, not the page's own
    // fetch; the fake answers it 404, the one console line this page is allowed, and only at that address: round 53,
    // r51-review T4, a 404 the browser blames on any other URL is a problem).
    const own4Asks = asks4.filter((a) => a.type === "fetch" || a.type === "xhr");
    const bad4 = own4Asks.filter((a) => a.method !== "GET" || !ROAD2_ROUTES.some((route) => route.test(a.path)));
    const events4 = own4Asks.filter((a) => a.path === "/api/events");
    const badQuery4 = events4.filter((a) => {
      const q = new URLSearchParams(a.query);
      return q.get("types") !== "dm.created,dm.answered" || Number(q.get("limit")) !== 50 || q.has("after") || !(q.has("cursor") || q.get("from") === "tail");
    });
    const corsLines4 = own4.filter((x) => x.kind === "console" && /CORS|ERR_FAILED/.test(x.text));
    ok("chat (road 2): every fetch the page made to the fake was a GET on the four routes (the threads, the events poll with types dm.created,dm.answered and limit 50, from=tail then the sealed cursor, a message by id); no CORS line in the console", own4Asks.length >= 3 && bad4.length === 0 && badQuery4.length === 0 && events4.length >= 1 && own4Asks.some((a) => a.path.startsWith("/api/dm/messages/")) && corsLines4.length === 0, `${own4Asks.length} fetches: ${[...new Set(own4Asks.map((a) => `${a.method} ${a.path.replace(/\/[A-Za-z0-9_-]+$/, (m) => (a.path.startsWith("/api/dm/messages/") ? "/<id>" : m))}`))].join(", ")}; ${bad4.length} off the shape, ${badQuery4.length} bad poll quer${badQuery4.length === 1 ? "y" : "ies"}; ${corsLines4.length} CORS line(s)`);
    problems.push(...own4.filter((x) => !(x.kind === "external" && x.url === `${fake4.url}/`) && !(x.kind === "console" && /status of 404/.test(x.text))));
    problems.push(...own4.filter((x) => x.kind === "console" && /status of 404/.test(x.text) && x.url !== `${fake4.url}/`));
  } finally {
    await ctx4.close().catch(() => {});
    await rig4.close();
  }
}
