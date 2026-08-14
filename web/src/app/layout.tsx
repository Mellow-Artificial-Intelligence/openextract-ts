import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "openextract",
  description: "Extract structured data from documents with a streaming local UI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      lang="en"
    >
      <body className="flex h-full flex-col bg-background text-foreground">
        <TooltipProvider>
          <header className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-4">
            <span className="font-medium text-sm tracking-tight">openextract</span>
            <span className="text-muted-foreground text-sm">
              structured data from any file, URL, or pasted text
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </TooltipProvider>
      </body>
    </html>
  );
}
