import { z } from "zod";

// The only valid dashboard tourIds. A tourId ultimately reaches a server
// action argument (markTourSeen, tour-actions.ts), which is network-callable
// directly regardless of what the UI ever sends, so this is a real
// boundary-validation schema, not just a typo guard. Kept in its own
// zero-React module (not tour-steps.ts, which pulls in react-dom/server for
// the order tour's example badge) so a "use server" file can import it
// without Next.js rejecting the bundle — see tour-actions.ts and
// dashboard-tour.tsx, its two consumers.
export const TOUR_IDS = ["orders", "booths"] as const;
export type TourId = (typeof TOUR_IDS)[number];
export const tourIdSchema = z.enum(TOUR_IDS);
