import type { CodingOptions } from "@/lib/harness";
import type { StyleName } from "@/lib/presets";
import type { TableColumn } from "@/lib/table-schema";

export interface ExtractTableInput {
  query: string;
  source: string;
  files: unknown;
  columns: TableColumn[];
  model: string;
  style: StyleName;
  instructions?: string;
  coding?: CodingOptions;
}

export interface PreparedExtract {
  model: string;
  system: string;
  prompt: string;
  style: StyleName;
  text: string;
  files: Array<{ mediaType: string; data: string }>;
  columns: TableColumn[];
  coding?: CodingOptions;
}
