import { z } from "zod";

// The only valid dashboard tourIds. A tourId reaches a server action
// argument (markTourSeen), network-callable with any value, so this is a
// real boundary schema, not a typo guard. Zero-React on purpose: tour-steps.ts
// pulls in react-dom/server, which a "use server" file can't import.
export const TOUR_IDS = ["orders", "booths"] as const;
export type TourId = (typeof TOUR_IDS)[number];
export const tourIdSchema = z.enum(TOUR_IDS);
