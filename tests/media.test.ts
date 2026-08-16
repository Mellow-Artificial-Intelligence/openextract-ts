import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InputTooLargeError, UrlFetchError } from "../src/exceptions.js";
import {
  getMedia,
  getMediaType,
  inCidr,
  isPublicIp,
  isSafeHost,
  itemSourceLabel,
  readUrl,
  safeSourceContext,
} from "../src/media.js";

afterEach(() => {
  delete process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS;
});

describe("media helpers", () => {
  it("guesses common extensions", () => {
    expect(getMediaType("a.pdf")).toBe("application/pdf");
    expect(getMediaType("a.PNG")).toBe("image/png");
    expect(getMediaType("a.unknown")).toBe("application/octet-stream");
  });

  it("strips credentials and query strings from URLs", () => {
    expect(safeSourceContext("https://user:pass@example.com/doc.pdf?token=1")).toBe(
      "URL https://example.com/doc.pdf",
    );
    expect(safeSourceContext("/tmp/q4.pdf")).toBe("path 'q4.pdf'");
  });

  it("labels named inputs first", () => {
    expect(itemSourceLabel("https://example.com/a.pdf", "invoice")).toBe("invoice");
    expect(itemSourceLabel(new Uint8Array())).toBeNull();
  });
});

describe("SSRF host checks", () => {
  it("rejects loopback, private, and metadata addresses", () => {
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("10.0.0.1")).toBe(false);
    expect(isPublicIp("192.168.1.1")).toBe(false);
    expect(isPublicIp("169.254.169.254")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("0.1.2.3")).toBe(false);
    expect(isPublicIp("100.64.1.1")).toBe(false);
    expect(isPublicIp("172.16.0.1")).toBe(false);
    expect(isPublicIp("192.0.0.1")).toBe(false);
    expect(isPublicIp("192.0.2.1")).toBe(false);
    expect(isPublicIp("198.18.0.1")).toBe(false);
    expect(isPublicIp("198.51.100.1")).toBe(false);
    expect(isPublicIp("203.0.113.1")).toBe(false);
    expect(isPublicIp("224.0.0.1")).toBe(false);
    expect(isPublicIp("240.0.0.1")).toBe(false);
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("::")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
    expect(isPublicIp("febf::1")).toBe(false);
    expect(isPublicIp("fc00::1")).toBe(false);
    expect(isPublicIp("fd12::1")).toBe(false);
    expect(isPublicIp("ff02::1")).toBe(false);
    expect(isPublicIp("2001:db8::1")).toBe(false);
    expect(isPublicIp("2001:4860:4860::8888")).toBe(true);
    expect(inCidr("1.2.3.4", "0.0.0.0", 0)).toBe(true);
    expect(safeSourceContext("https://example.com:8443/doc")).toBe("URL https://example.com:8443/doc");
  });

  it("refuses private hosts unless opted out", async () => {
    expect(await isSafeHost("127.0.0.1")).toBe(false);
    expect(await isSafeHost(null)).toBe(false);
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    expect(await isSafeHost("127.0.0.1")).toBe(true);
  });

  it("resolves hostnames and treats lookup failures as unsafe", async () => {
    expect(await isSafeHost("example.com")).toBe(true);
    expect(await isSafeHost("localhost")).toBe(false);
    expect(await isSafeHost("this-host-should-not-exist.openextract.test")).toBe(false);
  });
});

