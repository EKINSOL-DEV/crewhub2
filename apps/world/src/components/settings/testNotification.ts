/* Adapter for the copied chat (round 69, w5-10): the copy's Field line, loops' own from CL-181 (crewhub-loops c7f9d679), imports
   `currentPlatform` from `../settings/testNotification`, loops' notification-test module. Here only that function and its
   detector, ported word for word; the world has no notification test. */

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
