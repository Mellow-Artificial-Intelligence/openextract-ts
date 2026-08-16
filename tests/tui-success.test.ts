import { describe, expect, it, vi } from "vitest";

vi.mock("../src/tui/app.js", () => ({
  runApp: async () => ({}),
}));

const { launchTui } = await import("../src/tui.js");

describe("launchTui success", () => {
  it("returns 0 when the app starts", async () => {
    await expect(launchTui()).resolves.toBe(0);
  });
});