describe("getMedia", () => {
  it("reads a local path", async () => {
    const path = join(tmpdir(), `openextract-${Date.now()}.txt`);
    await writeFile(path, "hello");
    const { data, mediaType } = await getMedia(path);
    expect(Buffer.from(data).toString()).toBe("hello");
    expect(mediaType).toBe("text/plain");
  });

  it("requires mediaType for bytes and streams", async () => {
    await expect(getMedia(Buffer.from("x"))).rejects.toThrow(/mediaType is required/);
    const streamPath = join(tmpdir(), `openextract-need-type-${Date.now()}.txt`);
    await writeFile(streamPath, "x");
    await expect(getMedia(createReadStream(streamPath))).rejects.toThrow(/mediaType is required/);
    await expect(getMedia(Buffer.from("x"), { mediaType: "text/plain" })).resolves.toMatchObject({
      mediaType: "text/plain",
    });
  });

  it("caps oversized bytes", async () => {
    await expect(
      getMedia(Buffer.alloc(8), { mediaType: "text/plain", maxInputBytes: 4 }),
    ).rejects.toBeInstanceOf(InputTooLargeError);
  });

  it("reads a stream under the cap", async () => {
    const path = join(tmpdir(), `openextract-stream-${Date.now()}.txt`);
    await writeFile(path, "abc");
    const { data } = await getMedia(createReadStream(path), {
      mediaType: "text/plain",
    });
    expect(Buffer.from(data).toString()).toBe("abc");
  });

  it("refuses private URLs", async () => {
    await expect(getMedia("http://127.0.0.1/secret")).rejects.toBeInstanceOf(UrlFetchError);
  });

  it("reads URL objects, named inputs, and rejects unknown sources", async () => {
    const path = join(tmpdir(), `openextract-named-${Date.now()}.json`);
    await writeFile(path, "{}");
    const named = await getMedia({ source: path, name: "note", mediaType: "application/json" });
    expect(named.mediaType).toBe("application/json");
    const inferred = await getMedia({ source: path, name: "note" });
    expect(inferred.mediaType).toBe("application/json");
    const overridden = await getMedia(path, { mediaType: "text/csv" });
    expect(overridden.mediaType).toBe("text/csv");
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })),
    );
    try {
      await expect(getMedia(new URL("http://example.com/doc.txt"))).resolves.toMatchObject({ mediaType: "text/plain" });
      await expect(getMedia(new URL("http://example.com/doc.txt"), { mediaType: "text/csv" })).resolves.toMatchObject({
        mediaType: "text/csv",
      });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS;
    }
    expect(itemSourceLabel(new URL("https://example.com/a.pdf"))).toBe("URL https://example.com/a.pdf");
    await expect(getMedia(123 as never)).rejects.toThrow(/readable stream/);
  });

  it("caps oversized local files", async () => {
    const path = join(tmpdir(), `openextract-big-${Date.now()}.txt`);
    await writeFile(path, "hello world");
    await expect(getMedia(path, { maxInputBytes: 4 })).rejects.toBeInstanceOf(InputTooLargeError);
  });

  it("caps oversized streams", async () => {
    await expect(
      getMedia(Readable.from(["abcdef"]), { mediaType: "text/plain", maxInputBytes: 3 }),
    ).rejects.toBeInstanceOf(InputTooLargeError);
  });
});

describe("readUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS;
    delete process.env.OPENEXTRACT_MAX_REDIRECTS;
  });

  it("follows redirects and uses content-type for unknown extensions", async () => {
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://example.com/go") {
        return new Response(null, { status: 302, headers: { location: "/file.bin" } });
      }
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { data, headers } = await readUrl("http://example.com/go", 1024);
    expect(Buffer.from(data).toString()).toBe("ok");
    expect(headers.get("content-type")).toContain("text/plain");
    const media = await getMedia("http://example.com/file.bin");
    expect(media.mediaType).toBe("text/plain");
  });

  it("rejects missing locations, failed fetches, and too many hops", async () => {
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302 })),
    );
    await expect(readUrl("http://example.com/a", 1024)).rejects.toBeInstanceOf(UrlFetchError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(readUrl("http://example.com/a", 1024)).rejects.toThrow(/Failed to fetch URL: 404/);
    process.env.OPENEXTRACT_MAX_REDIRECTS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302, headers: { location: "/next" } })),
    );
    await expect(readUrl("http://example.com/a", 1024)).rejects.toThrow(/Too many redirects/);
  });

  it("rejects oversized content-length and invalid URLs", async () => {
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 200, headers: { "content-length": "99" } })),
    );
    await expect(readUrl("http://example.com/a", 4)).rejects.toBeInstanceOf(InputTooLargeError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await expect(readUrl("http://example.com/empty", 1024)).resolves.toMatchObject({ data: new Uint8Array() });
    await expect(readUrl("http://[", 1024)).rejects.toBeInstanceOf(UrlFetchError);
  });
});

