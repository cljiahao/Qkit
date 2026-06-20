// Aggregate customer order feedback into the rating stats a vendor sees about
// their own booths.

export type ReviewRow = {
  rating: number | null;
  message: string | null;
  order_number: string | null;
  created_at: string;
};

export type ReviewSummary = {
  count: number; // rated responses
  average: number | null; // mean rating (1 dp), null when none
  // Count per star 1..5.
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  // Most recent comments (rating optional), newest first.
  recent: ReviewRow[];
};

export function summarizeReviews(
  rows: ReviewRow[],
  recentLimit = 8,
): ReviewSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (r.rating != null && r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
      sum += r.rating;
      count++;
    }
  }
  const average = count ? Math.round((sum / count) * 10) / 10 : null;

  const recent = [...rows]
    .filter((r) => r.message?.trim() || r.rating != null)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, recentLimit);

  return { count, average, distribution, recent };
}
