// T15 (EKI-58): permission, question & plan prompts — all answerable inline,
// answered prompts collapse to one-line receipts.
import { mockReducedMotion, TEST_SID } from "./chat-helpers";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionRequest, QuestionRequest } from "@/ipc/bindings";
import { sessionKey, useTranscripts } from "@/stores/transcripts";
import { PromptsArea } from "@/panels/chat/prompts";
import { permissionReceipt } from "@/panels/chat/prompts/PermissionPrompt";

const KEY = sessionKey(TEST_SID);

const PERM: PermissionRequest = {
  request_id: "r1",
  tool: "Edit",
  input_json: `{"file_path":"src/foo.rs","old_string":"a"}`,
  suggestions: [],
};

function question(over: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    request_id: "q1",
    kind: "question",
    text: "Which color?",
    options: ["red", "blue"],
    multi_select: false,
    ...over,
  };
}

beforeEach(() => {
  mockReducedMotion(false);
  useTranscripts.setState({ sessions: {} });
});
afterEach(clearMocks);

describe("PermissionPrompt", () => {
  test("Allow once responds AllowOnce and collapses to a receipt", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      return null;
    });
    useTranscripts.getState().addPermission(TEST_SID, PERM);
    render(<PromptsArea sid={TEST_SID} />);
    expect(screen.getByTestId("permission-prompt")).toHaveTextContent("Edit");
    expect(screen.getByTestId("permission-prompt")).toHaveTextContent('"file_path"');
    await userEvent.click(screen.getByTestId("permission-allow-once"));
    await waitFor(() => expect(screen.queryByTestId("permission-prompt")).not.toBeInTheDocument());
    expect(calls.map((c) => c.cmd)).toEqual(["respond_to_permission"]);
    expect((calls[0]?.args.response as { kind: string }).kind).toBe("AllowOnce");
    expect(screen.getByTestId("prompt-receipt")).toHaveTextContent("✅ allowed Edit on src/foo.rs");
  });

  test("Always allow writes the rule FIRST, then responds AllowAlways", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      if (cmd === "add_permission_rule") return [{ agent_id: null, tool_pattern: "Edit" }];
      return null;
    });
    useTranscripts.getState().addPermission(TEST_SID, PERM);
    render(<PromptsArea sid={TEST_SID} />);
    await userEvent.click(screen.getByTestId("permission-allow-always"));
    await waitFor(() => expect(screen.queryByTestId("permission-prompt")).not.toBeInTheDocument());
    expect(calls.map((c) => c.cmd)).toEqual(["add_permission_rule", "respond_to_permission"]);
    expect((calls[0]?.args.rule as { tool_pattern: string }).tool_pattern).toBe("Edit");
    expect((calls[1]?.args.response as { kind: string }).kind).toBe("AllowAlways");
  });

  test("Deny carries the optional reason", async () => {
    const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      return null;
    });
    useTranscripts.getState().addPermission(TEST_SID, PERM);
    render(<PromptsArea sid={TEST_SID} />);
    await userEvent.click(screen.getByTestId("permission-deny"));
    fireEvent.change(screen.getByTestId("permission-deny-reason"), {
      target: { value: "wrong file" },
    });
    await userEvent.click(screen.getByTestId("permission-deny-confirm"));
    await waitFor(() => expect(screen.queryByTestId("permission-prompt")).not.toBeInTheDocument());
    const resp = calls[0]?.args.response as { kind: string; data: { message: string } };
    expect(resp.kind).toBe("Deny");
    expect(resp.data.message).toBe("wrong file");
    expect(screen.getByTestId("prompt-receipt")).toHaveTextContent("🚫 denied Edit");
  });

  test("long input collapses beyond 20 lines with expand", () => {
    const big = JSON.stringify(Object.fromEntries([...Array(40)].map((_, i) => [`key_${i}`, i])));
    useTranscripts.getState().addPermission(TEST_SID, { ...PERM, input_json: big });
    render(<PromptsArea sid={TEST_SID} />);
    expect(screen.getByTestId("permission-prompt")).not.toHaveTextContent("key_39");
    fireEvent.click(screen.getByTestId("permission-expand"));
    expect(screen.getByTestId("permission-prompt")).toHaveTextContent("key_39");
  });

  test("permissionReceipt phrasing matches the AC", () => {
    expect(permissionReceipt("once", PERM)).toBe("✅ allowed Edit on src/foo.rs");
  });
});

