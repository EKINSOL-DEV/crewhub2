// diff-parse (M3 T16, EKI-105): pure unified-diff → file/hunk fold.
// Fixtures per plan: rename, binary, mode change, truncation marker.
import { parseUnifiedDiff } from "@/panels/diff/diff-parse";

const MODIFY = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
@@ -10,2 +11,2 @@ function main() {
-  return a;
+  return b;
 }
`;

const RENAME = `diff --git a/old/name.ts b/new/name.ts
similarity index 92%
rename from old/name.ts
rename to new/name.ts
index 1111111..2222222 100644
--- a/old/name.ts
+++ b/new/name.ts
@@ -1,1 +1,1 @@
-export const x = 1;
+export const x = 2;
`;

const BINARY = `diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
`;

const MODE = `diff --git a/run.sh b/run.sh
old mode 100644
new mode 100755
`;

const ADDED = `diff --git a/fresh.ts b/fresh.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/fresh.ts
@@ -0,0 +1,2 @@
+line one
+line two
`;

const DELETED = `diff --git a/gone.ts b/gone.ts
deleted file mode 100644
index 1111111..0000000
--- a/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-goodbye
`;

// hunk declares 3 old / 4 new lines but the patch was capped mid-hunk
const TRUNCATED = `diff --git a/big.ts b/big.ts
index 1111111..2222222 100644
--- a/big.ts
+++ b/big.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
`;

test("modified file: path, status, hunks with headers", () => {
  const { files } = parseUnifiedDiff(MODIFY);
  expect(files).toHaveLength(1);
  const f = files[0]!;
  expect(f.path).toBe("src/app.ts");
  expect(f.status).toBe("modified");
  expect(f.hunks).toHaveLength(2);
  expect(f.hunks[0]!.header).toBe("@@ -1,2 +1,3 @@");
  expect(f.hunks[0]!.text).toContain("+const c = 4;");
  expect(f.hunks[1]!.header).toContain("function main()");
  expect(f.truncated).toBe(false);
});

test("rename carries both paths", () => {
  const { files } = parseUnifiedDiff(RENAME);
  const f = files[0]!;
  expect(f.status).toBe("renamed");
  expect(f.oldPath).toBe("old/name.ts");
  expect(f.path).toBe("new/name.ts");
  expect(f.hunks).toHaveLength(1);
});

test("binary file: no hunks, binary status", () => {
  const { files } = parseUnifiedDiff(BINARY);
  const f = files[0]!;
  expect(f.status).toBe("binary");
  expect(f.path).toBe("logo.png");
  expect(f.hunks).toHaveLength(0);
});

test("mode change without content keeps its own status", () => {
  const { files } = parseUnifiedDiff(MODE);
  const f = files[0]!;
  expect(f.status).toBe("mode");
  expect(f.path).toBe("run.sh");
  expect(f.hunks).toHaveLength(0);
});

test("added and deleted files", () => {
  expect(parseUnifiedDiff(ADDED).files[0]!.status).toBe("added");
  expect(parseUnifiedDiff(DELETED).files[0]!.status).toBe("deleted");
});

test("capped patch is flagged truncated (declared counts unmet)", () => {
  const f = parseUnifiedDiff(TRUNCATED).files[0]!;
  expect(f.truncated).toBe(true);
  expect(f.hunks).toHaveLength(1); // partial hunk still renders
});

test("multi-file diffs split per file; empty input parses to nothing", () => {
  const { files } = parseUnifiedDiff(MODIFY + RENAME + BINARY);
  expect(files.map((f) => f.path)).toEqual(["src/app.ts", "new/name.ts", "logo.png"]);
  expect(parseUnifiedDiff("").files).toEqual([]);
  expect(parseUnifiedDiff("not a diff at all").files).toEqual([]);
});
