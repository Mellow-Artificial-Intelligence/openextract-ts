"use client";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  columnsFromFieldList,
  STEP_CATALOG,
  stepTitle,
  type BuilderStep,
  type CustomStep,
  type ExtractStep,
  type SchemaStep,
  type SourceStep,
  type SwarmStep,
} from "@/lib/builder";
import { MODELS, resizeAgentModels, SWARM_SIZES, type ModelId, type SwarmSize } from "@/lib/models";
import { STYLE_DETAILS, STYLES, type StyleName } from "@/lib/presets";
import { COLUMN_TYPES, nextColumn, type ColumnType, type TableColumn } from "@/lib/table-schema";
import type { FileUIPart } from "ai";
import { PlusIcon, Trash2Icon } from "lucide-react";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <Label className="font-mono text-sm" htmlFor={id}>
          {label}
        </Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StyleField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: StyleName;
  onChange: (style: StyleName) => void;
}) {
  return (
    <Field hint={STYLE_DETAILS[value].description} id={id} label="Style">
      <Select onValueChange={(next) => onChange(next as StyleName)} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STYLES.map((name) => (
            <SelectItem key={name} value={name}>
              {STYLE_DETAILS[name].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ModelField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ModelId;
  onChange: (model: ModelId) => void;
}) {
  return (
    <Field id={id} label="Model">
      <Select onValueChange={(next) => onChange(next as ModelId)} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODELS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <span className="flex items-center gap-2">
                <ModelSelectorLogo provider={item.provider} />
                {item.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ColumnEditor({
  columns,
  disabled,
  onChange,
}: {
  columns: TableColumn[];
  disabled?: boolean;
  onChange: (columns: TableColumn[]) => void;
}) {
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {columns.map((column) => (
          <li className="flex items-center gap-1.5" key={column.key}>
            <Input
              aria-label={`${column.label} name`}
              className="h-8 min-w-0 flex-1"
              disabled={disabled}
              onChange={(event) =>
                onChange(columns.map((item) => (item.key === column.key ? { ...item, label: event.target.value } : item)))
              }
              value={column.label}
            />
            <Select
              disabled={disabled}
              onValueChange={(type) =>
                onChange(columns.map((item) => (item.key === column.key ? { ...item, type: type as ColumnType } : item)))
              }
              value={column.type}
            >
              <SelectTrigger aria-label={`${column.label} type`} className="h-8 w-[6.5rem]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMN_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label={`Remove ${column.label}`}
              disabled={disabled || columns.length <= 1}
              onClick={() => onChange(columns.filter((item) => item.key !== column.key))}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        disabled={disabled}
        onClick={() => onChange([...columns, nextColumn(columns)])}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon />
        Column
      </Button>
    </div>
  );
}

async function fileToPart(file: File): Promise<FileUIPart> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    type: "file",
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    url,
  };
}

export function BuilderInspector({
  step,
  generating,
  onGenerate,
  onPatch,
  onStopGenerate,
  sourceFiles,
  onSourceFiles,
}: {
  step: BuilderStep | undefined;
  generating?: boolean;
  onGenerate?: () => void;
  onStopGenerate?: () => void;
  onPatch: (patch: object) => void;
  sourceFiles?: FileUIPart[];
  onSourceFiles?: (files: FileUIPart[]) => void;
}) {
  if (!step) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Step</p>
        <p className="text-muted-foreground text-sm">Select a step to configure it.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-black/5 px-4 py-3">
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {STEP_CATALOG[step.kind].label}
        </p>
        <h2 className="font-medium text-sm">{stepTitle(step)}</h2>
        <p className="text-muted-foreground text-xs">{STEP_CATALOG[step.kind].hint}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {step.kind === "source" ? (
          <>
            <Field hint="Paste text, attach a file, or both." id="builder-source" label="Text">
              <Textarea
                className="min-h-28 font-mono text-sm"
                id="builder-source"
                onChange={(event) => onPatch({ source: event.target.value } satisfies Partial<SourceStep>)}
                placeholder="Paste a document, log, or invoice…"
                value={step.source}
              />
            </Field>
            <Field id="builder-files" label="Files">
              <Input
                id="builder-files"
                multiple
                onChange={(event) => {
                  const incoming = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (!incoming.length || !onSourceFiles) return;
                  void Promise.all(incoming.map(fileToPart)).then((added) =>
                    onSourceFiles([...(sourceFiles ?? []), ...added]),
                  );
                }}
                type="file"
              />
              {sourceFiles?.length ? (
                <ul className="mt-2 space-y-1">
                  {sourceFiles.map((file, index) => (
                    <li className="flex items-center gap-2 font-mono text-xs" key={`${file.filename}-${index}`}>
                      <span className="min-w-0 flex-1 truncate">{file.filename ?? "file"}</span>
                      <Button
                        aria-label={`Remove ${file.filename ?? "file"}`}
                        onClick={() => onSourceFiles?.(sourceFiles.filter((_, i) => i !== index))}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          </>
        ) : null}

        {step.kind === "schema" ? (
          <>
            <Field hint="Describe the table. Generate fills columns you can edit." id="builder-query" label="Describe">
              <Textarea
                className="min-h-20 text-sm"
                id="builder-query"
                onChange={(event) => onPatch({ query: event.target.value } satisfies Partial<SchemaStep>)}
                placeholder="e.g. invoice line items with quantity and amount"
                value={step.query}
              />
            </Field>
            {generating ? (
              <Button onClick={onStopGenerate} type="button" variant="outline">
                Stop
              </Button>
            ) : (
              <Button disabled={!step.query.trim()} onClick={onGenerate} type="button">
                Generate columns
              </Button>
            )}
            <Field id="builder-columns" label="Columns">
              <ColumnEditor
                columns={step.columns}
                disabled={generating}
                onChange={(columns) => onPatch({ columns } satisfies Partial<SchemaStep>)}
              />
            </Field>
          </>
        ) : null}

        {step.kind === "custom" ? (
          <>
            <Field id="builder-custom-name" label="Name">
              <Input
                id="builder-custom-name"
                onChange={(event) => onPatch({ label: event.target.value } satisfies Partial<CustomStep>)}
                value={step.label}
              />
            </Field>
            <Field
              hint="One field per line, like vendor: string or total: number."
              id="builder-fields"
              label="Fields"
            >
              <Textarea
                className="min-h-28 font-mono text-sm"
                id="builder-fields"
                onChange={(event) => {
                  const fields = event.target.value;
                  onPatch({ fields, columns: columnsFromFieldList(fields) } satisfies Partial<CustomStep>);
                }}
                placeholder={"vendor: string\ntotal: number\npaid: boolean"}
                value={step.fields}
              />
            </Field>
            {step.columns.length > 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {step.columns.map((column) => `${column.key}:${column.type}`).join(" · ")}
              </p>
            ) : null}
          </>
        ) : null}

        {step.kind === "extract" || step.kind === "swarm" || step.kind === "custom" ? (
          <>
            <StyleField
              id="builder-style"
              onChange={(style) => onPatch({ style })}
              value={step.style}
            />
            {step.kind === "swarm" ? (
              <Field hint="How many agents extract this source in parallel." id="builder-agents" label="Agents">
                <Select
                  onValueChange={(value) => {
                    const agents = Number(value) as SwarmSize;
                    onPatch({
                      agents,
                      agentModels: resizeAgentModels(step.agentModels, agents, step.model),
                    } satisfies Partial<SwarmStep>);
                  }}
                  value={String(step.agents)}
                >
                  <SelectTrigger className="w-full" id="builder-agents">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SWARM_SIZES.filter((count) => count > 1).map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} agents
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <ModelField
                id="builder-model"
                onChange={(model) => onPatch({ model })}
                value={step.model}
              />
            )}
            {step.kind === "swarm"
              ? step.agentModels.map((id, index) => (
                  <Field id={`builder-agent-${index}`} key={`agent-${index}`} label={`Agent ${index + 1}`}>
                    <Select
                      onValueChange={(value) => {
                        const agentModels = step.agentModels.map((current, i) =>
                          i === index ? (value as ModelId) : current,
                        );
                        onPatch({ agentModels, model: agentModels[0] } satisfies Partial<SwarmStep>);
                      }}
                      value={id}
                    >
                      <SelectTrigger className="w-full" id={`builder-agent-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODELS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            <span className="flex items-center gap-2">
                              <ModelSelectorLogo provider={item.provider} />
                              {item.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))
              : null}
            <Field hint="Optional guidance for this step only." id="builder-instructions" label="Instructions">
              <Textarea
                className="min-h-20 text-sm"
                id="builder-instructions"
                onChange={(event) =>
                  onPatch({ instructions: event.target.value } satisfies Partial<ExtractStep>)
                }
                placeholder="e.g. Use ISO dates and leave unknown fields null."
                value={step.instructions}
              />
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}
