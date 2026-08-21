import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider, THEME_SCRIPT } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "openextract",
  description:
    "Playground for openextract — turn any document, image, audio, or video into validated structured data in one call.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-dvh overflow-hidden antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="flex h-dvh touch-manipulation flex-col overflow-hidden overscroll-none bg-background text-foreground">
        {/* Injected into <head> and run before hydration, so the first paint is already themed. */}
        <Script
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
          id="openextract-theme"
          strategy="beforeInteractive"
        />
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
