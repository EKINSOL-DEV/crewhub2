// The Rust↔TS substitution contract (M4 T8, D-M4-8): this vitest checks
// `renderTemplate` against the SAME fixture file the Rust test checks
// `orchestrator::substitute::substitute` against. Drift on either side = red.

import { describe, expect, it } from "vitest";
import contract from "../../src-tauri/fixtures/substitution-contract.json";
import { PREVIOUS_OUTPUT_VAR, referencedVariables, renderTemplate } from "../lib/render-template";

type ContractCase = {
  name: string;
  template: string;
  vars: Record<string, string>;
  expected?: string;
  error?: string;
};

describe("renderTemplate ↔ Rust substitute contract", () => {
  const cases = contract.cases as ContractCase[];

  it("has a meaningful contract to check", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of cases) {
    it(c.name, () => {
      if (c.error !== undefined) {
        expect(() => renderTemplate(c.template, c.vars)).toThrowError(c.error);
      } else {
        expect(renderTemplate(c.template, c.vars)).toBe(c.expected);
      }
    });
  }
});

describe("referencedVariables", () => {
  it("lists unique names in order", () => {
    expect(referencedVariables("{{b}} {{a}} {{b}} {{ previous_output }}")).toEqual([
      "b",
      "a",
      PREVIOUS_OUTPUT_VAR,
    ]);
    expect(referencedVariables("none")).toEqual([]);
  });
});
