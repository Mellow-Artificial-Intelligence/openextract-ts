/**
 * Helpers for reading the model's answer while it is still streaming.
 *
 * The extraction prompt asks for a fenced JSON block followed by a one-line
 * summary, so the UI has to make sense of a document that is only half there.
 */

export interface ExtractionSegments {
  /** Text outside the JSON block: the trailing summary once it arrives. */
  prose: string;
  /** Raw text inside the JSON block, or null when no block has started. */
  jsonText: string | null;
  /** True once the closing fence has streamed in. */
  jsonComplete: boolean;
}

const FENCE_OPEN = /```[ \t]*([a-z]*)[ \t]*(\r?\n)?/i;
const FENCE_CLOSE = "```";
/** A fence that is still arriving, so its backticks should not show as prose. */
const FENCE_PARTIAL = /``$/;

/** Splits a streamed assistant message into its JSON block and surrounding prose. */
export function splitExtraction(text: string): ExtractionSegments {
  const open = FENCE_OPEN.exec(text);
  const language = open?.[1]?.toLowerCase() ?? "";

  // While the opening fence streams in, the language is still a prefix of "json".
  if (!open || !"json".startsWith(language)) {
    const partial = FENCE_PARTIAL.exec(text);
    if (partial) {
      return { jsonComplete: false, jsonText: "", prose: text.slice(0, partial.index) };
    }
    return { jsonComplete: false, jsonText: null, prose: text };
  }

  const before = text.slice(0, open.index);
  // The fence line has no newline yet, so the block itself has not started.
  if (!open[2]) {
    return { jsonComplete: false, jsonText: "", prose: before };
  }

  const body = text.slice(open.index + open[0].length);
  const closeIndex = body.indexOf(FENCE_CLOSE);
  if (closeIndex === -1) {
    return { jsonComplete: false, jsonText: body, prose: before };
  }

  return {
    jsonComplete: true,
    jsonText: body.slice(0, closeIndex),
    prose: `${before}\n${body.slice(closeIndex + FENCE_CLOSE.length)}`.trim(),
  };
}

interface OpenStructures {
  /** Closing braces and brackets owed by the document, outermost first. */
  closers: string[];
  inString: boolean;
  escaped: boolean;
}

function scanOpenStructures(text: string): OpenStructures {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") closers.push("}");
    else if (char === "[") closers.push("]");
    else if (char === "}" || char === "]") closers.pop();
  }

  return { closers, escaped, inString };
}

/** A half-written token at the end of the document, e.g. `tru` or `"summ`. */
const TRAILING_TOKEN = /[^{}[\],:]+$/;
const MAX_REPAIR_STEPS = 64;

/**
 * Parses JSON that may still be streaming by closing whatever is open and
 * dropping the half-written token at the end. Returns undefined if nothing
 * parseable is there yet.
 */
export function parseStreamingJson(text: string): unknown {
  let candidate = text.trim();

  for (let step = 0; step < MAX_REPAIR_STEPS && candidate; step++) {
    const { closers, escaped, inString } = scanOpenStructures(candidate);
    let repaired = escaped ? candidate.slice(0, -1) : candidate;
    if (inString) repaired += '"';
    repaired += [...closers].reverse().join("");

    try {
      return JSON.parse(repaired);
    } catch {
      // Drop the incomplete tail and try again with a shorter document.
      const withoutToken = candidate.replace(TRAILING_TOKEN, "");
      candidate = withoutToken === candidate ? candidate.slice(0, -1) : withoutToken;
    }
  }

  return undefined;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Number of top-level fields extracted so far, used for the result header. */
export function countFields(value: unknown): number {
  if (isPlainObject(value)) return Object.keys(value).length;
  if (Array.isArray(value)) return value.length;
  return value === undefined ? 0 : 1;
}
