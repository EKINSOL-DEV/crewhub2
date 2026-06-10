import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders app shell", () => {
  render(<App />);
  expect(screen.getByTestId("app-root")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "It works" })).toBeInTheDocument();
});
