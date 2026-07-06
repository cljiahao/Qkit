// Sample data for the 4 landing-hero scenario boards: a plain coffee cart, a
// queue-only ice cream cart (no prices/payment), a payment-claim flow, and a
// rush hour with an overdue ticket.

import type { LandingBoardData } from "./landing-board";

export const LANDING_BOARDS: LandingBoardData[] = [
  {
    key: "coffee",
    title: "Kopitiam Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0042",
        name: "Ada",
        status: "preparing",
        age: { label: "4m", tone: "aging" },
        payment: "unpaid",
        lines: [{ q: 2, name: "Kopi", opt: "Iced", price: "$3.60" }],
        total: "$3.60",
        action: "Mark Ready",
      },
      {
        n: "0041",
        name: "Wei",
        status: "ready",
        lines: [
          { q: 1, name: "Milo", opt: "Hot", price: "$2.20" },
          { q: 3, name: "Teh", opt: "Less sugar", price: "$5.40" },
        ],
        total: "$7.60",
        action: "Mark Picked Up",
      },
    ],
  },
  {
    key: "icecream",
    title: "Ice Cream Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0018",
        name: "Mei",
        status: "preparing",
        lines: [{ q: 1, name: "Single Scoop", opt: "Vanilla" }],
        action: "Mark Ready",
      },
      {
        n: "0017",
        name: "Sam",
        status: "ready",
        lines: [{ q: 2, name: "Double Scoop" }],
        action: "Mark Picked Up",
      },
    ],
  },
  {
    key: "payment",
    title: "Kopitiam Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0031",
        name: "Nur",
        status: "preparing",
        payment: "claimed",
        lines: [{ q: 1, name: "Kopi", opt: "Iced", price: "$1.80" }],
        total: "$1.80",
        action: "Confirm payment received",
      },
      {
        n: "0030",
        name: "Jun",
        status: "completed",
        payment: "paid",
        lines: [{ q: 2, name: "Teh", price: "$3.60" }],
        total: "$3.60",
      },
    ],
  },
  {
    key: "rush",
    title: "Kopitiam Cart",
    activeCount: 3,
    tickets: [
      {
        n: "0056",
        name: "Lim",
        status: "preparing",
        age: { label: "12m", tone: "overdue" },
        lines: [{ q: 2, name: "Milo", opt: "Iced", price: "$4.40" }],
        total: "$4.40",
        action: "Mark Ready",
      },
      {
        n: "0057",
        name: "Aisha",
        status: "preparing",
        age: { label: "7m", tone: "aging" },
        lines: [{ q: 1, name: "Kopi", price: "$1.40" }],
        total: "$1.40",
        action: "Mark Ready",
      },
      {
        n: "0058",
        name: "Tan",
        status: "preparing",
        age: { label: "1m", tone: "normal" },
        lines: [{ q: 1, name: "Teh", price: "$1.40" }],
        total: "$1.40",
        action: "Mark Ready",
      },
    ],
  },
];
