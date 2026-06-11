// Best-effort human text for a 5-field cron expression (T13, EKI-30) — pure,
// covers the shapes people actually schedule ("every weekday at 09:00");
// anything fancier falls back to the raw expression (never wrong, sometimes
// terse). The editor's authoritative preview is the `preview_cron` IPC.

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function pad(n: string): string {
  return n.length === 1 ? `0${n}` : n;
}

const NUM = /^\d+$/;

export function describeCron(expr: string): string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = fields as [string, string, string, string, string];
  if (mon !== "*") return expr; // month-scoped — too fancy, show raw

  // sub-hourly shapes
  if (hour === "*" && dom === "*" && dow === "*") {
    if (min === "*") return "every minute";
    const every = /^\*\/(\d+)$/.exec(min);
    if (every) return `every ${every[1]} minutes`;
    if (NUM.test(min)) return `hourly at :${pad(min)}`;
    return expr;
  }

  if (!NUM.test(min) || !NUM.test(hour) || Number(hour) > 23 || Number(min) > 59) return expr;
  const time = `${pad(hour)}:${pad(min)}`;
  if (dom === "*" && dow === "*") return `every day at ${time}`;
  if (dom === "*" && dow === "1-5") return `every weekday at ${time}`;
  if (dom === "*" && NUM.test(dow) && Number(dow) <= 7) {
    return `every ${DOW[Number(dow) % 7]} at ${time}`;
  }
  if (dow === "*" && NUM.test(dom)) return `monthly on day ${Number(dom)} at ${time}`;
  return expr;
}
