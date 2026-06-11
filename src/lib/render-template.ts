// One {{var}} substitution syntax shared by templates, sequence steps and the
// composer (M4 D-M4-8). This is the TS twin of Rust's
// `orchestrator::substitute::substitute` — BOTH are tested against
// `src-tauri/fixtures/substitution-contract.json`; any drift is a red test.

/** Reserved variable name carrying the prior sequence step's result text. */
export const PREVIOUS_OUTPUT_VAR = "previous_output";

/**
 * Replace every `{{name}}` in `template` from `vars`. A missing variable is a
 * thrown Error (`unknown variable {{name}}`), never a silent empty string.
 * Unterminated `{{` (and loose `}}`) are literal text.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = "";
  let rest = template;
  for (;;) {
    const start = rest.indexOf("{{");
    if (start === -1) break;
    const after = rest.slice(start + 2);
    const end = after.indexOf("}}");
    if (end === -1) break; // unterminated — remainder is literal
    const name = after.slice(0, end).trim();
    if (!(name in vars)) {
      throw new Error(`unknown variable {{${name}}}`);
    }
    out += rest.slice(0, start) + vars[name];
    rest = after.slice(end + 2);
  }
  return out + rest;
}

/** Variable names referenced by a template, unique, in order of appearance. */
export function referencedVariables(template: string): string[] {
  const names: string[] = [];
  let rest = template;
  for (;;) {
    const start = rest.indexOf("{{");
    if (start === -1) break;
    const after = rest.slice(start + 2);
    const end = after.indexOf("}}");
    if (end === -1) break;
    const name = after.slice(0, end).trim();
    if (name && !names.includes(name)) names.push(name);
    rest = after.slice(end + 2);
  }
  return names;
}
