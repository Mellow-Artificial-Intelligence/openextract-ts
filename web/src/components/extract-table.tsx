"use client";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Overline } from "@/components/ui/overline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as DataRow,
} from "@/components/ui/table";
import {
  COLUMN_TYPES,
  cellText,
  compareCell,
  nextColumn,
  rowsToJson,
  type ColumnType,
  type TableColumn,
  type TableRow,
} from "@/lib/table-schema";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

type DataTableFeatures = typeof features;
const columnHelper = createColumnHelper<DataTableFeatures, TableRow>();

const COPIED_RESET_MS = 1500;

export function ExtractTable({
  title,
  columns,
  rows,
  onColumnsChange,
  onRowsChange,
  schemaLoading,
  extracting,
  emptyHint,
}: {
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  onColumnsChange: Dispatch<SetStateAction<TableColumn[]>>;
  onRowsChange: Dispatch<SetStateAction<TableRow[]>>;
  schemaLoading: boolean;
  extracting: boolean;
  emptyHint: string;
}) {
  const [copied, setCopied] = useState(false);
  const busy = schemaLoading || extracting;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const updateColumn = useCallback(
    (key: string, patch: Partial<TableColumn>) => {
      onColumnsChange((prev) => prev.map((column) => (column.key === key ? { ...column, ...patch } : column)));
    },
    [onColumnsChange],
  );

  const removeColumn = useCallback(
    (key: string) => {
      onColumnsChange((prev) => prev.filter((column) => column.key !== key));
      onRowsChange((prev) =>
        prev.map((row) => {
          const values = { ...row.values };
          delete values[key];
          return { ...row, values };
        }),
      );
    },
    [onColumnsChange, onRowsChange],
  );

  const updateCell = useCallback(
    (rowId: string, key: string, value: string) => {
      onRowsChange((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row)),
      );
    },
    [onRowsChange],
  );

  const defs = useMemo(
    () =>
      columnHelper.columns([
        ...columns.map((column) =>
          columnHelper.accessor((row) => row.values[column.key], {
            id: column.key,
            header: () => (
              <div className="flex min-w-36 flex-col gap-1 sm:min-w-48 sm:flex-row sm:items-center">
                <Input
                  aria-label={`${column.label} column name`}
                  className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-medium shadow-none focus-visible:border-ring sm:h-7"
                  disabled={busy}
                  onChange={(event) => updateColumn(column.key, { label: event.target.value })}
                  value={column.label}
                />
                <div className="flex items-center gap-1">
                <Select
                  disabled={busy}
                  onValueChange={(value) => updateColumn(column.key, { type: value as ColumnType })}
                  value={column.type}
                >
                  <SelectTrigger
                    aria-label={`${column.label} type`}
                    className="h-8 min-w-[5.5rem] px-1.5 text-[11px] sm:h-7"
                    size="sm"
                  >
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
                  className="size-8 sm:size-6"
                  disabled={busy || columns.length <= 1}
                  onClick={() => removeColumn(column.key)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
                </div>
              </div>
            ),
            cell: ({ row }) => (
              <Input
                aria-label={`${column.label} for row`}
                className="h-8 min-w-28 border-transparent bg-transparent px-1.5 shadow-none focus-visible:border-ring sm:h-7 sm:min-w-32"
                disabled={busy}
                onChange={(event) => updateCell(row.original.id, column.key, event.target.value)}
                value={cellText(row.original.values[column.key])}
              />
            ),
            sortFn: (rowA, rowB) =>
              compareCell(rowA.original.values[column.key], rowB.original.values[column.key], column.type),
          }),
        ),
        columnHelper.display({
          id: "_row",
          enableSorting: false,
          header: () => <span className="sr-only">Row actions</span>,
          cell: ({ row }) => (
            <Button
              aria-label="Remove row"
              className="size-8 sm:size-6"
              disabled={busy}
              onClick={() => onRowsChange((prev) => prev.filter((item) => item.id !== row.original.id))}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          ),
        }),
      ]),
    [busy, columns, onRowsChange, removeColumn, updateCell, updateColumn],
  );

  const table = useTable({
    features,
    data: rows,
    columns: defs,
    getRowId: (row) => row.id,
  });

  const copyJson = async () => {
    const json = JSON.stringify(rowsToJson(columns, rows), null, 2);
    if (!navigator?.clipboard?.writeText || !json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked.
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/50 px-3 py-2 sm:flex-row sm:items-center sm:px-4">
        <div className="min-w-0 flex-1">
          {schemaLoading ? (
            <Shimmer as="span" className="text-sm">
              Designing columns…
            </Shimmer>
          ) : extracting ? (
            <Shimmer as="span" className="text-sm">
              Filling rows…
            </Shimmer>
          ) : (
            <h2 className="truncate font-medium text-sm">{title || "Table"}</h2>
          )}
          <p className="font-mono text-[10px] text-muted-foreground">
            {columns.length} {columns.length === 1 ? "col" : "cols"} · {rows.length}{" "}
            {rows.length === 1 ? "row" : "rows"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            disabled={busy}
            onClick={() => onColumnsChange((prev) => [...prev, nextColumn(prev)])}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            <span className="hidden sm:inline">Column</span>
          </Button>
          <Button
            disabled={busy || columns.length === 0}
            onClick={() => onRowsChange((prev) => [...prev, { id: nanoid(), values: {} }])}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            <span className="hidden sm:inline">Row</span>
          </Button>
          <Button disabled={rows.length === 0} onClick={() => void copyJson()} size="sm" type="button" variant="outline">
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span className="hidden sm:inline">JSON</span>
          </Button>
        </div>
      </div>

      {columns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center sm:p-8">
          <Overline>Table</Overline>
          <h3 className="font-medium text-sm">{title || "Table"}</h3>
          <p className="max-w-sm text-muted-foreground text-sm">{emptyHint}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <DataRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      className="align-top fade-in slide-in-from-left-2 animate-in"
                      key={header.id}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-start gap-1">
                          <div className="min-w-0 flex-1">
                            <table.FlexRender header={header} />
                          </div>
                          {header.column.getCanSort() ? (
                            <Button
                              aria-label={`Sort ${header.column.id}`}
                              className="mt-0.5"
                              onClick={() => header.column.toggleSorting(header.column.getIsSorted() === "asc")}
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                            >
                              {header.column.getIsSorted() === "asc" ? (
                                <ArrowUpIcon />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ArrowDownIcon />
                              ) : (
                                <ArrowUpDownIcon />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableHead>
                  ))}
                </DataRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <DataRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={defs.length}>
                    {emptyHint}
                  </TableCell>
                </DataRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <DataRow
                    className="fade-in slide-in-from-bottom-1 animate-in"
                    key={row.id}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell className="whitespace-normal" key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </DataRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
