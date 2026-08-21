import { EXAMPLES } from "@/lib/presets";
import { SYSTEM_STARTERS } from "@/lib/agent-system";

export const SECTIONS = [
  {
    id: "extract",
    label: "Extract",
    blurb: "One schema, one call, validated rows.",
  },
  {
    id: "agents",
    label: "Agents",
    blurb: "Fan several specialists across one source.",
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * A click on a sidebar preset. The nonce lets the same preset be re-applied,
 * which a plain id could not express.
 */
export interface PresetRequest {
  id: string;
  nonce: number;
}

export interface PresetItem {
  id: string;
  label: string;
  blurb: string;
}

/** Static starting points per section. Nothing here is persisted. */
export function presetsFor(section: SectionId): PresetItem[] {
  if (section === "agents") {
    return SYSTEM_STARTERS.map((starter) => ({
      id: starter.id,
      label: starter.name,
      blurb: starter.blurb,
    }));
  }
  return EXAMPLES.map((example) => ({
    id: example.label,
    label: example.label,
    blurb: example.query,
  }));
}
