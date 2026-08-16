import { afterEach, describe, expect, it, vi } from "vitest";
import { isMainModule, main } from "../src/mcp-cli.js";
import * as mcp from "../src/mcp.js";

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`EXIT:${code ?? 0}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isMainModule", () => {
  it("compares the executing file URL", () => {
    expect(isMainModule("file:///tmp/mcp.js", "/tmp/mcp.js")).toBe(true);
    expect(isMainModule("file:///tmp/mcp.js", "/tmp/other.js")).toBe(false);
    expect(isMainModule("file:///tmp/mcp.js")).toBe(false);
  });
});

describe("mcp cli", () => {
  it("prints help and rejects bad flags", async () => {
    const exit = mockExit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(main(["--help"])).rejects.toThrow("EXIT:0");
    await expect(main(["-h"])).rejects.toThrow("EXIT:0");
    await expect(main(["--nope"])).rejects.toThrow("EXIT:1");
    await expect(main(["--host"])).rejects.toThrow("EXIT:1");
    await expect(main(["--port", "0"])).rejects.toThrow("EXIT:1");
    await expect(main(["--port"])).rejects.toThrow("EXIT:1");
    exit.mockRestore();
  });

  it("starts HTTP and stdio servers", async () => {
    const http = vi.spyOn(mcp, "startOpenExtractMcpHttpServer").mockReturnValue({} as never);
    const connect = vi.fn(async () => {});
    vi.spyOn(mcp, "createOpenExtractMcpServer").mockReturnValue({ connect } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await main(["--http", "--host", "127.0.0.1", "--port", "3456"]);
    expect(http).toHaveBeenCalledWith({ host: "127.0.0.1", port: 3456 });
    await main([]);
    expect(connect).toHaveBeenCalled();
  });
});
