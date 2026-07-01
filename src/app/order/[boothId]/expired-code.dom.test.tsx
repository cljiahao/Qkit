// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpiredCode } from "./expired-code";

describe("ExpiredCode", () => {
  it("shows the expired-code message and no order UI", () => {
    render(<ExpiredCode />);
    expect(screen.getByText(/this code expired/i)).toBeInTheDocument();
    // No menu / order affordances leak onto the block screen.
    expect(screen.queryByRole("button", { name: /place order/i })).toBeNull();
  });
});
