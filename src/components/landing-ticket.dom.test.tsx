// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingTicket, type LandingTicketData } from "./landing-ticket";

const priced: LandingTicketData = {
  n: "0042",
  name: "Ada",
  status: "preparing",
  payment: "unpaid",
  age: { label: "4m", tone: "aging" },
  lines: [{ q: 2, name: "Kopi", opt: "Iced", price: "$3.60" }],
  total: "$7.20",
  action: "Mark Ready",
};
const queueOnly: LandingTicketData = {
  n: "0009",
  name: "Wei",
  status: "ready",
  lines: [{ q: 1, name: "Single Scoop", opt: "Vanilla" }],
};

describe("LandingTicket", () => {
  it("renders number, name, line, total and action", () => {
    const { container } = render(<LandingTicket t={priced} />);
    expect(screen.getByText("#0042")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("$3.60")).toBeInTheDocument();
    expect(screen.getByText("Mark Ready")).toBeInTheDocument();
    expect(container.querySelector(".ticket-aging")).not.toBeNull();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByText("4m")).toBeInTheDocument();
  });
  it("renders queue-only: no total, no payment badge, no wash", () => {
    const { container } = render(<LandingTicket t={queueOnly} />);
    expect(screen.getByText("Single Scoop")).toBeInTheDocument();
    expect(screen.queryByText(/Total/i)).toBeNull();
    expect(screen.queryByText("Unpaid")).toBeNull();
    expect(screen.queryByText("Paid")).toBeNull();
    expect(
      container.querySelector(".ticket-aging,.ticket-overdue,.ticket-alert"),
    ).toBeNull();
  });
  it("uses the alert wash + Says paid when payment is claimed", () => {
    const { container } = render(
      <LandingTicket t={{ ...priced, payment: "claimed", age: undefined }} />,
    );
    expect(screen.getByText("Says paid")).toBeInTheDocument();
    expect(container.querySelector(".ticket-alert")).not.toBeNull();
  });

  const withOptions: LandingTicketData = {
    n: "0018",
    name: "Mei",
    status: "preparing",
    lines: [
      {
        q: 1,
        name: "Single Scoop",
        options: [
          { group: "Flavour", choice: "Vanilla" },
          { group: "Toppings", choice: "Sprinkles" },
        ],
      },
    ],
    action: "Mark Ready",
  };

  it("collapsed: shows 'Show options' + a joined choice summary, no rows", () => {
    render(<LandingTicket t={{ ...withOptions, optionsView: "collapsed" }} />);
    expect(screen.getByText("Show options")).toBeInTheDocument();
    expect(screen.getByText("Vanilla · Sprinkles")).toBeInTheDocument();
    // Not broken out into group labels while collapsed.
    expect(screen.queryByText("Flavour:")).toBeNull();
  });

  it("expanded: shows 'Hide options' + group→choice rows, no joined summary", () => {
    render(<LandingTicket t={{ ...withOptions, optionsView: "expanded" }} />);
    expect(screen.getByText("Hide options")).toBeInTheDocument();
    expect(screen.getByText("Flavour:")).toBeInTheDocument();
    expect(screen.getByText("Toppings:")).toBeInTheDocument();
    expect(screen.getByText("Sprinkles")).toBeInTheDocument();
    expect(screen.queryByText("Vanilla · Sprinkles")).toBeNull();
  });

  it("no options control when optionsView is unset", () => {
    render(<LandingTicket t={withOptions} />);
    expect(screen.queryByText("Show options")).toBeNull();
    expect(screen.queryByText("Hide options")).toBeNull();
  });
});
