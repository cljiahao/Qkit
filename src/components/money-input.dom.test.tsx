// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MoneyInput } from "./money-input";

function Host({ initialCents }: { initialCents?: number }) {
  const [cents, setCents] = useState<number | undefined>(initialCents);
  return <MoneyInput cents={cents} onCommit={setCents} placeholder="$" />;
}

describe("MoneyInput", () => {
  it("renders blank for an unset amount", () => {
    render(<Host />);
    expect(screen.getByPlaceholderText("$")).toHaveValue("");
  });

  it("renders the formatted amount for a set value", () => {
    render(<Host initialCents={500} />);
    expect(screen.getByPlaceholderText("$")).toHaveValue("5.00");
  });

  // Regression: reformatting to the canonical 2-decimal string on every
  // keystroke resets the caret to the end each time, so typing "6.50"
  // left-to-right used to land as "6.01" -- each digit appended past the
  // fixed decimal point instead of landing where the user typed it.
  it("keeps the exact typed value when typed left-to-right, one key at a time", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByPlaceholderText("$");
    await user.type(input, "6.50");
    expect(input).toHaveValue("6.50");
  });

  it("commits the parsed cents on blur", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByPlaceholderText("$");
    await user.type(input, "6.50");
    await user.tab();
    expect(input).toHaveValue("6.50");
  });

  it("snaps back to the canonical 2-decimal string on blur", async () => {
    const user = userEvent.setup();
    render(<Host initialCents={500} />);
    const input = screen.getByPlaceholderText("$");
    // Appending past "5.00" types a 3rd decimal ("5.001") that rounds back
    // to the same 500 cents -- blur should snap the display back to "5.00".
    await user.type(input, "1");
    await user.tab();
    expect(input).toHaveValue("5.00");
  });

  it("clears to blank when the amount is deleted", async () => {
    const user = userEvent.setup();
    render(<Host initialCents={500} />);
    const input = screen.getByPlaceholderText("$");
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue("");
  });
});
