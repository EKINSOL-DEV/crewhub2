// The OS notification sink (M6 T11, D-M6-4): the ONLY webview surface that
// touches `@tauri-apps/plugin-notification` (grant: `notification:default`
// in capabilities/main.json, the milestone's single new capability).
// Lazily imported and best-effort — a missing plugin (unit tests, dev
// server) must never break the toast path. Tests mock this module.

/** Send one OS notification; resolves quietly on any failure. */
export async function sendOsNotification(title: string, body?: string): Promise<void> {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification(body === undefined ? { title } : { title, body });
  } catch {
    // plugin unavailable or permission denied — the in-app toast already showed
  }
}
