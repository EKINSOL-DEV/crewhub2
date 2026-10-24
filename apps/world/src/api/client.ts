/* Adapter for the copied chat: loops' `api/client` (`api`, `ApiError`, `shouldRetry`). `ApiError` and `shouldRetry` are
   copied from crewhub-loops apps/web/src/api/client.ts @ a1bed0f. `api` has the same signature, but in demo mode it never
   calls `fetch`: every request goes to the in-browser demo API (packages/demo `createDemoApi`), which answers the loops
   routes from the demo source with loops' status codes and error envelope. The future live mode (the person's own loops
   session, plan section 3.5) replaces `send` and nothing else. */
import type { ApiErrorCode } from "./types";
import { demoChatApi } from "../state/chatApi";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode | "network";
  detail: unknown;
  constructor(status: number, code: ApiError["code"], message: string, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Query retry policy: a 4xx is an answer, everything else (5xx, network) gets one retry. */
export function shouldRetry(failures: number, e: unknown): boolean {
  return !(e instanceof ApiError && e.status >= 400 && e.status < 500) && failures < 1;
}

/* JSON in and out, as loops' `request` would see it: the body is copied both ways, so no caller shares objects with the
   demo store. */
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await demoChatApi().handle(method, path, body === undefined ? undefined : structuredClone(body));
  if (response.status >= 400) {
    const err = (response.body as { error?: { code?: ApiErrorCode; message?: string; detail?: unknown } } | null)?.error;
    throw new ApiError(response.status, err?.code ?? "internal_error", err?.message ?? "Error", err?.detail ?? null);
  }
  if (response.status === 204) return undefined as T;
  return structuredClone(response.body) as T;
}

export const api = {
  get: <T>(path: string) => send<T>("GET", path),
  post: <T>(path: string, body?: unknown) => send<T>("POST", path, body === undefined ? {} : body),
  patch: <T>(path: string, body: unknown) => send<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => send<T>("PUT", path, body),
  del: <T>(path: string) => send<T>("DELETE", path),
};
