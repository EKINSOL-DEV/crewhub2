import { describeCron } from "@/panels/automation/cron-describe";

describe("describeCron (T13 — best-effort human text, raw fallback)", () => {
  test("minute shapes", () => {
    expect(describeCron("* * * * *")).toBe("every minute");
    expect(describeCron("*/5 * * * *")).toBe("every 5 minutes");
    expect(describeCron("30 * * * *")).toBe("hourly at :30");
    expect(describeCron("0 * * * *")).toBe("hourly at :00");
  });

  test("daily / weekday / weekly / monthly at a fixed time", () => {
    expect(describeCron("0 9 * * *")).toBe("every day at 09:00");
    expect(describeCron("30 18 * * *")).toBe("every day at 18:30");
    expect(describeCron("0 9 * * 1-5")).toBe("every weekday at 09:00");
    expect(describeCron("0 9 * * 1")).toBe("every Monday at 09:00");
    expect(describeCron("15 7 * * 0")).toBe("every Sunday at 07:15");
    expect(describeCron("15 7 * * 7")).toBe("every Sunday at 07:15"); // 7 = Sunday too
    expect(describeCron("0 6 1 * *")).toBe("monthly on day 1 at 06:00");
  });

  test("whitespace tolerance", () => {
    expect(describeCron("  0   9 * * *  ")).toBe("every day at 09:00");
  });

  test("fancy expressions fall back to the raw string (never wrong)", () => {
    expect(describeCron("0 9 * 6 *")).toBe("0 9 * 6 *"); // month-scoped
    expect(describeCron("0 9 1 * 1")).toBe("0 9 1 * 1"); // dom AND dow
    expect(describeCron("0,30 9 * * *")).toBe("0,30 9 * * *"); // lists
    expect(describeCron("*/10 9-17 * * *")).toBe("*/10 9-17 * * *"); // ranges
    expect(describeCron("not a cron")).toBe("not a cron");
    expect(describeCron("99 99 * * *")).toBe("99 99 * * *"); // out of range
    expect(describeCron("* * * *")).toBe("* * * *"); // wrong arity
  });
});
