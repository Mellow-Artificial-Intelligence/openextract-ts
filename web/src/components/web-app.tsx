"use client";

import { AgentsApp } from "@/components/agents-app";
import { AppHeader } from "@/components/app-header";
import { ExtractApp } from "@/components/extract-app";
import { cn } from "@/lib/utils";
import { useState } from "react";

const TABS = [
  { id: "extract", label: "Extract" },
  { id: "agents", label: "Agents" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function WebApp() {
  const [tab, setTab] = useState<TabId>("extract");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader
        nav={
          <div className="ml-3 flex items-center gap-3 sm:ml-6">
            {TABS.map((item) => (
              <button
                aria-current={tab === item.id ? "page" : undefined}
                className={cn(
                  "font-mono text-xs transition-colors",
                  tab === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        }
        title="openextract"
      />
      {tab === "extract" ? <ExtractApp embedded /> : <AgentsApp />}
    </div>
  );
}
