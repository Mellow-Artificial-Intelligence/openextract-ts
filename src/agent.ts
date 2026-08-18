import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { LanguageModel } from "./model.js";
import { loadModuleExport } from "./module-export.js";
import { isZodSchema, jsonSchemaToZod } from "./schema.js";
import { splitList } from "./serialized.js";
import type { ExtractOptions } from "./types.js";

const AGENT = Symbol.for("openextract.agent");

export type AgentStyle = ExtractOptions["style"];
export type ExtractAgent = LanguageModel | DefinedAgent;
export type OutputSchema = z.ZodType<unknown> | Record<string, unknown>;

export interface SwarmMemberLike {
  model: LanguageModel;
  instructions?: string;
  style?: AgentStyle;
}

export type AgentInput = LanguageModel | SwarmMemberLike | DefinedAgent;

export interface AgentConfig {
  description: string;
  model?: LanguageModel;
  style?: AgentStyle;
  instructions?: string;
  outputSchema?: OutputSchema;
  subagents?: readonly AgentInput[];
}

export type UrlValue = string | (() => string | Promise<string>);
export type HeadersValue =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);
export type OutboundAuthFn = () => Record<string, string> | Promise<Record<string, string>>;

export interface RemoteAgentConfig {
  url: UrlValue;
  description: string;
  auth?: OutboundAuthFn;
  headers?: HeadersValue;
  path?: string;
  outputSchema?: OutputSchema;
}

export interface DefinedLocalAgent {
  readonly [AGENT]: true;
  readonly kind: "local";
  readonly description: string;
  readonly model?: LanguageModel;
  readonly style?: AgentStyle;
  readonly instructions?: string;
  readonly outputSchema?: OutputSchema;
  readonly subagents: readonly AgentInput[];
}

export interface DefinedRemoteAgent {
  readonly [AGENT]: true;
  readonly kind: "remote";
  readonly description: string;
  readonly url: UrlValue;
  readonly auth?: OutboundAuthFn;
  readonly headers?: HeadersValue;
  readonly path: string;
  readonly outputSchema?: OutputSchema;
}

export type DefinedAgent = DefinedLocalAgent | DefinedRemoteAgent;

export interface LocalSwarmMember {
  readonly kind: "local";
  readonly model: LanguageModel;
  readonly instructions?: string;
  readonly style?: AgentStyle;
  readonly description?: string;
}

export interface RemoteSwarmMember {
  readonly kind: "remote";
  readonly remote: DefinedRemoteAgent;
  readonly instructions?: string;
  readonly style?: AgentStyle;
}

export type ResolvedAgentMember = LocalSwarmMember | RemoteSwarmMember;

export function isDefinedAgent(value: unknown): value is DefinedAgent {
  return typeof value === "object" && value !== null && AGENT in value;
}

export function isRemoteMember(value: ResolvedAgentMember): value is RemoteSwarmMember {
  return value.kind === "remote";
}

/** The sole local member of an agent, or null for a plain model, a remote agent, or a swarm. */
export function soleLocalMember(model: ExtractAgent): LocalSwarmMember | null {
  if (!isDefinedAgent(model)) return null;
  const members = flattenAgent(model);
  const member = members[0];
  if (members.length !== 1 || !member || isRemoteMember(member)) return null;
  return member;
}

/** Layers a member's style and instructions over call options. */
export function withMemberOptions<T extends ExtractOptions>(
  options: T,
  member?: { style?: AgentStyle; instructions?: string } | null,
): T {
  return {
    ...options,
    style: member?.style ?? options.style,
    instructions: member?.instructions ?? options.instructions,
  };
}

function requireDescription(description: string | undefined): string {
  const text = description?.trim();
  if (!text) throw new Error("description is required.");
  return text;
}

export function defineAgent(config: AgentConfig): DefinedLocalAgent {
  const description = requireDescription(config.description);
  const subagents = config.subagents ?? [];
  if (config.model == null && subagents.length === 0) {
    throw new Error("defineAgent requires model or subagents.");
  }
  return Object.freeze({
    [AGENT]: true as const,
    kind: "local" as const,
    description,
    model: config.model,
    style: config.style,
    instructions: config.instructions,
    outputSchema: config.outputSchema,
    subagents,
  });
}

export function defineRemoteAgent(config: RemoteAgentConfig): DefinedRemoteAgent {
  const description = requireDescription(config.description);
  if (typeof config.url !== "function" && (typeof config.url !== "string" || !config.url.trim())) {
    throw new Error("url is required.");
  }
  return Object.freeze({
    [AGENT]: true as const,
    kind: "remote" as const,
    description,
    url: config.url,
    auth: config.auth,
    headers: config.headers,
    path: config.path ?? "/extract",
    outputSchema: config.outputSchema,
  });
}

