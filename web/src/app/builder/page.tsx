import { ExtractBuilder } from "@/components/extract-builder";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Builder · openextract",
  description: "Drag and drop extract, swarm, and custom steps into a pipeline.",
};

export default function BuilderPage() {
  return <ExtractBuilder />;
}
