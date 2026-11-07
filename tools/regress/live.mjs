/**
 * Live mode against a fake crewhub-loops behind a host, both started here (lib/rig.mjs): the Live chip, the Chat panel over
 * the loops web stub, the scripted director in live mode, Loops down and Live again, the pairing page and the one-time link.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { chip as chipOf, openPage, readTextView as text, textView as sheet, untilChip } from "../lib/page.mjs";
import { list } from "../lib/world.mjs";
import { startRig } from "../lib/rig.mjs";
import { dressed } from "../lib/world.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, opts, plan, groups, origin, dist: DIST, distServed: DIST_SERVED, distFresh, problems, noteLoops } = pass;
  const { open, canvas } = page;
  const { ok, info, note } = check;
  const { tag, shot } = out;
  // Design choice X2's row comes first: its own rig, closed before the group's starts on the same port.
  await runInertCorners({ pass, page, check, out });
  // 15. Live mode against a fake crewhub-loops behind the host, both started here on 127.0.0.1: the rig (lib/rig.mjs)
  // with the loops web app the host names (`loopsWebUrl`), for the Chat panel's frame: a stub page that records how it
  // was fetched. The host serves the built world when it is there, else it stands behind your Vite; pairing on.
  const hostPort = Number(opts["host-port"]);
  if (DIST_SERVED) info(`live: ${distFresh}`);
  const fakeOptions = { heartbeatMs: 1000 };
  const rig = await startRig({ loops: { fake: fakeOptions }, web: true, serve: { dist: DIST, origin, hostPort }, log: () => undefined, onLoops: noteLoops });
  const { served, web, host } = rig;
  let { fake } = rig;
  const liveOrigin = rig.origin;
  // The page is opened without `?source=live`: the source is `auto`, the probe finds the host and the health it answers
  // is what the sign-in link follows (an override skips the probe, and the link would fall back to the default URL).
  const liveBase = `${liveOrigin}/`;
  const pairing = typeof host.mintPairLink === "function";
  info(`live: fake on 127.0.0.1:${fake.port}, loops web stub on 127.0.0.1:${web.port}, host on 127.0.0.1:${host.port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`}; pairing ${pairing ? "on" : "not present"}`);
  const openLive = (into = problems) => openPage(browser, { origin: liveOrigin, problems: into, tag: "live" });
  const chip = chipOf;
  const until = untilChip;
  try {
    if (pairing) {
      // Without the cookie: the API refuses and the world asks to pair, naming the command and never the link. The
      // refused request is a console error in the browser (it is what it is meant to be), so it is kept apart.
      const own = [];
      const bare = await openLive(own);
      const status = await bare.request.get(`${liveOrigin}/world-api/snapshot`).then((r) => r.status()).catch(() => 0);
      await bare.goto(liveBase);
      await bare.waitForTimeout(3000);
      const page = await bare.locator(".pair-page").count();
      const body = (await bare.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("pairing: /world-api answers 401 without a cookie", status === 401, String(status));
      ok("pairing: the world asks to pair this browser", page > 0 && /Pair this browser/i.test(body) && /npm run world/.test(body) && !/\/pair\//.test(body), body.slice(0, 160));
      await shot(bare, "22-pair-page");
      await bare.context().close();
      problems.push(...own.filter((x) => !/401/.test(x.text)));
    } else info("live: the host has no mintPairLink, so the two pairing checks are skipped");

    const pg = await openLive();
    if (pairing) {
      // Behind the Vite proxy the link must open on Vite's origin (it proxies /pair); on the host's own when it serves dist.
      await pg.goto(rig.pairLink());
      await pg.waitForTimeout(500);
      ok("pairing: the one-time link lands on /", new URL(pg.url()).pathname === "/" && new URL(pg.url()).origin === liveOrigin, new URL(pg.url()).pathname);
    }
    await pg.goto(liveBase);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    const live1 = await until(pg, "live", 20000);
    ok("live: the chip says Live against the fake", live1 === "live", `${live1}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "23-live");
    // The Chat panel (round 12, road A): the chip opens a panel that frames the loops web the host names (the stub page
    // of lib/loopsWebStub.mjs here, which records how it was fetched), says it is loops' own chat and what it needs,
    // keeps the link to the app, and grants the frame no more than the chat needs; the panel takes the focus, Escape
    // closes it and the focus returns to the chip; from a card the panel is that agent's and its close button returns
    // the focus to the card; on a phone the panel is the whole screen.
    await pg.locator(".chat-open").click();
    await pg.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const frame = pg.locator(".chat-sheet iframe.chat-frame");
    const src = await frame.getAttribute("src").catch(() => null);
    await pg.frameLocator(".chat-sheet iframe.chat-frame").locator("[data-stub=loops-web]").waitFor({ timeout: 10000 }).catch(() => {});
    const framed = web.requests.filter((r) => r.dest === "iframe");
    ok("live: the Chat chip opens the Chat panel, which frames the loops web the host names", src === `${web.url}/` && framed.length > 0, `src ${src}; ${web.requests.length} requests to the stub, ${framed.length} as a frame (Sec-Fetch-Site ${framed[0]?.site ?? "none"})`);
    // Round 17: in one glance, two short lines (what this is, the one thing to do on this road) above Recent answers; the
    // whole story behind "About this chat", a details element the keyboard opens (Tab to its summary, Enter). This group's
    // fake does not let the key read the chat, so the road's line says no bubbles here (the chat group checks the key road).
    const glance = async (p) => p.locator(".chat-sheet-lead").evaluate((el) => { const lh = parseFloat(getComputedStyle(el).lineHeight) || 20; const lines = (sel) => Math.round(el.querySelector(sel).getBoundingClientRect().height / lh); return { what: el.querySelector(".chat-sheet-what")?.textContent ?? "", todo: el.querySelector(".chat-sheet-todo")?.textContent ?? "", whatLines: lines(".chat-sheet-what"), todoLines: lines(".chat-sheet-todo"), aboveList: Math.round(el.closest(".card-body").querySelector(".chat-recent").getBoundingClientRect().top - el.getBoundingClientRect().top), aboutOpen: el.closest(".card-body").querySelector(".chat-about")?.open ?? null }; }).catch(() => null);
    // Round 28: the page's own probe of road 2 asks the loops web origin the host names (the stub, which answers no CORS
    // header), so its verdict is "the origin is not set" and the glance says so; wait for it, so the words are the verdict's.
    await pg.waitForFunction(() => window.__worldStores?.().pageChat?.probe === "origin-not-set", null, { timeout: 10000 }).catch(() => {});
    const g = await glance(pg);
    const closedText = (await pg.locator(".chat-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    await pg.locator(".chat-about > summary").focus().catch(() => {});
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(200);
    const panelText = (await pg.locator(".chat-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const aboutOpen = await pg.locator(".chat-about").evaluate((el) => el.open).catch(() => null);
    const appHref = await pg.locator(".chat-sheet .chat-open-app").getAttribute("href").catch(() => null);
    ok("live (round 17): the panel reads in one glance: crewhub-loops' own chat and the one thing to do on this road (no viewer key, and the page's probe of road 2 finds the world's origin not set on this loops: no bubbles here), two short lines above Recent answers; the whole story (what typing needs, no password, and since round 18 what the Recent answers list is) behind About this chat, which Enter on its summary opens; the link to the app", g !== null && /^crewhub-loops' own chat, framed here\.$/.test(g.what) && /^Sign in to crewhub-loops below to type; no bubbles: the world's origin is not set on crewhub-loops \(see About\)\.$/.test(g.todo) && g.whatLines === 1 && g.todoLines <= 2 && g.aboutOpen === false && !/signed in to crewhub-loops as a person/.test(closedText) && !/The last 10 answers this page saw/.test(closedText) && aboutOpen === true && /signed in to crewhub-loops as a person/.test(panelText) && /no password/.test(panelText) && /chat head in loops' dock/.test(panelText) && /The last 10 answers this page saw, newest first/.test(panelText) && appHref === web.url, g ? `"${g.what}" / "${g.todo}" (${g.whatLines}+${g.todoLines} lines, the list ${g.aboveList} px below); about open before ${g.aboutOpen}, after Enter ${aboutOpen}; ${appHref}` : "no lead");
    const sandbox = await frame.getAttribute("sandbox").catch(() => null);
    const allow = await frame.getAttribute("allow").catch(() => null);
    ok("live: the frame's sandbox is no wider than the chat needs", sandbox === "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" && allow === "clipboard-write", `sandbox "${sandbox}", allow "${allow}"`);
    await shot(pg, "23b-chat-panel");
    const focusInside = await pg.evaluate(() => !!document.querySelector(".chat-sheet")?.contains(document.activeElement));
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(300);
    const closed = (await pg.locator(".chat-sheet").count()) === 0;
    const backOnChip = await pg.evaluate(() => document.activeElement?.classList.contains("chat-open") ?? false);
    ok("live: the panel takes the focus; Escape closes it and the focus returns to the chip", focusInside && closed && backOnChip, `focus inside ${focusInside}, closed ${closed}, back on the chip ${backOnChip}`);
    // From a card: the jump list lands beside cl-lead, Enter opens its card, its Chat button opens the panel for it.
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("cl-lead");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    // Round 22: the card's Work says what cl-lead holds (the fake's board: six open tickets, CL-45 on its desk, CL-80
    // in review waiting on Nicky), the Answers section says why no answer can be known on this road (the host keeps no
    // session here, or a plain key with nobody signed in), and Lane, Projects and Recent sit behind a closed More
    // disclosure that opens on a click.
    await pg.waitForFunction(() => !/Reading the last progress line/.test(document.querySelector(".agent-card")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const leadCard = (await pg.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    const holds = /Holds\s*6 open tickets: 3 in progress, 2 review, 1 planned; 1 waits on Nicky/.test(leadCard);
    const listed = /CL-80 .*review, waits on Nicky/.test(leadCard) && /CL-81/.test(leadCard) && !/CL-45 .*in progress\b.*CL-45/.test(leadCard);
    // Round 24: the fake's CL-40 (the analyst's, in progress) waits on cl-lead, so the card says who waits on it and who holds it.
    const waited = /Waited on by\s*1 open ticket of others\s*CL-40 .*in progress, Analyst holds it/.test(leadCard);
    // The headings read uppercased (the eyebrow's text-transform), so the section names match case-insensitively.
    const answers = /Answers\s*(No answers can arrive here: this crewhub-loops does not let the world's key read the chat|No answer from it since this page opened)/i.test(leadCard);
    // The line is the agent's own from the fake's events (CL-81), else CL-45's read from the source, else the honest words.
    const progressSaid = /\b(start|update|done|question) on CL-\d+, (just now|\d+ (min|h) ago)|No progress line: none seen since this page opened, and CL-45 has none\./.test(leadCard);
    const moreClosed = (await pg.locator("details.agent-card-more:not([open])").count()) === 1 && !(await pg.locator(".agent-card h3", { hasText: /^Lane$/ }).isVisible().catch(() => true));
    ok("live (round 22, 24): the card says what cl-lead holds and whom it waits on, who waits on it, why no answer can be known with a plain key, and the progress line or its absence", holds && listed && waited && answers && progressSaid, `holds ${holds}, listed ${listed}, waited on by ${waited}, answers ${answers}, progress ${progressSaid}: ${leadCard.slice(0, 1200)}`);
    await pg.locator("details.agent-card-more > summary").click().catch(() => {});
    await pg.waitForTimeout(200);
    const laneAfter = await pg.locator(".agent-card h3", { hasText: /^Lane$/ }).isVisible().catch(() => false);
    const moreText = (await pg.locator("details.agent-card-more").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("live (round 22): Lane, Projects and Recent sit behind More, closed at first and open on a click", moreClosed && laneAfter && /Lane/.test(moreText) && /Projects/.test(moreText), `closed before ${moreClosed}, Lane shown after ${laneAfter}; ${moreText.slice(0, 120)}`);
    await shot(pg, "23c0-card-round22");
    await pg.locator(".agent-card .agent-chat").click().catch(() => {});
    await pg.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const title = (await pg.locator(".chat-sheet .card-title").first().innerText().catch(() => "")).trim();
    const forAgent = await pg.locator(".chat-sheet").getAttribute("data-agent").catch(() => null);
    const cardSrc = await frame.getAttribute("src").catch(() => null);
    await pg.frameLocator(".chat-sheet iframe.chat-frame").locator("[data-stub=loops-web]").waitFor({ timeout: 10000 }).catch(() => {});
    const asked = web.requests.filter((r) => r.path === "/?chat=cl-lead" && r.dest === "iframe");
    ok("live: from a card the frame asks loops for that agent's chat (?chat=<id>), and the stub was fetched so as a frame", cardSrc === `${web.url}/?chat=cl-lead` && asked.length > 0, `src ${cardSrc}; ${asked.length} framed request(s) with the query`);
    await shot(pg, "23c-chat-from-card");
    await pg.getByRole("button", { name: "Close the chat panel" }).click().catch(() => {});
    await pg.waitForTimeout(300);
    const backOnCard = await pg.evaluate(() => document.activeElement?.classList.contains("agent-chat") ?? false);
    ok("live: the card's Chat button opens the panel for that agent; its close button returns the focus to the card", /^Chat with /.test(title) && forAgent === "cl-lead" && (await pg.locator(".chat-sheet").count()) === 0 && backOnCard, `"${title}" for ${forAgent}, focus back on the card's button ${backOnCard}`);
    for (let i = 0; i < 3; i++) {
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(300);
    }
    // Round 13: loops' chat dock lists enabled agents of loops role lead only, so the postman's card (loops role router, at
    // the post office, no lead to offer) has no Chat button and says why; no ?chat= is ever asked for it.
    await canvas(pg).focus();
    await pg.keyboard.press("/");
    await pg.getByRole("dialog", { name: "Jump to" }).waitFor({ timeout: 3000 }).catch(() => {});
    await pg.keyboard.type("postman");
    await pg.waitForTimeout(400);
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(1500);
    await canvas(pg).focus();
    await pg.keyboard.press("Enter");
    await pg.locator(".agent-card").waitFor({ timeout: 3000 }).catch(() => {});
    const postmanCard = (await pg.locator(".agent-card").innerText().catch(() => "")).replace(/\s+/g, " ");
    const postmanChat = await pg.locator(".agent-card .agent-chat").count();
    const postmanNote = (await pg.locator(".agent-card .agent-chat-note").innerText().catch(() => "")).replace(/\s+/g, " ");
    const askedForPostman = web.requests.filter((r) => /chat=postman/.test(r.path)).length;
    ok("live: the postman's card has no Chat button (loops chats with leads only) and says why; nothing asked loops for its chat", /Postman/.test(postmanCard) && postmanChat === 0 && /crewhub-loops chats with leads only: Postman is the postman \(loops role router\)\.$/.test(postmanNote) && askedForPostman === 0, `${postmanChat} Chat button(s); "${postmanNote}"; ${askedForPostman} request(s) with chat=postman`);
    ok("live (round 22): the postman's card says in words that it holds no ticket and that no line and no answer were seen", /Holds\s*no ticket: crewhub-loops assigns it none right now/.test(postmanCard) && /No progress line: none seen since this page opened and no ticket on its desk/.test(postmanCard) && /(no answers can arrive|No answer from it since this page opened)/i.test(postmanCard), postmanCard.slice(0, 500));
    await shot(pg, "23e-card-leads-only");
    for (let i = 0; i < 3; i++) {
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(300);
    }
    const ph = await openPage(browser, { origin: liveOrigin, width: 375, problems, tag: "live phone" });
    const phone = ph.context();
    // A new context has no pairing cookie: the phone pairs first, as the desktop page did.
    if (pairing) await ph.goto(host.mintPairLink(served ? undefined : origin));
    await ph.goto(liveBase);
    await ph.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await until(ph, "live", 20000);
    await ph.locator(".chat-open").click().catch(() => {});
    await ph.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
    const box = await ph.locator(".chat-sheet").boundingBox().catch(() => null);
    const fullClass = await ph.locator(".chat-sheet.chat-sheet-full").count();
    ok("live: on a phone the Chat panel is the whole screen", fullClass === 1 && !!box && box.width >= 370 && box.height >= 800, box ? `${Math.round(box.width)}x${Math.round(box.height)}, full-screen class ${fullClass}` : "no panel");
    await shot(ph, "23d-chat-phone");
    await phone.close();
    // Zones in a live town (round 11, L22 option 3): the Connection panel says where districts come from, and with none
    // made yet the text view says nothing about zones at all.
    await chip(pg).click().catch(() => {});
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const zonesRow = (await pg.locator(".connection-zones").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(300);
    const liveText = await text(pg);
    ok(
      "live: the Connection panel says zones are made by hand here and crewhub-loops has none; the text view says nothing odd",
      /^none yet: every building stands in the one district\./.test(zonesRow) && /crewhub-loops has no project groups/.test(zonesRow) && /kept in this browser/.test(zonesRow) && !/Unnamed zone|No zone|made by hand/.test(liveText),
      zonesRow.slice(0, 120),
    );

    // The scripted director in live mode (round 11): its own opt-in, off by default and not implied by the demo's switch
    // (stored on here, before a reload); every line of the text view's director section tagged "scripted"; switched on,
    // the plans section at once and, over the fake's events, a quick plan whose intents read "scripted director:";
    // switched off, the kill switch: the section says off again. The director writes nothing: the page's only road to
    // loops is the host, and every request the page sends while the director runs is counted; the world's only non-GET
    // requests are Connect and Forget, neither of which happens here.
    await pg.evaluate(() => localStorage.setItem("crewhub.presence.v1", JSON.stringify({ directorEnabled: true })));
    await pg.reload();
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await until(pg, "live", 20000);
    const writes = [];
    const countWrites = (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    pg.on("request", countWrites);
    const openSettings = async () => {
      await pg.getByRole("button", { name: /settings/i }).first().click();
      await pg.waitForSelector(".settings-sheet", { timeout: 5000 }).catch(() => {});
    };
    const liveSwitch = () => pg.locator(".settings-sheet").getByLabel(/Scripted director in live mode/);
    // Escape closes Settings from its button, not from a focused checkbox (the keys leave form controls alone): the close button, as a person would.
    const closeSettings = async () => {
      await pg.getByRole("button", { name: /close settings/i }).first().click().catch(() => pg.keyboard.press("Escape"));
      await pg.waitForSelector(".settings-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    };
    await openSettings();
    const settingsText = (await pg.locator(".settings-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const switchCount = await liveSwitch().count();
    const switchOn = switchCount === 1 ? await liveSwitch().isChecked() : null;
    ok("live director: Settings offer the live opt-in, off, with the demo's switch stored on and not shown", switchCount === 1 && switchOn === false && !/Demo: scripted director/.test(settingsText) && /never touches crewhub-loops/.test(settingsText), `${switchCount} switch(es), checked ${switchOn}; ${settingsText.slice(0, 120)}`);
    await shot(pg, "23b-live-settings-director");
    await closeSettings();
    const directorSection = () => sheet(pg).locator("section", { has: pg.locator("h3", { hasText: /^Scripted director/ }) });
    const sectionTags = async () => {
      const tags = await directorSection().locator(".text-kind").evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
      return { count: tags.length, allScripted: tags.length > 0 && tags.every((k) => k === "scripted") };
    };
    const off1 = await text(pg);
    await pg.keyboard.press("t");
    await pg.waitForTimeout(300);
    const tagsOff = await sectionTags();
    await pg.keyboard.press("Escape");
    ok("live director: the text view says the scripted director is off, every line tagged scripted", /Scripted director/.test(off1) && /scripted director is off/i.test(off1) && /never anything in crewhub-loops/.test(off1) && tagsOff.allScripted, `${tagsOff.count} tag(s); ${(off1.match(/Scripted director[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " ").slice(0, 160)}`);
    await openSettings();
    await liveSwitch().check();
    await closeSettings();
    await pg.keyboard.press("t");
    await pg.waitForTimeout(400);
    const onText = (await sheet(pg).innerText().catch(() => "")).replace(/\s+/g, " ");
    const tagsOn = await sectionTags();
    ok("live director: switched on, the plans section is there at once, tagged scripted", /Scripted director plans/.test(onText) && /No plan yet|Plan \d+ \(/.test(onText) && tagsOn.allScripted, `${tagsOn.count} tag(s); ${(onText.match(/Scripted director plans.{0,140}/) ?? [""])[0]}`);
    // A quick plan: 20 s after the fake's last movement-relevant event, at most one per building per minute.
    const planLines = sheet(pg).locator("li", { hasText: /scripted director: / });
    const planAt = Date.now();
    await planLines.first().waitFor({ timeout: 90000 }).catch(() => {});
    const planText = (await sheet(pg).innerText().catch(() => "")).replace(/\s+/g, " ");
    const played = await planLines.count();
    const tagsPlan = await sectionTags();
    const demoTags = await sheet(pg).locator('.text-kind[data-kind="demo"]').count();
    ok("live director: a quick plan over the fake's events, its intents read 'scripted director:', nothing tagged demo", played > 0 && /Plan \d+ \((quick|scheduled)/.test(planText) && tagsPlan.allScripted && demoTags === 0, `${played} intent line(s) after ${((Date.now() - planAt) / 1000).toFixed(1)} s, ${tagsPlan.count} scripted tag(s), ${demoTags} demo tag(s); ${(planText.match(/Plan \d+ \([^)]*\)[^.]*\./) ?? [""])[0]}`);
    await directorSection().first().scrollIntoViewIfNeeded().catch(() => {});
    await shot(pg, "23c-live-director-plan");
    await pg.keyboard.press("Escape");
    await openSettings();
    await liveSwitch().uncheck();
    await closeSettings();
    const off2 = await text(pg);
    ok("live director: switched off, the kill switch: the text view says off again over the kept plans and no intent is left", /scripted director is off/i.test(off2) && !/scripted director: /.test(off2), (off2.match(/Scripted director[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " ").slice(0, 120));
    pg.off("request", countWrites);
    ok("live director: the page sent no write while the director planned and played (GET and HEAD only)", writes.length === 0, writes.length === 0 ? "no non-GET request" : writes.slice(0, 3).join(", "));
    const { port, key, keyName } = fake;
    const lastSeq = fake.lastSeq();
    await fake.close();
    const down = await until(pg, "loops-down", 20000);
    ok("live: Loops down after the fake closes", down === "loops-down", `${down}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "24-loops-down");
    fake = await rig.loopsAgain({ ...fakeOptions, port, key, keyName, firstSeq: lastSeq });
    const again = await until(pg, "live", 30000);
    ok("live: Live again after a new fake on the same port", again === "live", `${again}: ${(await chip(pg).innerText().catch(() => "")).trim()}`);
    await shot(pg, "25-live-again");
    await pg.context().close();
  } finally {
    await rig.close();
    // The Chat panel's frame is the one request that leaves the page's origin, by design: it is the loops web app
    // (the stub here). Only those requests are expected; anything else leaving the page still fails the closing check.
    // At the stub's own origin, not any text that contains it (round 52, r51-review T4).
    const framed = problems.filter((x) => x.kind === "external" && (x.url ?? "").startsWith(`${web.url}/`));
    for (const x of framed) problems.splice(problems.indexOf(x), 1);
    info(`live: ${framed.length} request(s) left the page for the loops web stub, the Chat panel's frame, as designed`);
  }
}

/**
 * Design choice X2's three corners in a browser (round 75; X2 is round 72's, and until now only the pure rule was held,
 * coversCorners.test.ts). While a sheet covers them, the corner tools, the camera toolbar and the chat corner are `inert`,
 * and they come back when it closes: on a phone under the Chat panel (the whole screen there), on a desktop under the
 * Chat panel and the text view. A phone's text view starts under the header rows and covers nothing, and Settings is not
 * counted, so those two leave the corners alone. The demo's own chat corner is the other branch of ChatCorner.
 *
 * Each read says what a keyboard meets, not only the attribute: every corner is there with a button that is painted, and
 * that button takes the focus when the corner is live and refuses it when the corner is inert. A corner that is missing,
 * or has no such button, fails the read, so the row cannot pass while holding nothing. Its own rig: it closes before the
 * live group's rig starts on the same port, and the block ends with the demo page, after its own rig closed.
 */
