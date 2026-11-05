/* What should take the focus once a page the chip loaded is back (round 65, walk finding w5-18): choosing a scenario in
   the Demo chip's menu loads that scenario's page (its own source and town document), and nothing was focused
   afterwards, so a keyboard person started from nowhere. The chip remembers, in this tab's storage, that the Demo chip
   takes the focus; the new page takes the note once. Storage may throw, reading `sessionStorage` itself included (a
   private window, blocked site data), so it is asked for inside the `try`, as state/setting.ts does: then there is
   nothing to remember and nothing to focus. Pure over the storage it is given. */
const KEY = "crewhub-world:focus-after-reload";

/** The one thing a loaded page knows to focus. */
export type FocusAfterReload = "demo-chip";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberFocus(storage: () => Pick<Store, "setItem">, what: FocusAfterReload): void {
  try {
    storage().setItem(KEY, what);
  } catch {
    // no storage: the page loads with nothing focused, as before
  }
}

/** The note, taken (cleared) so a later plain reload focuses nothing; null for none or one this build does not know. */
export function takeFocus(storage: () => Pick<Store, "getItem" | "removeItem">): FocusAfterReload | null {
  try {
    const store = storage();
    const value = store.getItem(KEY);
    if (value === null) return null;
    store.removeItem(KEY);
    return value === "demo-chip" ? value : null;
  } catch {
    return null;
  }
}
