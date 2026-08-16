import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function loadModuleExport(
  spec: string,
): Promise<{ value: unknown; modulePath: string; exportName: string }> {
  const trimmed = spec.trim();
  const sep = trimmed.lastIndexOf(":");
  if (sep <= 0 || sep === trimmed.length - 1) {
    throw new Error(`Invalid module path '${spec}'. Expected format 'module:exportName'.`);
  }
  const modulePath = trimmed.slice(0, sep);
  const exportName = trimmed.slice(sep + 1);
  const href = pathToFileURL(resolve(modulePath)).href;
  const mod = (await import(href)) as Record<string, unknown>;
  const value = mod[exportName];
  if (value == null) {
    throw new Error(`Export '${exportName}' not found in module '${modulePath}'.`);
  }
  return { value, modulePath, exportName };
}
