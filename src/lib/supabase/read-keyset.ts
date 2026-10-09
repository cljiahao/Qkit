/** Read a mutable queue without skipping rows when an earlier row leaves it. */
export async function readKeysetRows<T extends { id: string }>(
  page: (afterId: string | null) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  let afterId: string | null = null;
  while (true) {
    const { data, error } = await page(afterId);
    if (error || !data) throw new Error("Could not load complete queue");
    if (data.length === 0) return rows;
    const nextId = data[data.length - 1].id;
    if (!nextId || (afterId !== null && nextId <= afterId))
      throw new Error("Queue cursor did not advance");
    rows.push(...data);
    afterId = nextId;
  }
}
