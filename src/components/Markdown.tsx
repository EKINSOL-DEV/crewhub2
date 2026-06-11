// Shared markdown renderer (D-M2-5): react-markdown + remark-gfm — no raw
// HTML, so sanitization holds by construction. Code blocks highlight via
// lazily imported shiki (per-language, on demand); until (or unless) shiki
// resolves, a plain <pre> renders so nothing ever blocks on the highlighter.
import "./markdown.css";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

let shikiModule: Promise<typeof import("shiki")> | null = null;

async function highlight(code: string, lang: string): Promise<string | null> {
  shikiModule ??= import("shiki");
  const { codeToHtml, bundledLanguages } = await shikiModule;
  if (!(lang in bundledLanguages)) return null;
  return codeToHtml(code, { lang, theme: "github-dark-default" });
}

/** Shared shiki code block (exported for the diff panel — same lazy loader). */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [highlighted, setHighlighted] = useState<{ code: string; lang: string; html: string } | null>(null);
  useEffect(() => {
    let live = true;
    highlight(code, lang)
      .then((h) => {
        if (live && h !== null) setHighlighted({ code, lang, html: h });
      })
      .catch(() => {
        /* highlighter unavailable — the fallback <pre> already renders */
      });
    return () => {
      live = false;
    };
  }, [code, lang]);
  // Stale results (props changed while shiki ran) fall back to plain <pre>.
  const html =
    highlighted && highlighted.code === code && highlighted.lang === lang ? highlighted.html : null;

  if (html) {
    // shiki output is generated from plain text with full escaping — safe.
    return <div data-testid="code-block" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <pre data-testid="code-block">
      <code>{code}</code>
    </pre>
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("ch-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { children, className: cls, node, ...rest } = props;
            void node;
            const lang = /language-(\w+)/.exec(cls ?? "")?.[1];
            const raw = String(children ?? "");
            // Fenced/indented blocks contain newlines or carry a language class.
            if (lang !== undefined || raw.includes("\n")) {
              return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang ?? "text"} />;
            }
            return (
              <code className={cls} {...rest}>
                {children}
              </code>
            );
          },
          // Block-level code is rendered by CodeBlock; drop the outer <pre>.
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
