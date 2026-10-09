// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";
import AdminNotFound from "./admin/not-found";
import DashboardNotFound from "./dashboard/not-found";

describe("error recovery", () => {
  it("offers a retry without exposing server exception contents", () => {
    const reset = vi.fn();
    render(
      <ErrorPage error={new Error("private server detail")} reset={reset} />,
    );
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
  it("supports recovery even when the root layout failed", () => {
    const reset = vi.fn();
    const page = GlobalError({ error: new Error("private detail"), reset });
    expect(page.type).toBe("html");
    expect(page.props.lang).toBe("en");
    render(page.props.children.props.children);
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
  it.each([
    { Page: NotFound, target: "/", label: "Back to start" },
    { Page: AdminNotFound, target: "/admin", label: "Back to admin" },
    {
      Page: DashboardNotFound,
      target: "/dashboard",
      label: "Back to dashboard",
    },
  ])("routes missing-page recovery to $target", ({ Page, target, label }) => {
    render(<Page />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      target,
    );
  });
});
