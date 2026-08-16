import { DEFAULT_MODEL, resizeAgentModels, type ModelId, type SwarmSize } from "./models";
import { type StyleName } from "./presets";
import { isColumnType, normalizeColumns, type ColumnType, type TableColumn } from "./table-schema";

export const STEP_KINDS = ["source", "schema", "extract", "swarm", "custom"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const ADDABLE_KINDS = ["schema", "extract", "swarm", "custom"] as const;
export type AddableKind = (typeof ADDABLE_KINDS)[number];

export const STEP_CATALOG: Record<StepKind, { label: string; hint: string }> = {
  source: { label: "Source", hint: "Paste text or attach a file." },
  schema: { label: "Schema", hint: "Describe columns for later extract steps." },
  extract: { label: "Extract", hint: "One model pass into the table." },
  swarm: { label: "Swarm", hint: "Parallel agents, then merge rows." },
  custom: { label: "Custom", hint: "Your own fields, style, and instructions." },
};

export type SourceStep = { id: string; kind: "source"; source: string };
export type SchemaStep = { id: string; kind: "schema"; query: string; columns: TableColumn[] };
export type ExtractStep = {
  id: string;
  kind: "extract";
  style: StyleName;
  model: ModelId;
  instructions: string;
};
export type SwarmStep = {
  id: string;
  kind: "swarm";
  style: StyleName;
  model: ModelId;
  instructions: string;
  agents: SwarmSize;
  agentModels: ModelId[];
};
export type CustomStep = {
  id: string;
  kind: "custom";
  label: string;
  fields: string;
  columns: TableColumn[];
  style: StyleName;
  model: ModelId;
  instructions: string;
};
export type BuilderStep = SourceStep | SchemaStep | ExtractStep | SwarmStep | CustomStep;

export function isAddableKind(value: string): value is AddableKind {
  return (ADDABLE_KINDS as readonly string[]).includes(value);
}

export function isRunStep(step: BuilderStep): step is ExtractStep | SwarmStep | CustomStep {
  return step.kind === "extract" || step.kind === "swarm" || step.kind === "custom";
}

function newId(): string {
  return `step_${Math.random().toString(36).slice(2, 10)}`;
}

export function createStep(kind: "source", id?: string): SourceStep;
export function createStep(kind: "schema", id?: string): SchemaStep;
export function createStep(kind: "extract", id?: string): ExtractStep;
export function createStep(kind: "swarm", id?: string): SwarmStep;
export function createStep(kind: "custom", id?: string): CustomStep;
export function createStep(kind: StepKind, id?: string): BuilderStep;
export function createStep(kind: StepKind, id = newId()): BuilderStep {
  switch (kind) {
    case "source":
      return { id, kind, source: "" };
    case "schema":
      return { id, kind, query: "", columns: [] };
    case "extract":
      return { id, kind, style: "direct", model: DEFAULT_MODEL, instructions: "" };
    case "swarm":
      return {
        id,
        kind,
        style: "direct",
        model: DEFAULT_MODEL,
        instructions: "",
        agents: 3,
        agentModels: resizeAgentModels([], 3, DEFAULT_MODEL),
      };
    case "custom":
      return {
        id,
        kind,
        label: "Custom",
        fields: "",
        columns: [],
        style: "direct",
        model: DEFAULT_MODEL,
        instructions: "",
      };
  }
}

export function defaultPipeline(): BuilderStep[] {
  return [createStep("source"), createStep("schema"), createStep("extract")];
}

export function stepTitle(step: BuilderStep): string {
  if (step.kind === "custom") return step.label.trim() || STEP_CATALOG.custom.label;
  return STEP_CATALOG[step.kind].label;
}

export function columnsFromFieldList(spec: string): TableColumn[] {
  const rows: Array<{ key: string; label: string; type: ColumnType }> = [];
  for (const part of spec.split(/[\n,;]+/)) {
    const line = part.trim();
    if (!line) continue;
    const typed = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(string|number|integer|boolean)\s*$/i);
    if (typed?.[1] && typed[2]) {
      const type = typed[2].toLowerCase();
      if (isColumnType(type)) rows.push({ key: typed[1], label: typed[1], type });
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(line)) {
      rows.push({ key: line, label: line, type: "string" });
    }
  }
  return normalizeColumns(rows);
}

export function resolveColumns(steps: readonly BuilderStep[], stepId: string): TableColumn[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) return [];
  const current = steps[index];
  if (current?.kind === "custom") {
    const own = current.columns.length > 0 ? current.columns : columnsFromFieldList(current.fields);
    if (own.length > 0) return own;
  }
  if (current?.kind === "schema" && current.columns.length > 0) return current.columns;
  for (let i = index - 1; i >= 0; i--) {
    const prev = steps[i];
    if (prev?.kind === "schema" && prev.columns.length > 0) return prev.columns;
    if (prev?.kind === "custom") {
      const own = prev.columns.length > 0 ? prev.columns : columnsFromFieldList(prev.fields);
      if (own.length > 0) return own;
    }
  }
  return [];
}

export function validatePipeline(steps: readonly BuilderStep[], hasFiles: boolean): string | null {
  const source = steps.find((step) => step.kind === "source");
  if (!source || (source.kind === "source" && !source.source.trim() && !hasFiles)) {
    return "Add a source (text or file).";
  }
  const runs = steps.filter(isRunStep);
  if (runs.length === 0) return "Add an extract, swarm, or custom step.";
  for (const run of runs) {
    if (resolveColumns(steps, run.id).length === 0) {
      return `${stepTitle(run)} needs columns. Add a schema or a field list.`;
    }
  }
  return null;
}

export function insertStepAt(steps: readonly BuilderStep[], kind: AddableKind, insertAt: number): BuilderStep[] {
  const next = steps.slice();
  const at = Math.max(1, Math.min(insertAt, next.length));
  next.splice(at, 0, createStep(kind));
  return next;
}

export function moveStepTo(steps: readonly BuilderStep[], fromIndex: number, insertAt: number): BuilderStep[] {
  const step = steps[fromIndex];
  if (!step || step.kind === "source") return steps.slice();
  const without = steps.filter((_, index) => index !== fromIndex);
  const at = Math.max(1, Math.min(insertAt > fromIndex ? insertAt - 1 : insertAt, without.length));
  without.splice(at, 0, step);
  return without;
}

export function removeStep(steps: readonly BuilderStep[], id: string): BuilderStep[] {
  return steps.filter((step) => step.id !== id || step.kind === "source");
}

export function patchStep(
  steps: readonly BuilderStep[],
  id: string,
  patch: object,
): BuilderStep[] {
  return steps.map((step) =>
    step.id === id ? ({ ...step, ...patch, id: step.id, kind: step.kind } as BuilderStep) : step,
  );
}
