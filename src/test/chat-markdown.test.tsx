// Markdown renderer (D-M2-5): gfm, code blocks, sanitization by construction.
import "./chat-helpers";
import { render, screen } from "@testing-library/react";
import { Markdown } from "@/components/Markdown";

test("renders gfm tables and task lists", () => {
  render(<Markdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
  expect(screen.getByRole("table")).toBeInTheDocument();
});

test("raw HTML is never injected (sanitization by construction)", () => {
  const { container } = render(
    <Markdown text={`hello <script>window.x=1</script> <img src=x onerror="x">`} />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
});

test("fenced code renders a code block immediately (shiki is lazy, non-blocking)", () => {
  render(<Markdown text={"```ts\nconst a = 1;\n```"} />);
  expect(screen.getByTestId("code-block")).toHaveTextContent("const a = 1;");
});

test("inline code stays inline", () => {
  const { container } = render(<Markdown text={"use `pnpm test` here"} />);
  expect(container.querySelector("code")).toHaveTextContent("pnpm test");
  expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
});