describe("QuestionPrompt", () => {
  test("single-select options answer immediately", async () => {
    const answers: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "answer_question") answers.push((args as { response: unknown }).response);
      return null;
    });
    useTranscripts.getState().addQuestion(TEST_SID, question());
    render(<PromptsArea sid={TEST_SID} />);
    await userEvent.click(screen.getByTestId("question-option-blue"));
    await waitFor(() => expect(screen.queryByTestId("question-prompt")).not.toBeInTheDocument());
    expect(answers).toEqual([{ request_id: "q1", answers: ["blue"] }]);
    expect(screen.getByTestId("prompt-receipt")).toHaveTextContent("✅ answered: blue");
  });

  test("multi-select needs checkboxes + confirm", async () => {
    const answers: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "answer_question") answers.push((args as { response: unknown }).response);
      return null;
    });
    useTranscripts.getState().addQuestion(TEST_SID, question({ multi_select: true }));
    render(<PromptsArea sid={TEST_SID} />);
    expect(screen.getByTestId("question-confirm")).toBeDisabled();
    await userEvent.click(screen.getByTestId("question-check-red"));
    await userEvent.click(screen.getByTestId("question-check-blue"));
    await userEvent.click(screen.getByTestId("question-confirm"));
    await waitFor(() => expect(answers).toEqual([{ request_id: "q1", answers: ["red", "blue"] }]));
  });
});

describe("PlanApproval", () => {
  test("plan kind renders markdown; Approve sends ['approve']", async () => {
    const answers: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "answer_question") answers.push((args as { response: unknown }).response);
      return null;
    });
    useTranscripts
      .getState()
      .addQuestion(
        TEST_SID,
        question({ kind: "plan", text: "# The Plan\n1. do things", options: ["approve", "reject"] }),
      );
    render(<PromptsArea sid={TEST_SID} />);
    expect(screen.getByRole("heading", { name: "The Plan" })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("plan-approve"));
    await waitFor(() => expect(answers).toEqual([{ request_id: "q1", answers: ["approve"] }]));
    expect(screen.getByTestId("prompt-receipt")).toHaveTextContent("✅ plan approved");
  });

  test("Request changes denies with the feedback message", async () => {
    const answers: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "answer_question") answers.push((args as { response: unknown }).response);
      return null;
    });
    useTranscripts.getState().addQuestion(TEST_SID, question({ kind: "plan", text: "plan" }));
    render(<PromptsArea sid={TEST_SID} />);
    await userEvent.click(screen.getByTestId("plan-request-changes"));
    fireEvent.change(screen.getByTestId("plan-feedback"), { target: { value: "use sqlite" } });
    await userEvent.click(screen.getByTestId("plan-feedback-send"));
    await waitFor(() => expect(answers).toEqual([{ request_id: "q1", answers: ["use sqlite"] }]));
  });
});

test("failed respond keeps the prompt pending and shows the error", async () => {
  mockIPC((cmd) => {
    if (cmd === "respond_to_permission") throw new Error("no pending permission r1");
    return null;
  });
  useTranscripts.getState().addPermission(TEST_SID, PERM);
  render(<PromptsArea sid={TEST_SID} />);
  await userEvent.click(screen.getByTestId("permission-allow-once"));
  await screen.findByTestId("permission-error");
  expect(screen.getByTestId("permission-prompt")).toBeInTheDocument();
  expect(useTranscripts.getState().sessions[KEY]?.pendingPermissions).toHaveLength(1);
});
