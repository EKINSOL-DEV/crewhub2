# The loops dock's message box: dropped keys and Enter (round 69, w5-9 and w5-10)

The world's chat dock is crewhub-loops' own chat, copied verbatim at loops commit `a1bed0f` (1 Oct 2026; the sync rule in
[DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md), "The chat bubbles follow the same rule"). Round 64's keyboard walker found two things
wrong in its message box ([walkthrough-r64.md](walkthrough-r64.md), w5-9 and w5-10). Both are loops' own code, so the fix
belongs in loops first. This page says what is wrong and why, what loops has done about it since (both are fixed on loops'
main), what the two prepared branches do on the world's copy until the copy catches up, and the clean end state. Nothing
in Nicky's crewhub-loops checkout was touched: everything about loops here comes from read-only `git show` and `git log`.

**The short version.** Loops already fixed both, on 1 and 3 October, after the commit the copies are pinned at. No patch to
loops is needed for either. The prepared branches `sugg/w5-9` and `sugg/w5-10` port loops' own two changes onto the copy as
**declared divergences** that the copy check records (the only kind of edit the copy rule admits, Nicky's call to merge); a
re-copy of the chat at a loops commit after `c7f9d679` makes the divergences vanish and drops the records.

## What is wrong

### w5-9: keys typed fast are dropped

**Seen.** With no pause between keys every other character is lost ("Where are you?" became "?"); 30 ms apart everything
arrives; a paste is fine.

**Why, confirmed from the code.** In the copy, `queries.ts` keeps the draft in the react-query cache: `useQuery` with
`enabled: false` and `initialData`, and `updateDraft` is `queryClient.setQueryData`. The message box in `Bubbles.tsx` is a
controlled textarea (`value={draft.text}`, `onChange` → `updateDraft`). React-query hands a cache write to the component
through `notifyManager.batchCalls` (`@tanstack/react-query` 5.104.0, `useBaseQuery.js`:
`observer.subscribe(notifyManager.batchCalls(onStoreChange))`), and `batchCalls` schedules the call with `setTimeout(…, 0)`
(`@tanstack/query-core` `notifyManager.js`, `defaultScheduler = systemSetTimeoutZero`). So the re-render with the new
`draft.text` comes a macrotask after the input event, while React restores a controlled textarea to its current prop
(the stale draft) at the end of that event. The next key then edits the stale text: with "W" typed and "h" following before
the timeout fires, the box is reset to "" and the second event yields "h", which overwrites "W" in the cache; the pattern
repeats, and every other character is lost. With 30 ms between keys the timeout fires in between, and all is well.

The timing was run, not reasoned: a small node script subscribing a `QueryObserver` exactly as `useBaseQuery` does
counted the listener's calls after `setQueryData`: 0 right after the write, 0 after a microtask, 1 after `setTimeout 0`.
The same `QueryObserver` subscribed without `batchCalls` is notified synchronously, which is why the cache itself looks
fine in a test that reads it directly.

### w5-10: Enter adds a line and nothing sends from the keyboard

**Seen.** Enter adds a newline; Cmd+Enter and Ctrl+Enter do nothing; only the Send button sends. In the copy the Field has
no `onKeyDown`, and the form submits on the button alone.

## What loops did since `a1bed0f`

Loops' main is at `ff065722` (8 Oct 2026). On the copied files it moved on in 16 commits to `Bubbles.tsx`, 9 to
`queries.ts`, 7 to `bubbles.css` and 8 to `primitives/Menu.tsx` (`useMessageViewport.ts` is unchanged); the copy check
already notes "changed in crewhub-loops after a1bed0f; re-copy it" for each. Two of those commits are these findings:

| Finding | Loops' commit | What it does |
| --- | --- | --- |
| w5-9 | **CL-119 `d4cf7397`** (1 Oct 2026, "the chat caret no longer jumps to the end (Field echo)") | `Field` gets an opt-in `echo` prop: the control shows a local copy set synchronously in the change handler, and adopts the owner's value only when it is one the Field did not emit (a draft restored, a thread switched, a reset after send); the chat's Field line gets the one word `echo`. Tests: `Field.caret.test.tsx` (vitest, six cases including "fast typing is not rolled back by a late echo") and a Playwright case in `bubbles.spec.ts`. |
| w5-10 | **CL-181 `c7f9d679`** (3 Oct 2026, "Ctrl+Enter / Cmd+Enter sends the chat message; one send-chord rule for the chat, the quick ask and the comment composer") | `primitives/sendChord.ts`, `isSendChord`: Ctrl+Enter or Cmd+Enter sends; plain Enter, Shift+Enter and Alt+Enter keep their meaning (a new line); an IME composition never sends. The chat's Field gets `onKeyDown` with it, a hint "⌘ Enter sends" / "Ctrl+Enter sends" on desktop (not on a phone), and Send carries `aria-keyshortcuts="Control+Enter Meta+Enter"`. Tests: `sendChord.test.ts` (vitest) and two Playwright cases in `bubbles.spec.ts`. |

Loops' own choice for w5-10 is the walkthrough's **second** way (Cmd/Ctrl+Enter sends), in Nicky's commit: "Enter, Shift+Enter
and Alt+Enter keep their meaning". The branches build that, not Enter-sends.

Neither `Field.tsx` nor `sendChord.ts` changed in loops after those commits, so what the branches port is loops' current
text for both.

### Loops' own change, trimmed to the lines that matter

CL-119 `d4cf7397`, the chat's Field line (`apps/web/src/components/bubbles/Bubbles.tsx`; loops' line already carried
`draft.gated` by then, which `a1bed0f` does not have):

