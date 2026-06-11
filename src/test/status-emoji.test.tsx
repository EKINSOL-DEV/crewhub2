// Status Critters (D-M2-6): emoji set + reduced-motion static variants.
import { render, screen } from "@testing-library/react";
import { StatusEmoji, STATUS_CRITTERS } from "@/components/StatusEmoji";
import { mockReducedMotion } from "./chat-helpers";

test("critter inventory matches D-M2-6", () => {
  expect(STATUS_CRITTERS.Working.emoji).toBe("🔨");
  expect(STATUS_CRITTERS.WaitingForInput.emoji).toBe("💬");
  expect(STATUS_CRITTERS.WaitingForPermission.emoji).toBe("🙋");
  expect(STATUS_CRITTERS.Idle.emoji).toBe("😴");
  expect(STATUS_CRITTERS.Ended.emoji).toBe("🪦");
});

test("Working wiggles; WaitingForPermission bounces", () => {
  mockReducedMotion(false);
  const { rerender } = render(<StatusEmoji status="Working" />);
  expect(screen.getByTestId("status-emoji")).toHaveClass("ch-anim-wiggle");
  rerender(<StatusEmoji status="WaitingForPermission" />);
  expect(screen.getByTestId("status-emoji")).toHaveClass("ch-anim-bounce");
  rerender(<StatusEmoji status="Idle" />);
  expect(screen.getByTestId("status-emoji")).not.toHaveClass("ch-anim-wiggle", "ch-anim-bounce");
});

test("prefers-reduced-motion renders static variants", () => {
  mockReducedMotion(true);
  render(<StatusEmoji status="Working" />);
  const el = screen.getByTestId("status-emoji");
  expect(el).not.toHaveClass("ch-anim-wiggle");
  expect(el).toHaveTextContent("🔨");
});
