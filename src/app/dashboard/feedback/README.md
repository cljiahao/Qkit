# feedback

## Purpose

Vendor-facing feedback page — a dedicated full-page destination for sharing feedback about qkit itself, separate from the same form's drawer variant in the dashboard nav.

## Contents

- `page.tsx` — `DashboardFeedbackPage()` (`revalidate = 0`): renders a header ("Help shape qkit" / "Feedback") and `FeedbackForm` from `@/components/feedback-form` with `source="vendor"`, `metric="nps"`, and the prompt "How likely are you to recommend qkit to another vendor?".

## Connectivity

Reachable at `/dashboard/feedback`; renders the same `FeedbackForm` component that `dashboard-nav.tsx` also opens in a `Sheet` drawer from the account menu, with identical props — this page is the standalone/linkable equivalent of that drawer.

## Parent

[dashboard](../README.md)