export function resolveOutputSchema(agent: DefinedAgent): z.ZodType<unknown> {
  const spec = agent.outputSchema;
  if (spec == null) throw new Error("agent is missing outputSchema.");
  if (isZodSchema(spec)) return spec;
  if (typeof spec === "object") return jsonSchemaToZod(spec);
  throw new Error("outputSchema must be a Zod schema or JSON Schema object.");
}

function isMemberLike(value: object): value is SwarmMemberLike {
  return "model" in value && !("specificationVersion" in value);
}

export function flattenAgent(agent: AgentInput, seen = new Set<DefinedAgent>()): ResolvedAgentMember[] {
  if (isDefinedAgent(agent)) {
    if (seen.has(agent)) throw new Error("agent subagent cycle.");
    seen.add(agent);
    if (agent.kind === "remote") return [{ kind: "remote", remote: agent }];
    const self: ResolvedAgentMember[] =
      agent.model != null
        ? [
            {
              kind: "local",
              model: agent.model,
              instructions: agent.instructions,
              style: agent.style,
              description: agent.description,
            },
          ]
        : [];
    return [...self, ...agent.subagents.flatMap((child) => flattenAgent(child, seen))];
  }
  if (typeof agent === "object" && agent !== null && isMemberLike(agent)) {
    return [{ kind: "local", model: agent.model, instructions: agent.instructions, style: agent.style }];
  }
  return [{ kind: "local", model: agent as LanguageModel }];
}

async function importDefault(filePath: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(filePath).href)) as Record<string, unknown>;
  return mod.default;
}

/** Imports a module's default export and asserts it was built by defineAgent / defineRemoteAgent. */
async function importAgent(filePath: string, subject: string): Promise<DefinedAgent> {
  const value = await importDefault(filePath);
  if (!isDefinedAgent(value)) {
    throw new Error(`${subject} must default-export defineAgent or defineRemoteAgent.`);
  }
  return value;
}

function skipEntry(name: string): boolean {
  return name.startsWith(".") || name.endsWith(".d.ts") || name.includes(".test.");
}

async function loadInstructions(dir: string): Promise<string | undefined> {
  try {
    const text = (await readFile(join(dir, "instructions.md"), "utf8")).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function withDiscovered(
  agent: DefinedAgent,
  subagents: readonly DefinedAgent[],
  instructions?: string,
): DefinedAgent {
  if (agent.kind === "remote") return agent;
  return Object.freeze({
    ...agent,
    instructions: agent.instructions ?? instructions,
    subagents: [...agent.subagents, ...subagents],
  });
}

async function loadAgentFile(dir: string): Promise<DefinedAgent | undefined> {
  for (const name of ["agent.ts", "agent.js", "agent.mts", "agent.mjs"]) {
    const filePath = join(dir, name);
    try {
      await stat(filePath);
    } catch {
      continue;
    }
    return importAgent(filePath, `'${filePath}'`);
  }
  return undefined;
}

async function loadSubagents(dir: string): Promise<DefinedAgent[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const agents: DefinedAgent[] = [];
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (skipEntry(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      agents.push(await loadAgentDirectory(path));
      continue;
    }
    if (!/\.(ts|js|mts|mjs)$/.test(entry.name) || /^agent\.(ts|js|mts|mjs)$/.test(entry.name)) continue;
    agents.push(await importAgent(path, `subagent '${entry.name}'`));
  }
  return agents;
}

export async function loadAgentDirectory(dir: string): Promise<DefinedAgent> {
  const root = await loadAgentFile(dir);
  const kids = await loadSubagents(join(dir, "subagents"));
  const instructions = await loadInstructions(dir);
  if (root) return withDiscovered(root, kids, instructions);
  if (kids.length === 1) return kids[0]!;
  if (kids.length > 1) return defineAgent({ description: basename(dir), subagents: kids });
  throw new Error(`No agent.ts or subagents found in '${dir}'.`);
}

export async function loadAgent(spec: unknown): Promise<DefinedAgent> {
  if (isDefinedAgent(spec)) return spec;
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error("agent must be a defineAgent export, a path, or a 'module:exportName' path.");
  }
  const trimmed = spec.trim();
  const resolved = resolve(trimmed);
  try {
    const info = await stat(resolved);
    if (info.isDirectory()) return loadAgentDirectory(resolved);
    if (info.isFile()) return importAgent(resolved, `'${trimmed}'`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const { value, exportName, modulePath } = await loadModuleExport(trimmed);
  if (!isDefinedAgent(value)) {
    throw new Error(
      `Export '${exportName}' in '${modulePath}' is not a defineAgent or defineRemoteAgent export.`,
    );
  }
  return value;
}

export async function loadAgents(spec: string | readonly string[]): Promise<DefinedAgent[]> {
  const items = typeof spec === "string" ? splitList(spec) : spec;
  if (items.length === 0) throw new Error("agents must include at least one agent path.");
  return Promise.all(items.map((item) => loadAgent(item)));
}
