// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { auth, push, refresh, params, toast } = vi.hoisted(() => ({
  auth: {
    signInWithOAuth: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  push: vi.fn(),
  refresh: vi.fn(),
  params: { mode: "" },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(params.mode ? "mode=signup" : ""),
}));
vi.mock("sonner", () => ({ toast }));
import LoginPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  params.mode = "";
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
});

function fill(email = "vendor@example.com", password = "valid-password") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

describe("vendor authentication flows", () => {
  it("signs in with validated credentials and refreshes the session-dependent dashboard", async () => {
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "vendor@example.com",
      password: "valid-password",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("shows sign-in errors and releases submission for retry", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid credentials" },
    });
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials"),
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
  it("rejects a short password before making a sign-in request", async () => {
    render(<LoginPage />);
    fill("vendor@example.com", "short");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("waits for signup email confirmation instead of entering an unauthenticated dashboard", async () => {
    params.mode = "signup";
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/We sent a confirmation link/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });
  it("enters the dashboard when signup already establishes a session", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: { user: { id: "vendor" } } },
      error: null,
    });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("keeps signup errors in the signup form", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { message: "Signup unavailable" },
    });
    params.mode = "signup";
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Signup unavailable"),
    );
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
  it("requires a valid email before requesting a password reset", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(toast.error).toHaveBeenCalledWith("Enter your email first");
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("requests recovery through the local callback and shows its destination", async () => {
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "vendor@example.com",
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );
    expect(
      screen.getByText(/We sent a password reset link/),
    ).toBeInTheDocument();
  });
  it("reports reset delivery errors without claiming email was sent", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "Delivery failed" },
    });
    render(<LoginPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Delivery failed"),
    );
    expect(
      screen.queryByRole("heading", { name: "Check your email" }),
    ).not.toBeInTheDocument();
  });
  it("reports OAuth errors and keeps the login options usable", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      error: { message: "Provider unavailable" },
    });
    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Provider unavailable"),
    );
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeEnabled();
  });
});
