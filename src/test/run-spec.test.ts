import { actionLabel, parseRunSpec, specEmoji, specSummary } from "@/panels/automation/run-spec";

describe("parseRunSpec (parse-tolerant read of the D-M4-5 tagged union)", () => {
  test("prompt spec round-trips", () => {
    const spec = parseRunSpec(
      JSON.stringify({ action: "prompt", project_path: "/p", prompt: "hi", model: "haiku" }),
    );
    expect(spec).toEqual({ action: "prompt", project_path: "/p", prompt: "hi", model: "haiku" });
  });

  test("sequence spec keeps steps", () => {
    const spec = parseRunSpec(
      JSON.stringify({
        action: "sequence",
        steps: [
          { project_path: "/p", prompt: "a" },
          { project_path: "/p", prompt: "use {{previous_output}}", model: "sonnet" },
        ],
      }),
    );
    expect(spec?.action).toBe("sequence");
    if (spec?.action === "sequence") expect(spec.steps).toHaveLength(2);
  });

  test("standup spec tolerates missing fields", () => {
    expect(parseRunSpec(JSON.stringify({ action: "standup" }))).toEqual({
      action: "standup",
      agent_ids: null,
      title: null,
    });
  });

  test("garbage never throws — it returns null", () => {
    expect(parseRunSpec("not json")).toBeNull();
    expect(parseRunSpec("42")).toBeNull();
    expect(parseRunSpec('{"action":"unknown_future_thing"}')).toBeNull();
    expect(parseRunSpec('{"action":"prompt"}')).toBeNull(); // missing fields
    expect(parseRunSpec('{"action":"sequence","steps":[{"nope":1}]}')).toBeNull();
  });

  test("summaries and emoji for every shape, incl. unreadable", () => {
    expect(
      specSummary(parseRunSpec('{"action":"prompt","project_path":"/p","prompt":"line one\\nline two"}')),
    ).toBe("line one");
    expect(
      specSummary(parseRunSpec('{"action":"sequence","steps":[{"project_path":"/p","prompt":"a"}]}')),
    ).toBe("1 step — a");
    expect(specSummary(parseRunSpec('{"action":"standup","title":"Daily","agent_ids":["a","b"]}'))).toBe(
      "Daily · 2 agents",
    );
    expect(specSummary(parseRunSpec('{"action":"standup"}'))).toBe("Standup · all agents");
    expect(specSummary(null)).toBe("(unreadable spec)");
    expect(specEmoji(null)).toBe("❓");
    expect(actionLabel(null)).toBe("unknown");
  });

  test("long prompts truncate with an ellipsis", () => {
    const long = "x".repeat(100);
    const s = specSummary(
      parseRunSpec(JSON.stringify({ action: "prompt", project_path: "/p", prompt: long })),
    );
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("…")).toBe(true);
  });
});
