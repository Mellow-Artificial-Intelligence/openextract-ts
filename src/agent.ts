import type { LanguageModel } from "./model.js";
import { loadModuleExport } from "./module-export.js";
import type { ExtractOptions } from "./types.js";

const AGENT = Symbol.for("openextract.agent");

export type AgentStyle = ExtractOptions["style"];
export type ExtractAgent = LanguageModel | DefinedAgent;

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
  outputSchema?: unknown;
}

export interface DefinedLocalAgent {
  readonly [AGENT]: true;
  readonly kind: "local";
  readonly description: string;
  readonly model?: LanguageModel;
  readonly style?: AgentStyle;
  readonly instructions?: string;
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
  readonly outputSchema?: unknown;
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

export async function loadAgent(spec: unknown): Promise<DefinedAgent> {
  if (isDefinedAgent(spec)) return spec;
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error("agent must be a defineAgent export or a 'module:exportName' path.");
  }
  const { value, exportName, modulePath } = await loadModuleExport(spec.trim());
  if (!isDefinedAgent(value)) {
    throw new Error(
      `Export '${exportName}' in '${modulePath}' is not a defineAgent or defineRemoteAgent export.`,
    );
  }
  return value;
}

export async function loadAgents(spec: string | readonly string[]): Promise<DefinedAgent[]> {
  const items = Array.isArray(spec) ? spec : spec.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new Error("agents must include at least one module:exportName path.");
  return Promise.all(items.map((item) => loadAgent(item)));
}
