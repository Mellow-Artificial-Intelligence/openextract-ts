import { normalizeChoice } from "./config.js";

export const SWARM_REDUCES = ["merge", "vote", "first"] as const;
export type SwarmReduce = (typeof SWARM_REDUCES)[number];

export function normalizeReduce(reduce: SwarmReduce | string = "merge"): SwarmReduce {
  return normalizeChoice("reduce", SWARM_REDUCES, reduce);
}

export function reduceOutputs<T>(values: readonly T[], reduce: SwarmReduce): T {
  if (values.length === 0) throw new Error("reduceOutputs requires at least one value.");
  if (values.length === 1 || reduce === "first") return values[0] as T;
  return (reduce === "vote" ? voteValues(values) : mergeValues(values)) as T;
}

export function mergeValues(values: readonly unknown[]): unknown {
  return combine(values, firstFilled);
}

export function voteValues(values: readonly unknown[]): unknown {
  return combine(values, majority);
}

/**
 * Walks arrays and objects the same way for every reduce; only the leaf strategy differs.
 * Arrays union their items, records merge key by key, leaves go to `leaf`.
 */
function combine(values: readonly unknown[], leaf: (values: readonly unknown[]) => unknown): unknown {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  if (values.every(Array.isArray)) return unionJson(values.flat());
  if (values.every(isRecord)) {
    const out: Record<string, unknown> = {};
    for (const key of new Set(values.flatMap((value) => Object.keys(value)))) {
      out[key] = combine(values.map((value) => value[key]), leaf);
    }
    return out;
  }
  return leaf(values);
}

function firstFilled(values: readonly unknown[]): unknown {
  return values.find((value) => !isEmpty(value)) ?? values[0];
}

function majority(values: readonly unknown[]): unknown {
  const counts = new Map<string, { count: number; value: unknown }>();
  let best: { count: number; value: unknown } | undefined;
  for (const value of values) {
    if (isEmpty(value)) continue;
    const key = stableKey(value);
    const entry = counts.get(key) ?? { count: 0, value };
    entry.count += 1;
    counts.set(key, entry);
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.value ?? firstFilled(values);
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unionJson(items: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of items) {
    const key = stableKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stableKey(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  const rec = value as Record<string, unknown>;
  return `{${Object.keys(rec)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableKey(rec[key])}`)
    .join(",")}}`;
}
