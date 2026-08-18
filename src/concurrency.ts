/**
 * Runs `total` indexed tasks with at most `maxConcurrency` in flight.
 * Workers pull the next index until the list is exhausted or `stop` returns true.
 */
export async function runPool(
  total: number,
  maxConcurrency: number,
  run: (index: number) => Promise<void>,
  stop?: () => boolean,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (stop?.()) return;
      const index = next++;
      if (index >= total) return;
      await run(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, total) }, () => worker()));
}
