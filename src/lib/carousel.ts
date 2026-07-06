/** Index of the board nearest the current horizontal scroll offset,
 *  clamped to [0, count-1]. Returns 0 for a non-positive board width. */
export function nearestIndex(
  scrollLeft: number,
  boardWidth: number,
  count: number,
): number {
  if (boardWidth <= 0) return 0;
  const raw = Math.round(scrollLeft / boardWidth);
  return Math.min(Math.max(raw, 0), count - 1);
}
