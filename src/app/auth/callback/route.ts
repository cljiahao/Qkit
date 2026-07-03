import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Where to land after the session is established. Both OAuth sign-in and the
  // password-recovery link route through here; recovery passes ?next=/reset-password.
  // Only accept a same-origin relative path (leading "/", not "//") so the param
  // can't be used as an open redirect; default to the dashboard.
  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  return NextResponse.redirect(`${origin}${safeNext}`);
}