```diff
-      <Field control="textarea" autoGrow rows={1} label={t("agents.bubbles.message")} hideLabel … />
+      <Field control="textarea" autoGrow echo rows={1} label={t("agents.bubbles.message")} hideLabel … />
```

and the echo in `apps/web/src/components/primitives/Field.tsx` (the part the world ports word for word; the rest of
the hunk routes the textarea and the input through it):

```tsx
function useEchoValue<E extends HTMLInputElement | HTMLTextAreaElement>(on: boolean, value: unknown, onChange: ((e: ChangeEvent<E>) => void) | undefined) {
  const live = on && typeof value === "string";
  const [shown, setShown] = useState(live ? value : "");
  const [seen, setSeen] = useState(value);
  const [track, setTrack] = useState<{ list: string[]; acked: number }>({ list: [], acked: -1 });
  if (live && value !== seen) {
    setSeen(value);
    const at = track.list.lastIndexOf(value);
    const inFlight = track.list.length - 1 > track.acked;
    if (at > track.acked) setTrack({ list: track.list, acked: at });
    else if (at >= 0 && inFlight) {
      /* an echo older than one already acknowledged, with newer text in flight: stale, ignore */
    } else {
      setTrack({ list: [], acked: -1 });
      setShown(value);
    }
  }
  if (!live) return { value: value as string | undefined, onChange };
  return {
    value: shown,
    onChange: (e: ChangeEvent<E>) => {
      const next = e.target.value;
      setTrack((t) => ({ list: [...t.list, next], acked: t.acked }));
      setShown(next);
      onChange?.(e);
    },
  };
}
```

CL-181 `c7f9d679`, the chat's Field line and Send (`Bubbles.tsx`):

```diff
-import { Button, Card, Chip, Field, Menu } from "../primitives";
+import { Button, Card, Chip, Field, isSendChord, Menu } from "../primitives";
+import { currentPlatform } from "../settings/testNotification";
 …
-      <Field control="textarea" autoGrow echo rows={1} label={t("agents.bubbles.message")} hideLabel placeholder={t("agents.bubbles.message")} value={draft.text} disabled={draft.pending} onChange={(e) => updateDraft({ text: e.target.value })} error={…} />
-      <Button variant="accent" type="submit" disabled={!draft.text.trim() || draft.pending}>{t("agents.bubbles.send")}</Button>
+      <Field control="textarea" autoGrow echo rows={1} hint={narrow ? undefined : t("agents.bubbles.sendHint", { keys: currentPlatform() === "mac" ? "⌘ Enter" : "Ctrl+Enter" })} onKeyDown={(e) => { if (isSendChord(e)) { e.preventDefault(); submit(); } }} label={t("agents.bubbles.message")} hideLabel placeholder={t("agents.bubbles.message")} value={draft.text} disabled={draft.pending} onChange={(e) => updateDraft({ text: e.target.value })} error={…} />
+      <Button variant="accent" type="submit" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={!draft.text.trim() || draft.pending}>{t("agents.bubbles.send")}</Button>
```

with `apps/web/src/components/primitives/sendChord.ts` (whole) and the string `"agents.bubbles.sendHint": "{keys} sends"`:

```ts
export function isSendChord(e: ChordEvent): boolean {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
  const composing = e.isComposing ?? e.nativeEvent?.isComposing;
  const code = e.keyCode ?? e.nativeEvent?.keyCode;
  return !composing && code !== 229;
}
```

