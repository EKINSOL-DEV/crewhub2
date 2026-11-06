/* The world's stand-in for crewhub-loops' `components/settings/testNotification.ts`: the copied chat (Bubbles.tsx @ c7f9d679) asks
   `currentPlatform()` to word the send chord's hint (⌘ Enter on a Mac, Ctrl+Enter elsewhere; CL-181). `Platform`, `detectPlatform`
   and `currentPlatform` are loops' own lines at c7f9d679; the notification test around them in loops is not needed here. */
export type Platform = "mac" | "windows";

/** The system the browser runs on, from `navigator.userAgentData?.platform ?? navigator.platform`; null when unknown. */
export function detectPlatform(platform: string | undefined): Platform | null {
  const p = (platform ?? "").toLowerCase();
  if (p.startsWith("mac") || p.includes("iphone") || p.includes("ipad")) return "mac";
  if (p.startsWith("win")) return "windows";
  return null;
}

export function currentPlatform(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return detectPlatform(nav.userAgentData?.platform ?? nav.platform);
}
