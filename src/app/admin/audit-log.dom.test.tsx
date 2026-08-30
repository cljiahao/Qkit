// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuditLogEntry } from "@merqo/ui";
import { AdminAuditLog } from "./audit-log";

const entry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: "a1",
  actor: "admin-1",
  action: "set_vendor_plan",
  target: "vendor-1",
  detail: "to: pro",
  createdAt: "2026-08-20T09:00:00Z",
  ...overrides,
});

describe("AdminAuditLog", () => {
  it("humanizes the raw action string", () => {
    render(<AdminAuditLog entries={[entry()]} />);
    expect(screen.getByText("Set vendor plan")).toBeInTheDocument();
    expect(screen.getByText("to: pro")).toBeInTheDocument();
  });

  it("shows the admin-specific empty state when there are no entries", () => {
    render(<AdminAuditLog entries={[]} />);
    expect(screen.getByText("No admin actions yet.")).toBeInTheDocument();
  });
});
