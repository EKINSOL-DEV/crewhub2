// M2 T4: PermissionCard + QuestionCard. Stores/bindings are mocked wholesale
// (per the M2 dispatch, same shape as chat-window.test.tsx) — this exercises
// the answer flows (which command fires, in what order, what receipt lands),
// not the real transcripts/bindings store stitch.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PermissionRequest, QuestionRequest, SessionId } from "@/ipc/bindings";

const { respondToPermissionSpy, answerQuestionSpy, addPermissionRuleSpy, resolvePromptSpy, bindings } =
  vi.hoisted(() => ({
    respondToPermissionSpy: vi.fn(async () => ({ status: "ok" as const, data: null })),
    answerQuestionSpy: vi.fn(async () => ({ status: "ok" as const, data: null })),
    addPermissionRuleSpy: vi.fn(async () => ({ status: "ok" as const, data: [] })),
    resolvePromptSpy: vi.fn(),
    bindings: {} as Record<string, { agent_id: string | null }>,
  }));

vi.mock("@/ipc/bindings", () => ({
  commands: {
    respondToPermission: respondToPermissionSpy,
    answerQuestion: answerQuestionSpy,
    addPermissionRule: addPermissionRuleSpy,
  },
}));

vi.mock("@/stores/transcripts", () => ({
  useTranscripts: (selector: (s: { resolvePrompt: typeof resolvePromptSpy }) => unknown) =>
    selector({ resolvePrompt: resolvePromptSpy }),
}));

vi.mock("@/stores/bindings", () => ({
  useBindingsStore: (selector: (s: { bindings: typeof bindings }) => unknown) => selector({ bindings }),
}));

import { PermissionCard } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";

const SID: SessionId = { provider: "claude", id: "s1" };
const CARD_PROPS = { sid: SID, name: "Rex", color: "#22c55e" };

function permissionReq(over: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    request_id: "req-1",
    tool: "Bash",
    input_json: JSON.stringify({ command: "pnpm test" }),
    suggestions: [],
    ...over,
  };
}

function questionReq(over: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    request_id: "q-1",
    kind: "question",
    text: "Which approach?",
    options: ["A", "B"],
    multi_select: false,
    ...over,
  };
}

beforeEach(() => {
  respondToPermissionSpy.mockClear();
  answerQuestionSpy.mockClear();
  addPermissionRuleSpy.mockClear();
  resolvePromptSpy.mockClear();
  for (const k of Object.keys(bindings)) delete bindings[k];
});

describe("PermissionCard", () => {
  it("allow once: respondToPermission({kind:AllowOnce}) then resolvePrompt with a receipt mentioning the tool", async () => {
    const req = permissionReq();
    render(<PermissionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("permission-card-allow-once"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(respondToPermissionSpy).toHaveBeenCalledWith(SID, "req-1", { kind: "AllowOnce" });
    const [, , receipt] = resolvePromptSpy.mock.calls[0] as [SessionId, string, string];
    expect(receipt).toContain("Bash");
  });

  it("hides Always allow when no agent is bound to the session", () => {
    render(<PermissionCard {...CARD_PROPS} req={permissionReq()} />);
    expect(screen.queryByTestId("permission-card-allow-always")).not.toBeInTheDocument();
  });

  it("always allow: addPermissionRule writes the rule before respondToPermission({kind:AllowAlways})", async () => {
    bindings["s1"] = { agent_id: "agent-42" };
    const req = permissionReq();
    render(<PermissionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("permission-card-allow-always"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(addPermissionRuleSpy).toHaveBeenCalledWith({ agent_id: "agent-42", tool_pattern: "Bash" });
    expect(respondToPermissionSpy).toHaveBeenCalledWith(SID, "req-1", { kind: "AllowAlways" });
    const [ruleOrder] = addPermissionRuleSpy.mock.invocationCallOrder;
    const [respondOrder] = respondToPermissionSpy.mock.invocationCallOrder;
    expect(ruleOrder).toBeDefined();
    expect(respondOrder).toBeDefined();
    expect(ruleOrder!).toBeLessThan(respondOrder!);
  });

  it("deny with a reason: respondToPermission({kind:Deny, data:{message}})", async () => {
    const req = permissionReq();
    render(<PermissionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("permission-card-deny"));
    fireEvent.change(screen.getByTestId("permission-card-deny-reason"), {
      target: { value: "not safe here" },
    });
    fireEvent.click(screen.getByTestId("permission-card-deny-confirm"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(respondToPermissionSpy).toHaveBeenCalledWith(SID, "req-1", {
      kind: "Deny",
      data: { message: "not safe here" },
    });
  });

  it("deny with no reason sends a null message", async () => {
    const req = permissionReq();
    render(<PermissionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("permission-card-deny"));
    fireEvent.click(screen.getByTestId("permission-card-deny-confirm"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(respondToPermissionSpy).toHaveBeenCalledWith(SID, "req-1", {
      kind: "Deny",
      data: { message: null },
    });
  });
});

describe("QuestionCard", () => {
  it("single-select: clicking an option answers with just that option", async () => {
    const req = questionReq();
    render(<QuestionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("question-card-option-B"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(answerQuestionSpy).toHaveBeenCalledWith(SID, { request_id: "q-1", answers: ["B"] });
  });

  it("multi-select: confirm sends every toggled option", async () => {
    const req = questionReq({ options: ["A", "B", "C"], multi_select: true });
    render(<QuestionCard {...CARD_PROPS} req={req} />);
    fireEvent.click(screen.getByTestId("question-card-chip-A"));
    fireEvent.click(screen.getByTestId("question-card-chip-C"));
    fireEvent.click(screen.getByTestId("question-card-confirm"));
    await waitFor(() => expect(resolvePromptSpy).toHaveBeenCalledTimes(1));
    expect(answerQuestionSpy).toHaveBeenCalledWith(SID, { request_id: "q-1", answers: ["A", "C"] });
  });

  it("multi-select: Confirm stays disabled until something is picked", () => {
    const req = questionReq({ multi_select: true });
    render(<QuestionCard {...CARD_PROPS} req={req} />);
    expect(screen.getByTestId("question-card-confirm")).toBeDisabled();
  });

  it('kind "plan" renders a plan header instead of "asks:"', () => {
    render(<QuestionCard {...CARD_PROPS} req={questionReq({ kind: "plan", text: "Ship it?" })} />);
    expect(screen.getByText(/proposes a plan:/)).toBeInTheDocument();
    expect(screen.queryByText(/Rex asks:/)).not.toBeInTheDocument();
  });
});
