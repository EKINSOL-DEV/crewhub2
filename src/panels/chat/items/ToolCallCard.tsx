import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ToolResultData, ToolUseData } from "../render-list";
import { clampLines, prettyJson, toolChip, toolSummary } from "./tool-meta";

const INPUT_FOLD_LINES = 20;
const OUTPUT_FOLD_LINES = 8;

export interface ToolCallCardProps {
  use: ToolUseData | null;
  result: ToolResultData | null;
}

/** ToolUse + joined ToolResult as one card: chip, foldable input/output, error edge. */
export function ToolCallCard({ use, result }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const [showAllOutput, setShowAllOutput] = useState(false);
  const tool = use?.tool ?? "tool result";
  const isError = result?.is_error ?? false;
  const summary = use ? toolSummary(use.input_json) : "";
  const status = result === null ? "⏳" : isError ? "❌" : "✅";

  const input = use ? prettyJson(use.input_json) : null;
  const inputClamp = input !== null ? clampLines(input, INPUT_FOLD_LINES) : null;
  const [showAllInput, setShowAllInput] = useState(false);

  const output = result ? clampLines(result.output_preview, OUTPUT_FOLD_LINES) : null;

  return (
    <div className="px-3 py-1" data-testid="tool-card" data-error={isError || undefined}>
      <div
        className={cn(
          "rounded-lg border border-border border-l-4 bg-card/60 text-xs",
          isError ? "border-l-destructive" : "border-l-border",
        )}
      >
        <button
          type="button"
          data-testid="tool-card-header"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{toolChip(tool)}</span>
          <span className="font-medium">{tool}</span>
          {summary && <span className="truncate font-mono text-muted-foreground">{summary}</span>}
          <span
            className="ml-auto"
            data-testid="tool-card-status"
            aria-label={result === null ? "running" : isError ? "failed" : "done"}
          >
            {status}
          </span>
        </button>
        {open && (
          <div className="border-t border-border px-3 py-2" data-testid="tool-card-body">
            {inputClamp && (
              <>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
                  {showAllInput ? input : inputClamp.text}
                </pre>
                {inputClamp.clamped && (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => setShowAllInput((v) => !v)}
                  >
                    {showAllInput ? "fold input" : "show full input"}
                  </button>
                )}
              </>
            )}
            {output && (
              <div className="mt-2" data-testid="tool-card-output">
                <div className="mb-1 text-muted-foreground">{isError ? "error" : "output"}</div>
                <pre
                  className={cn(
                    "overflow-x-auto whitespace-pre-wrap font-mono",
                    isError && "text-destructive",
                  )}
                >
                  {showAllOutput ? result?.output_preview : output.text}
                </pre>
                {output.clamped && (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => setShowAllOutput((v) => !v)}
                  >
                    {showAllOutput ? "fold output" : "show full output"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
