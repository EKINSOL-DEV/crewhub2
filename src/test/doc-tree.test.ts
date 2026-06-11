// Pure docs logic (M3 T9, EKI-89): tree fold, relative-link resolution,
// breadcrumbs, extension checks, and the data-URL image cache.
import type { DocEntry } from "@/ipc/bindings";
import { DocImageCache, docImageDataUrl } from "@/panels/docs/doc-image-cache";
import {
  buildDocTree,
  crumbs,
  isExternalHref,
  isImagePath,
  isMarkdownPath,
  resolveRelative,
  splitHref,
} from "@/panels/docs/doc-tree";

function entry(rel_path: string, is_dir = false): DocEntry {
  return { rel_path, name: rel_path.split("/").pop() ?? rel_path, is_dir };
}

describe("buildDocTree", () => {
  test("folds the flat list into nesting, preserving per-parent order", () => {
    const tree = buildDocTree([
      entry("guides", true),
      entry("guides/deep", true),
      entry("guides/deep/inner.md"),
      entry("guides/setup.md"),
      entry("README.md"),
      entry("logo.png"),
    ]);
    expect(tree.map((n) => n.entry.rel_path)).toEqual(["guides", "README.md", "logo.png"]);
    const guides = tree[0];
    expect(guides?.children.map((n) => n.entry.rel_path)).toEqual(["guides/deep", "guides/setup.md"]);
    expect(guides?.children[0]?.children[0]?.entry.rel_path).toBe("guides/deep/inner.md");
  });

  test("orphans (missing parent dirs) attach to the root instead of vanishing", () => {
    const tree = buildDocTree([entry("ghost/file.md")]);
    expect(tree.map((n) => n.entry.rel_path)).toEqual(["ghost/file.md"]);
  });

  test("empty input → empty tree", () => {
    expect(buildDocTree([])).toEqual([]);
  });
});

describe("resolveRelative (in-tree markdown links)", () => {
  test("sibling, ./, nested and ../ references", () => {
    expect(resolveRelative("guides/setup.md", "install.md")).toBe("guides/install.md");
    expect(resolveRelative("guides/setup.md", "./install.md")).toBe("guides/install.md");
    expect(resolveRelative("guides/setup.md", "deep/inner.md")).toBe("guides/deep/inner.md");
    expect(resolveRelative("guides/setup.md", "../README.md")).toBe("README.md");
    expect(resolveRelative("README.md", "guides/setup.md")).toBe("guides/setup.md");
  });

  test("fragments resolve to the path; pure-fragment links stay on the doc", () => {
    expect(resolveRelative("guides/setup.md", "install.md#step-2")).toBe("guides/install.md");
    expect(resolveRelative("guides/setup.md", "#anchor")).toBe("guides/setup.md");
  });

  test("escapes and absolutes are null — politely impossible", () => {
    expect(resolveRelative("README.md", "../outside.md")).toBeNull();
    expect(resolveRelative("guides/setup.md", "../../../etc/passwd")).toBeNull();
    expect(resolveRelative("README.md", "/abs/path.md")).toBeNull();
    expect(resolveRelative("README.md", "https://example.com/x.md")).toBeNull();
  });
});

test("splitHref and isExternalHref", () => {
  expect(splitHref("a.md#x")).toEqual({ path: "a.md", hash: "#x" });
  expect(splitHref("a.md")).toEqual({ path: "a.md", hash: "" });
  expect(isExternalHref("https://x.dev")).toBe(true);
  expect(isExternalHref("mailto:hi@x.dev")).toBe(true);
  expect(isExternalHref("./local.md")).toBe(false);
  expect(isExternalHref("local.md")).toBe(false);
});

test("extension checks mirror the backend whitelist", () => {
  expect(isMarkdownPath("a/b.md")).toBe(true);
  expect(isMarkdownPath("a/b.MARKDOWN")).toBe(true);
  expect(isMarkdownPath("a/b.png")).toBe(false);
  for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg"]) {
    expect(isImagePath(`x.${ext}`)).toBe(true);
  }
  expect(isImagePath("x.md")).toBe(false);
});

test("crumbs: root + every segment", () => {
  expect(crumbs("guides/deep/inner.md", "proj")).toEqual([
    { label: "proj", path: "" },
    { label: "guides", path: "guides" },
    { label: "deep", path: "guides/deep" },
    { label: "inner.md", path: "guides/deep/inner.md" },
  ]);
  expect(crumbs("", "proj")).toEqual([{ label: "proj", path: "" }]);
});

describe("DocImageCache (D-M3-7: cache hit, eviction on project switch, clear)", () => {
  const img = { media_type: "image/png", base64: "QUJD" };

  test("docImageDataUrl formats a data URL", () => {
    expect(docImageDataUrl(img)).toBe("data:image/png;base64,QUJD");
  });

  test("second read of the same path replays the load (loader called once)", async () => {
    const cache = new DocImageCache();
    let loads = 0;
    const loader = () => {
      loads += 1;
      return Promise.resolve(img);
    };
    await expect(cache.getOrLoad("p-1", "a.png", loader)).resolves.toBe("data:image/png;base64,QUJD");
    await cache.getOrLoad("p-1", "a.png", loader);
    expect(loads).toBe(1);
    expect(cache.size).toBe(1);
  });

  test("switching projects evicts everything", async () => {
    const cache = new DocImageCache();
    let loads = 0;
    const loader = () => {
      loads += 1;
      return Promise.resolve(img);
    };
    await cache.getOrLoad("p-1", "a.png", loader);
    await cache.getOrLoad("p-2", "a.png", loader); // same path, other project
    expect(loads).toBe(2);
    expect(cache.size).toBe(1);
  });

  test("failed loads do not poison the cache; clear() empties it", async () => {
    const cache = new DocImageCache();
    let calls = 0;
    const flaky = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("nope")) : Promise.resolve(img);
    };
    await expect(cache.getOrLoad("p-1", "a.png", flaky)).rejects.toThrow("nope");
    await expect(cache.getOrLoad("p-1", "a.png", flaky)).resolves.toContain("data:");
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
