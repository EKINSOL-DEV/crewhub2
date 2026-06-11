// Docs panel (M3 T9, EKI-89): tree → markdown with chat-grade fidelity,
// relative images as data URLs, in-tree link navigation with history/back,
// the 🍂 missing-page leaf, external links that never navigate the webview,
// and the Quiet docs empty states.
import { useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import type { DocEntry } from "@/ipc/bindings";
import DocsPanel from "@/panels/docs/DocsPanel";
import { resetWorkspaceForTests, useWorkspace } from "@/stores/workspace";
import { project, seedWorkspace } from "./fixtures";

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  resetProjectsForTests();
  resetWorkspaceForTests();
});

function Harness({ initial }: { initial?: Record<string, string> }) {
  const [params, setParams] = useState<Record<string, string>>(initial ?? {});
  return <DocsPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

const TREE: DocEntry[] = [
  { rel_path: "assets", name: "assets", is_dir: true },
  { rel_path: "assets/pic.png", name: "pic.png", is_dir: false },
  { rel_path: "guides", name: "guides", is_dir: true },
  { rel_path: "guides/setup.md", name: "setup.md", is_dir: false },
  { rel_path: "README.md", name: "README.md", is_dir: false },
];

const README = [
  "# Hello Docs",
  "",
  "See [setup](guides/setup.md), [gone](missing.md) and [the site](https://example.com).",
  "",
  "![logo](assets/pic.png)",
].join("\n");

function mockDocsWorld(opts?: { tree?: DocEntry[]; treeError?: string }) {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "list_projects":
        return [
          project({ id: "p-1", name: "proj", folder_path: "/work/proj", docs_path: "/work/proj/docs" }),
        ];
      case "list_doc_tree":
        if (opts?.treeError) throw opts.treeError;
        return opts?.tree ?? TREE;
      case "read_doc_file": {
        const rel = (args as { relPath: string }).relPath;
        if (rel === "README.md") return README;
        if (rel === "guides/setup.md") return "# Setup\n\nBack to [readme](../README.md)";
        throw `no such doc: ${rel}`;
      }
      case "read_doc_image":
        return { media_type: "image/png", base64: "QUJD" };
      case "plugin:clipboard-manager|write_text":
        return null;
      default:
        return null;
    }
  });
  return calls;
}

test("no project picked → Quiet docs empty state (D-M3-8 copy)", async () => {
  mockIPC((cmd) => (cmd === "list_projects" ? [] : null));
  render(<Harness />);
  await screen.findByText("No docs yet");
});

test("empty tree → 'point me at a folder' empty state", async () => {
  mockDocsWorld({ tree: [] });
  render(<Harness initial={{ projectId: "p-1" }} />);
  await screen.findByText("No docs yet — point me at a folder");
});

test("markdown + relative image render from the fixture tree (EKI-89 AC)", async () => {
  mockDocsWorld();
  render(<Harness initial={{ projectId: "p-1" }} />);

  fireEvent.click(await screen.findByTestId("doc-file-README.md"));
  await screen.findByText("Hello Docs");

  // relative image resolved through read_doc_image as a data URL
  await waitFor(() => {
    const img = screen.getByAltText("logo");
    expect(img).toHaveAttribute("src", "data:image/png;base64,QUJD");
  });

  // breadcrumbs: root + file
  const nav = screen.getByTestId("doc-breadcrumbs");
  expect(nav.textContent).toContain("proj");
  expect(nav.textContent).toContain("README.md");
});

test("in-tree links navigate with history; ../ links and back both work", async () => {
  mockDocsWorld();
  render(<Harness initial={{ projectId: "p-1" }} />);
  fireEvent.click(await screen.findByTestId("doc-file-README.md"));
  await screen.findByText("Hello Docs");

  fireEvent.click(screen.getByText("setup"));
  await screen.findByText("Setup");
  expect(screen.getByTestId("doc-breadcrumbs").textContent).toContain("guides");

  // ../README.md resolves back up the tree
  fireEvent.click(screen.getByText("readme"));
  await screen.findByText("Hello Docs");

  // back unwinds the history stack (⌘[ shares the same handler)
  fireEvent.click(screen.getByLabelText("Back"));
  await screen.findByText("Setup");
});

test("missing target → 🍂 that page isn't there; back recovers", async () => {
  mockDocsWorld();
  render(<Harness initial={{ projectId: "p-1" }} />);
  fireEvent.click(await screen.findByTestId("doc-file-README.md"));
  await screen.findByText("Hello Docs");

  fireEvent.click(screen.getByText("gone"));
  await screen.findByText("That page isn't there");
  expect(screen.getByText(/missing\.md/)).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Back"));
  await screen.findByText("Hello Docs");
});

test("external links copy instead of navigating the webview (D-M3-7)", async () => {
  const calls = mockDocsWorld();
  render(<Harness initial={{ projectId: "p-1" }} />);
  fireEvent.click(await screen.findByTestId("doc-file-README.md"));
  await screen.findByText("Hello Docs");

  fireEvent.click(screen.getByText("the site"));
  await screen.findByText(/link copied/);
  const copied = calls.find((c) => c.cmd === "plugin:clipboard-manager|write_text");
  expect((copied?.args as { text: string }).text).toBe("https://example.com");
});

test("dirs collapse/expand; clicking an image file shows the image view", async () => {
  mockDocsWorld();
  render(<Harness initial={{ projectId: "p-1" }} />);
  // top-level dirs start open; first click collapses, second reopens
  fireEvent.click(await screen.findByTestId("doc-dir-assets"));
  expect(screen.queryByTestId("doc-file-assets/pic.png")).toBeNull();
  fireEvent.click(screen.getByTestId("doc-dir-assets"));
  fireEvent.click(await screen.findByTestId("doc-file-assets/pic.png"));
  const img = await screen.findByTestId("doc-image-view");
  expect(img).toHaveAttribute("src", "data:image/png;base64,QUJD");
});

test("project defaults from the tab filter (useProjectFilter aware)", async () => {
  const calls = mockDocsWorld();
  useProjects.setState({
    projects: [project({ id: "p-1", name: "proj", folder_path: "/work/proj" })],
    loaded: true,
  });
  useWorkspace.getState().setProjectFilter("p-1");
  render(<Harness />);
  await screen.findByTestId("doc-tree");
  expect(
    calls.some((c) => c.cmd === "list_doc_tree" && (c.args as { projectId: string }).projectId === "p-1"),
  ).toBe(true);
});

test("tree read failure degrades to the polite empty state, not an error wall", async () => {
  mockDocsWorld({ treeError: "docs root is not readable" });
  render(<Harness initial={{ projectId: "p-1" }} />);
  await screen.findByText("No docs yet — point me at a folder");
  await screen.findByText("docs root is not readable");
});