export async function runInertCorners(context) {
  // The row stands first in the group: a step that throws is its one failing check, and the group's own checks still run.
  await inertCorners(context).catch((error) => context.check.ok("X2 (round 75): the three corners' row runs to its end", false, (error?.message ?? String(error)).split("\n")[0]));
}

async function inertCorners({ pass, page, check, out }) {
  const { browser, opts, origin, dist: DIST, problems, noteLoops } = pass;
  const { ok } = check;
  const { shot } = out;
  const rig = await startRig({ loops: { fake: { heartbeatMs: 1000 } }, web: true, serve: { dist: DIST, origin, hostPort: Number(opts["host-port"]) }, pairing: "off", log: () => undefined, onLoops: noteLoops });
  const CORNERS = [
    ["corner tools", ".world-corner-right"],
    ["camera toolbar", ".camera-toolbar"],
    ["chat corner", ".world-chat"],
  ];
  /** Each corner as a keyboard meets it; the focus is put back where it was. */
  const corners = (p) =>
    p.evaluate((list) => {
      const before = document.activeElement;
      const read = list.map(([name, selector]) => {
        const box = document.querySelector(selector);
        const button = box === null ? undefined : [...box.querySelectorAll("button")].find((b) => !b.disabled && b.getClientRects().length > 0);
        if (button === undefined) return { name, there: false };
        button.focus();
        return { name, there: true, inert: box.inert === true, took: document.activeElement === button };
      });
      if (before instanceof HTMLElement) before.focus();
      return read;
    }, CORNERS);
  const live = (read) => read.length === CORNERS.length && read.every((c) => c.there && !c.inert && c.took);
  const dead = (read) => read.length === CORNERS.length && read.every((c) => c.there && c.inert && !c.took);
  const words = (read) => read.map((c) => (c.there ? `${c.name} ${c.inert ? "inert" : "live"}, ${c.took ? "took" : "refused"} the focus` : `${c.name} has no painted button`)).join("; ");
  const shown = (p, selector) => p.waitForSelector(selector, { timeout: 5000 }).then(() => true).catch(() => false);
  const gone = (p, selector) => p.waitForSelector(selector, { state: "detached", timeout: 5000 }).then(() => true).catch(() => false);
  const openLive = async (width) => {
    const p = await openPage(browser, { origin: rig.origin, problems, tag: "X2 corners", width });
    await p.goto(`${rig.origin}/`);
    await dressed(p).catch(() => {});
    return { p, state: await untilChip(p, "live", 20000) };
  };
  try {
    // A phone: the Chat panel is the whole screen, so the three corners under it are inert until it closes.
    const phone = await openLive(375);
    const phoneBefore = await corners(phone.p);
    await phone.p.locator(".chat-open").tap();
    const chatOpen = await shown(phone.p, ".chat-sheet");
    const phoneCovered = await corners(phone.p);
    await shot(phone.p, "23x-x2-phone-chat-covers");
    await phone.p.keyboard.press("Escape");
    const chatClosed = await gone(phone.p, ".chat-sheet");
    const backOnChip = await phone.p.evaluate(() => document.activeElement?.classList.contains("chat-open") ?? false);
    const phoneAfter = await corners(phone.p);
    ok("X2 (round 75): on a phone the Chat panel makes the three corners inert, and they come back when it closes, the focus on the chat chip", phone.state === "live" && live(phoneBefore) && chatOpen && dead(phoneCovered) && chatClosed && backOnChip && live(phoneAfter), `chip ${phone.state}; before: ${words(phoneBefore)} | panel ${chatOpen ? "open" : "not open"}: ${words(phoneCovered)} | closed ${chatClosed}, focus on the chip ${backOnChip}: ${words(phoneAfter)}`);
    // A phone's text view covers no corner (PHONE_QUERY's other side), by the Help menu's row, the road a thumb has.
    await phone.p.getByRole("button", { name: "Help" }).tap();
    await phone.p.getByRole("menuitem", { name: /^Open the text view/ }).tap().catch(() => {});
    const textOpen = await shown(phone.p, "#text-view");
    const phoneText = await corners(phone.p);
    await phone.p.keyboard.press("Escape");
    const textClosed = await gone(phone.p, "#text-view");
    ok("X2 (round 75): on a phone the text view starts under the header rows, covers no corner and leaves all three live", textOpen && live(phoneText) && textClosed, `text view ${textOpen ? "open" : "not open"}: ${words(phoneText)}; closed ${textClosed}`);
    await phone.p.context().close();

    // A desktop: the text view and the Chat panel cover the corners; Settings starts under the right corner and is not counted.
    const desk = await openLive(1440);
    const deskBefore = await corners(desk.p);
    await desk.p.locator("canvas").first().focus();
    await desk.p.keyboard.press("t");
    const deskTextOpen = await shown(desk.p, "#text-view");
    const deskText = await corners(desk.p);
    await desk.p.keyboard.press("Escape");
    const deskTextClosed = await gone(desk.p, "#text-view");
    const deskAfterText = await corners(desk.p);
    ok("X2 (round 75): on a desktop the text view makes the three corners inert, and they come back when it closes", desk.state === "live" && live(deskBefore) && deskTextOpen && dead(deskText) && deskTextClosed && live(deskAfterText), `chip ${desk.state}; before: ${words(deskBefore)} | text view ${deskTextOpen ? "open" : "not open"}: ${words(deskText)} | closed ${deskTextClosed}: ${words(deskAfterText)}`);
    await desk.p.locator(".chat-open").click();
    const deskChatOpen = await shown(desk.p, ".chat-sheet");
    const deskChat = await corners(desk.p);
    await desk.p.keyboard.press("Escape");
    const deskChatClosed = await gone(desk.p, ".chat-sheet");
    const deskAfterChat = await corners(desk.p);
    ok("X2 (round 75): on a desktop the Chat panel makes the three corners inert, and they come back when it closes", deskChatOpen && dead(deskChat) && deskChatClosed && live(deskAfterChat), `panel ${deskChatOpen ? "open" : "not open"}: ${words(deskChat)} | closed ${deskChatClosed}: ${words(deskAfterChat)}`);
    await desk.p.getByRole("button", { name: "Settings", exact: true }).click();
    const settingsOpen = await shown(desk.p, ".settings-sheet");
    const deskSettings = await corners(desk.p);
    ok("X2 (round 75): Settings is not counted: the three corners stay live under it", settingsOpen && live(deskSettings), `settings ${settingsOpen ? "open" : "not open"}: ${words(deskSettings)}`);
    await desk.p.context().close();
  } finally {
    await rig.close();
    // The Chat panel's frame leaves the page's origin by design, as in the live group above; only those requests are expected.
    const framed = problems.filter((x) => x.kind === "external" && (x.url ?? "").startsWith(`${rig.web.url}/`));
    for (const x of framed) problems.splice(problems.indexOf(x), 1);
  }
  // The demo has its own chat corner (ChatCorner's other branch: the copied dock), on your Vite with no host behind it. Only
  // a window under 900 px keeps a button in that corner (loops' narrow mode, the Agent chats menu), and only one over a
  // phone's 600 px is covered by the text view, so this page is 800 wide.
  const demo = await page.open({ tag: "X2 corners demo", width: 800 });
  await page.town(demo, 1000);
  const isDemo = (await demo.locator(".chat-open").count()) === 0;
  const demoBefore = await corners(demo);
  await page.canvas(demo).focus();
  await demo.keyboard.press("t");
  const demoOpen = await shown(demo, "#text-view");
  const demoText = await corners(demo);
  await demo.keyboard.press("Escape");
  const demoClosed = await gone(demo, "#text-view");
  const demoAfter = await corners(demo);
  ok("X2 (round 75): the demo's own chat corner is inert under the text view too, with the other two, and comes back", isDemo && live(demoBefore) && demoOpen && dead(demoText) && demoClosed && live(demoAfter), `demo ${isDemo}; before: ${words(demoBefore)} | text view ${demoOpen ? "open" : "not open"}: ${words(demoText)} | closed ${demoClosed}: ${words(demoAfter)}`);
  await demo.context().close();
}
