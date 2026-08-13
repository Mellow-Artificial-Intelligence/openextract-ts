import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InputTooLargeError, UrlFetchError } from "../src/exceptions.js";
import {
  getMedia,
  getMediaType,
  isPublicIp,
  isSafeHost,
  itemSourceLabel,
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
  });

  it("refuses private hosts unless opted out", async () => {
    expect(await isSafeHost("127.0.0.1")).toBe(false);
    expect(await isSafeHost(null)).toBe(false);
    process.env.OPENEXTRACT_ALLOW_PRIVATE_URLS = "1";
    expect(await isSafeHost("127.0.0.1")).toBe(true);
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
});
