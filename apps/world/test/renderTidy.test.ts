/* Round 30: no DOM churn on a re-render. The icon sprite's `dangerouslySetInnerHTML` value is one module-level object
   (React rewrites the innerHTML only when that identity changes), and the media-query hooks subscribe through one
   function per query made once (`useSyncExternalStore` re-subscribes only when its subscribe function changes identity).
   Unit tests of the identities, since the repository's tests run under node without a DOM; the last test calls the hook
   itself through React's current dispatcher, swapped for a recorder, so it pins what the hook hands React. */
import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactElement } from "react";
import { IconSprite, SPRITE, SPRITE_HTML } from "../src/components/iconSprite.ts";
import { mediaList, mediaRead, mediaSubscribe, useMedia } from "../src/state/media.ts";

/** A window with a `matchMedia` that counts its calls and the listeners on each list. */
const fakeWindow = () => {
  const made: string[] = [];
  const lists = new Map<string, { matches: boolean; listeners: Set<() => void>; addEventListener: (t: string, l: () => void) => void; removeEventListener: (t: string, l: () => void) => void }>();
  const matchMedia = (query: string) => {
    made.push(query);
    const list = {
      matches: query.includes("dark"),
      listeners: new Set<() => void>(),
      addEventListener(type: string, listener: () => void) {
        assert.equal(type, "change");
        list.listeners.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        assert.equal(type, "change");
        list.listeners.delete(listener);
      },
    };
    lists.set(query, list);
    return list;
  };
  (globalThis as { window?: unknown }).window = { matchMedia };
  return { made, lists };
};

test("the icon sprite hands React the same dangerouslySetInnerHTML object on every render", () => {
  const props = (el: ReactElement) => el.props as { dangerouslySetInnerHTML: unknown; style: unknown };
  const first = props(IconSprite());
  const second = props(IconSprite());
  assert.equal(first.dangerouslySetInnerHTML, SPRITE_HTML, "the module-level object");
  assert.equal(second.dangerouslySetInnerHTML, first.dangerouslySetInnerHTML, "the same identity again: no rewrite");
  assert.equal(SPRITE_HTML.__html, SPRITE);
  assert.match(SPRITE, /^<symbol id="i-x" viewBox="0 0 24 24">/);
  assert.equal((SPRITE.match(/<symbol /g) ?? []).length, 9, "the nine symbols");
  assert.equal(first.style, second.style, "the style object is one too");
});

test("media: one MediaQueryList, one subscribe and one read per query; subscribe adds a change listener its cleanup removes", () => {
  const { made, lists } = fakeWindow();
  const query = "(max-width: 899px)";
  assert.equal(mediaSubscribe(query), mediaSubscribe(query), "the same subscribe function every time");
  assert.equal(mediaRead(query), mediaRead(query), "the same read function every time");
  assert.notEqual(mediaSubscribe(query), mediaSubscribe("(prefers-color-scheme: dark)"), "one per query");
  const listener = () => undefined;
  const unsubscribe = mediaSubscribe(query)(listener);
  assert.equal(mediaList(query), mediaList(query));
  assert.deepEqual(made, [query, "(prefers-color-scheme: dark)"].slice(0, made.length), "matchMedia asked once per query");
  assert.equal(made.filter((q) => q === query).length, 1);
  assert.ok(lists.get(query)?.listeners.has(listener), "subscribed");
  assert.equal(mediaRead(query)(), false);
  assert.equal(mediaRead("(prefers-color-scheme: dark)")(), true);
  unsubscribe();
  assert.equal(lists.get(query)?.listeners.size, 0, "the cleanup removed it");
  assert.equal(made.filter((q) => q === query).length, 1, "still one list");
});

test("useMedia hands React the same subscribe function on a re-render (React's dispatcher swapped for a recorder)", () => {
  fakeWindow();
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const before = internals.H;
  const seen: { subscribe: unknown; read: unknown }[] = [];
  internals.H = {
    useSyncExternalStore(subscribe: unknown, read: () => boolean) {
      seen.push({ subscribe, read });
      return read();
    },
  };
  try {
    assert.equal(useMedia("(max-width: 599px)"), false, "the first render reads the list");
    assert.equal(useMedia("(max-width: 599px)"), false, "the second render too");
  } finally {
    internals.H = before;
  }
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.subscribe, seen[1]?.subscribe, "the same subscribe function: no re-subscription");
  assert.equal(seen[0]?.read, seen[1]?.read, "the same read function");
});
