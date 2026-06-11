// Image cache for the docs panel (M3 T9, EKI-89 / D-M3-7): read_doc_image
// returns base64 over IPC (≤8 MB, server-capped); the panel renders it as a
// data URL. The cache de-duplicates loads per (project, path), evicts itself
// wholesale on project switch, and is cleared on panel unmount. Pure TS —
// the loader is injected, so tests drive it without IPC.
import type { DocImage } from "@/ipc/bindings";

export function docImageDataUrl(img: DocImage): string {
  return `data:${img.media_type};base64,${img.base64}`;
}

export class DocImageCache {
  private cache = new Map<string, Promise<string>>();
  private projectId: string | null = null;

  /** Loads (or replays) one image as a data URL. */
  getOrLoad(projectId: string, relPath: string, loader: () => Promise<DocImage>): Promise<string> {
    if (this.projectId !== projectId) {
      // project switch: a whole different doc root — drop everything
      this.cache.clear();
      this.projectId = projectId;
    }
    const cached = this.cache.get(relPath);
    if (cached) return cached;
    const loading = loader().then(docImageDataUrl);
    this.cache.set(relPath, loading);
    // a failed load must not poison the cache — retry next render
    loading.catch(() => this.cache.delete(relPath));
    return loading;
  }

  /** Unmount hook: forget everything. */
  clear(): void {
    this.cache.clear();
    this.projectId = null;
  }

  get size(): number {
    return this.cache.size;
  }
}
