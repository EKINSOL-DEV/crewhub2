/* A viewer's setting kept in this browser, one module (round 60, pg-P1). A setting brings its key, how a stored text
   reads (`parse`) and how a value is stored (`format`, null removes it); this module owns the rest, the same way for
   all of them:
   - storage may throw, reading `localStorage` itself included (private mode, blocked site data): a read then answers
     what nothing stored answers (`parse(null)`), and the choice lasts for this page only;
   - one value per page, read once and kept (`now`), changed by `set` (kept, stored, and the listeners told);
   - one stable `subscribe` per setting, so `use` never re-subscribes on a render (the churn state/media.ts names).
   `storedValue` is the read and the write alone, for a value something else keeps once it is read. Storage keys are the
   settings' own: the tools set them too (tools/lib/world.mjs `castChoice`, perf.mjs). */
import { useSyncExternalStore } from "react";

type Reads = Pick<Storage, "getItem">;
type Writes = Pick<Storage, "setItem"> & Partial<Pick<Storage, "removeItem">>;
/** Where to read or write: unsaid, the page's `localStorage`; null, nowhere; a function is asked inside the `try`. */
type From<S> = S | null | (() => S | null);

const resolve = <S>(storage: From<S> | undefined): S | null | undefined =>
  storage === undefined ? (globalThis.localStorage as S | undefined) : typeof storage === "function" ? (storage as () => S | null)() : storage;

export interface StoredValueConfig<T> {
  key: string;
  /** The value of a stored text; null when nothing is stored, and that answer is also what a storage that throws reads. */
  parse: (text: string | null) => T;
  /** The text to store; null removes the key. */
  format: (value: T) => string | null;
}

export interface StoredValue<T> {
  readonly key: string;
  read(storage?: From<Reads>): T;
  write(value: T, storage?: From<Writes>): void;
}

export function storedValue<T>({ key, parse, format }: StoredValueConfig<T>): StoredValue<T> {
  return {
    key,
    read(storage) {
      try {
        return parse(resolve(storage)?.getItem(key) ?? null);
      } catch {
        return parse(null);
      }
    },
    write(value, storage) {
      try {
        const text = format(value);
        const target = resolve(storage);
        if (text === null) target?.removeItem?.(key);
        else target?.setItem(key, text);
      } catch {
        // Not kept: storage is unavailable.
      }
    },
  };
}

export interface SettingConfig<T> extends StoredValueConfig<T> {
  /** What wins over storage for this page until the viewer sets the value (the address bar's `?rooms=`); null for nothing. */
  override?: () => T | null;
}

export interface Setting<T> extends StoredValue<T> {
  /** The value in force on this page: read once, then what `set` was given. */
  now(): T;
  /** Changes the value on this page and in storage, then tells the listeners. */
  set(value: T): void;
  subscribe(listener: () => void): () => void;
  /** `now()` as a React hook. */
  use(): T;
}

export function createSetting<T>(config: SettingConfig<T>): Setting<T> {
  const stored = storedValue(config);
  const read: StoredValue<T>["read"] = (storage) => config.override?.() ?? stored.read(storage);
  let known = false;
  let current: T;
  const listeners = new Set<() => void>();
  const now = () => {
    if (!known) {
      current = read();
      known = true;
    }
    return current;
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return {
    key: config.key,
    read,
    write: stored.write,
    now,
    set(value) {
      current = value;
      known = true;
      stored.write(value);
      for (const listener of listeners) listener();
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, now),
  };
}

/** An on or off choice, off unless the viewer said on. */
export const onOff = {
  parse: (text: string | null) => text === "on",
  format: (on: boolean) => (on ? "on" : "off"),
};

/** One of a list of choices, stored as itself; anything else reads as the fallback. */
export const oneOfChoices = <T extends string>(choices: readonly T[], fallback: T) => ({
  parse: (text: string | null): T => (choices.includes(text as T) ? (text as T) : fallback),
  format: (value: T): string => value,
});

/** Flips an on or off setting; answers the new value. */
export function toggle(setting: Setting<boolean>): boolean {
  const next = !setting.now();
  setting.set(next);
  return next;
}
