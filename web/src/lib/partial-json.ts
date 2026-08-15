export function parsePartialJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    let suffix = "";
    let inString = false;
    let escape = false;
    const stack: string[] = [];
    for (const ch of trimmed) {
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    if (inString) suffix += '"';
    suffix += stack.reverse().join("");
    try {
      return JSON.parse(trimmed + suffix);
    } catch {
      return undefined;
    }
  }
}
