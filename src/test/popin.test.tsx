import { render, screen } from "@testing-library/react";
import { PopIn } from "../components/PopIn";

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders a static variant under prefers-reduced-motion", () => {
  mockMatchMedia(true);
  render(
    <PopIn>
      <span>hi</span>
    </PopIn>,
  );
  expect(screen.getByTestId("popin-static")).toBeInTheDocument();
  expect(screen.queryByTestId("popin-animated")).not.toBeInTheDocument();
});

test("renders the animated spring variant otherwise", () => {
  mockMatchMedia(false);
  render(
    <PopIn>
      <span>hi</span>
    </PopIn>,
  );
  expect(screen.getByTestId("popin-animated")).toBeInTheDocument();
  expect(screen.queryByTestId("popin-static")).not.toBeInTheDocument();
});
