/* The style's data models (../models/<key>.json, parts-JSON), validated on first use. Validating all 171 at import cost
   ~30 ms on the road to the first frame, before the scene existed, for models most towns never draw. A file that is not
   a valid crewhub-prop/1 model is reported the first time it is asked for, as it was at import, and skipped from then on
   (the code model or an empty group stands in, as before); the test suite validates every file at test time. */
import { validatePropModel, type PropModel } from "@crewhub/world-engine";

export class ModelStore {
  readonly #raw: ReadonlyMap<string, unknown>;
  readonly #checked = new Map<string, PropModel | null>();
  readonly #warn: (name: string, errors: unknown) => void;

  /** `raw` is the parsed JSON by model name (`<key>` or `<key>.<variant>`); `warn` reports an invalid one, once. */
  constructor(raw: ReadonlyMap<string, unknown>, warn: (name: string, errors: unknown) => void = (name, errors) => console.warn(`Greenhouse style: ${name}.json is not a valid crewhub-prop/1 model`, errors)) {
    this.#raw = raw;
    this.#warn = warn;
  }

  /** The names the store knows (valid or not). */
  names(): string[] {
    return [...this.#raw.keys()];
  }

  /** The validated model, or undefined when there is no file of that name or the file does not validate. */
  get(name: string): PropModel | undefined {
    const known = this.#checked.get(name);
    if (known !== undefined) return known ?? undefined;
    if (!this.#raw.has(name)) return undefined;
    const checked = validatePropModel(this.#raw.get(name));
    if (!checked.ok) this.#warn(name, checked.errors);
    this.#checked.set(name, checked.ok ? checked.value : null);
    return checked.ok ? checked.value : undefined;
  }
}