Loops' commit message for CL-181 notes the same cause as w5-9: "The handler calls submit() without a closure check on the
draft: the draft lives in the query cache and the closure was a render behind the typing."

## The test that holds it, as loops runs it

Loops runs vitest with Testing Library (`test:unit`) and Playwright (`test:e2e`). The tests that hold the two fixes are
loops' own, in those commits:

- **w5-9:** `Field.caret.test.tsx`, "fast typing is not rolled back by a late echo of an earlier value": an `AsyncOwner`
  whose `onChange` stores the value on `setTimeout(…, 0)` (the query cache's lag, modelled), `user.keyboard("123")` into
  "ab" at caret 1, then `expect(box.value).toBe("a123b")`. That is the walker's case exactly. The Playwright case in
  `bubbles.spec.ts` types with `{ delay: 30 }`, which never showed the fault (30 ms apart everything arrives); a case with
  no delay would hold the walker's finding in the browser too:

  ```ts
  test("keys typed with no pause between them all arrive (walkthrough w5-9)", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    const chat = await openChat(page);
    const box = chat.getByRole("textbox", { name: "Message", exact: true });
    await box.click();
    await page.keyboard.type("Where are you?");
    await expect(box).toHaveValue("Where are you?");
  });
  ```

- **w5-10:** `sendChord.test.ts` (four cases: the two chords send; Enter, Shift+Enter, Alt+Enter and Ctrl+Shift+Enter do not;
  other keys with Ctrl do not; an IME composition never does) and the Playwright case "Ctrl+Enter sends the message, Enter and
  Shift+Enter add a line (desktop shows the hint, a phone does not)".

**Whether they were run.** Not as vitest or Playwright-in-loops: this repository has neither vitest nor Testing Library, and
loops' checkout is not touched. They were run here, on the world's copy, as what this repository has: the four `sendChord`
cases as a node test (`apps/world/test/sendChord.test.ts`, loops' cases word for word), and the walker's two findings as
rows of the walk regress group (`tools/regress/walk.mjs`), red on the base and green on the branches (the numbers below).

## The two prepared branches, and what `do it` merges

The copy rule stays strict: a copy's body must equal loops' file at the header's commit. The one admitted exception is a
**declared divergence**, built on `sugg/w5-9` and present on both branches: the entry of a copy in
`scripts/bubbles-copy.ts` may list records (`why`, `from`, `to`); `from` must be in loops' text exactly once; the check applies
the records to loops' text before it compares, so any other edit still fails, a verbatim copy under a record fails, and a record
whose text loops no longer holds fails with "loops took it or moved the line; re-copy the file and drop the record". The mechanism
lives on these two branches only, not on `feat/world-demo`: merging it loosens the copy rule by exactly these records, and that
is Nicky's call. So `do it` on w5-9 or w5-10 merges, besides the fix:

- the change to `scripts/bubbles-copy.ts` (the records and their application);
- its test, `scripts/test/bubblesCopyDivergence.test.ts`;
- the note in `DESIGN_SYSTEM.md`'s sync rule.

**`sugg/w5-9`** (from `689bc2f9`, tip `53657731`: `6f47a461` reviewed by rd2, then a second commit with a walk row from the review): loops' `echo` ported into the world's own `Field` primitive
(`useEchoValue`, `EchoInput`, `EchoTextarea`, the text of `d4cf7397`), the one word `echo` on the copy's Field line as the
declared divergence, the record, the test and the note. Red first: the walk row "fourteen keys typed with no pause between
them all arrive in the message box" failed on the base with the box holding `"?"` (walk 44/45), green 45/45; the review's
row "after Send the box is empty again, the echo having adopted the draft's reset" is red on a Field that never adopts the
owner's value and green on the tip. Nothing visible changes.

**`sugg/w5-10`** (from w5-9's tip, since both edit the same Field line and the mechanism is built once; tip `20f63b48`: `d459ffe0` reviewed by rd2, then a second commit with a node test from the review): loops'
`isSendChord` ported into the world's primitives (`sendChord.ts`, exported), the i18n line `agents.bubbles.sendHint`, and a
small adapter at `components/settings/testNotification.ts` with loops' `currentPlatform` (the copy's line imports it from
there, as loops' does), so the copy's Field line and Send button can carry loops' own text from `c7f9d679`, as the declared
divergence (the import lines and the two JSX lines, minus `draft.gated`, which `a1bed0f` lacks). Red first: the walk rows
"Enter adds a line and sends nothing" and "Ctrl+Enter sends the lines and empties the box; the hint under the box and
Send's aria-keyshortcuts name the chord" failed on w5-9's tip (walk 46/47, the chord row: sent false, no hint, no `aria-keyshortcuts`), green 47/47. Visible: on desktop a small
hint "⌘ Enter sends" (Mac) or "Ctrl+Enter sends" under the box, loops' own; not on a phone. Pictures:
`docs/images/walkthrough-r64/sugg/w5-10-before.png` and `-after.png`.

**Which carries which.** `w5-10: do it` takes w5-9 with it (w5-9's commit is its base). `w5-9: do it` alone is fine.
`w5-10` alone without w5-9 is not a clean cherry-pick; the Lead's merge plan keeps them in that order.

## The preferred `do it`: `sugg/p2-recopy`

A third branch, built by rd1 in round 69 (tip `02a56791`, review pending with rd2): `Bubbles.tsx` and `queries.ts`
re-copied verbatim at loops `c7f9d679` (the commit that brought both fixes), `sendChord.ts` copied with them, `Menu.tsx`
and the other copies left at `a1bed0f`, and **no divergence records**. It does not change the copy rule: one line adds
`sendChord.ts` to the list in `scripts/bubbles-copy.ts`, and the Bubbles and queries pins (the header lines) move to
`c7f9d679`; the check compares each copy with its own header's commit, as today. It takes the adapters the newer
`Bubbles.tsx` and `queries.ts` need (what loops added on those files between `a1bed0f` and `c7f9d679`), and it takes the
world's `Field` echo from `sugg/w5-9` (`6f47a461`'s `Field.tsx`, byte for byte).

**This is the preferred `do it` for w5-9 and w5-10 together.** `sugg/w5-9` and `sugg/w5-10` are the fallback, with the
declared-divergence mechanism (crewy's rule: it lives on those two branches only, and merging it is Nicky's call).

**State:** <pending> (rd2's review).

## The clean end state

A re-copy of the chat files at a loops commit after `c7f9d679` (design choice P2, `sync`) brings loops' own lines for both
findings: the copy's lines then equal loops' text, the records' `from` text is no longer in loops' file, the check
fails on the stale records, and they are dropped, together with the note's "Today" line. The world's `Field` echo,
`sendChord.ts`, the i18n line and the adapter stay, as the adapters for the copies do. That re-copy also brings the other
14 commits on `Bubbles.tsx` since `a1bed0f` (attachments, the waiting-request card, the dock's open-by-event, the chat
limit…), each of which needs its adapter here first; that is the re-copy's own work, not these branches'.

## If Nicky would rather have Enter send (not loops' choice)

Loops chose Cmd/Ctrl+Enter, with Enter a new line. If Nicky wants Enter to send and Shift+Enter to break the line (the
walkthrough's first way), that is a change to ask of loops, against loops' current text (`sendChord.ts` is unchanged since
`c7f9d679`), and it is explicitly **not** what the branches build:

```diff
--- a/apps/web/src/components/primitives/sendChord.ts
+++ b/apps/web/src/components/primitives/sendChord.ts
-/* The "send" chord of a message box (CL-181): Ctrl+Enter, or Cmd+Enter on a Mac. Plain Enter, Shift+Enter and Alt+Enter keep their
-   meaning (a new line). An IME that confirms a composition with Enter (isComposing, or the legacy keyCode 229) never sends. One rule for
-   the chat, the quick ask and the comment composer. */
+/* The "send" key of a message box: Enter sends; Shift+Enter, Alt+Enter and Ctrl/Cmd+Enter keep a new line. An IME that confirms a
+   composition with Enter (isComposing, or the legacy keyCode 229) never sends. One rule for the chat, the quick ask and the comment
+   composer. */
 export function isSendChord(e: ChordEvent): boolean {
-  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
+  if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
   const composing = e.isComposing ?? e.nativeEvent?.isComposing;
   const code = e.keyCode ?? e.nativeEvent?.keyCode;
   return !composing && code !== 229;
 }
```

with the hint's words, Send's `aria-keyshortcuts` ("Enter") and `sendChord.test.ts`'s expectations turned around, and the
same rule reaching the quick ask and the comment composer, which share it. On a phone, where Enter on the on-screen keyboard
is the usual way to a new line, loops would want to think again; that is one reason loops chose the chord.
