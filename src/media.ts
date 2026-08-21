import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import {
  MAX_INPUT_BYTES_ENV,
  allowPrivateUrls,
  maxRedirects,
  resolveMaxInputBytes,
  urlFetchTimeout,
} from "./config.js";
import { InputTooLargeError, UrlFetchError } from "./exceptions.js";
import {
  isExtractionInput,
  type ExtractionInputLike,
  type MediaSource,
} from "./types.js";

const DEFAULT_MEDIA_TYPE = "application/octet-stream";
const CHUNK_SIZE = 64 * 1024;
const BYTES_MEDIA_TYPE_REQUIRED =
  "mediaType is required when inputFile is bytes or a stream; " +
  "pass it explicitly, e.g. extract(..., { mediaType: 'application/pdf' }).";

const EXTENSION_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
  ".js": "application/javascript",
  ".ts": "text/plain",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function getMediaType(filePath: string): string {
  return EXTENSION_TYPES[extname(new URL(filePath, "file://").pathname).toLowerCase()]
    ?? DEFAULT_MEDIA_TYPE;
}

export function safeSourceContext(source: string): string {
  if (isHttpUrl(source)) {
    const parsed = new URL(source);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `URL ${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname || /* v8 ignore next */ "/"}`;
  }
  return `path '${basename(source)}'`;
}

export function itemSourceLabel(source: MediaSource, name?: string): string | null {
  if (name != null) return name;
  if (typeof source === "string") return safeSourceContext(source);
  if (source instanceof URL) return safeSourceContext(source.href);
  return null;
}

function inputTooLarge(limit: number, observed: number, source: string): InputTooLargeError {
  return new InputTooLargeError(
    `${source} exceeds the configured size limit (${limit} bytes); ` +
      `got at least ${observed} bytes. Set ${MAX_INPUT_BYTES_ENV} ` +
      "or pass maxInputBytes if this is intentional.",
  );
}

function enforceMax(data: Uint8Array, limit: number, source: string): Uint8Array {
  if (data.byteLength > limit) {
    throw inputTooLarge(limit, data.byteLength, source);
  }
  return data;
}

async function readStreamLimited(
  stream: NodeJS.ReadableStream,
  limit: number,
  source: string,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw inputTooLarge(limit, total, source);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

export function inCidr(ip: string, start: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(start) & mask);
}

export function isPublicIp(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPublicIp(mapped[1]);
  const version = isIP(ip);
  if (version === 4) {
    return !(
      inCidr(ip, "0.0.0.0", 8) ||
      inCidr(ip, "10.0.0.0", 8) ||
      inCidr(ip, "100.64.0.0", 10) ||
      inCidr(ip, "127.0.0.0", 8) ||
      inCidr(ip, "169.254.0.0", 16) ||
      inCidr(ip, "172.16.0.0", 12) ||
      inCidr(ip, "192.0.0.0", 24) ||
      inCidr(ip, "192.0.2.0", 24) ||
      inCidr(ip, "192.168.0.0", 16) ||
      inCidr(ip, "198.18.0.0", 15) ||
      inCidr(ip, "198.51.100.0", 24) ||
      inCidr(ip, "203.0.113.0", 24) ||
      inCidr(ip, "224.0.0.0", 4) ||
      inCidr(ip, "240.0.0.0", 4)
    );
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("fe80:") || normalized.startsWith("feb")) return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (normalized.startsWith("ff")) return false;
    if (normalized.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

export async function isSafeHost(host: string | null): Promise<boolean> {
  if (allowPrivateUrls()) return true;
  if (!host) return false;
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return isPublicIp(bare);
  try {
    const records = await lookup(bare, { all: true });
    return records.length > 0 && records.every((record) => isPublicIp(record.address));
  } catch {
    return false;
  }
}

async function requireSafeUrl(url: string): Promise<void> {
  let host: string | null;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new UrlFetchError(`Refusing to fetch URL with non-public host: ${url}`);
  }
  if (!(await isSafeHost(host))) {
    throw new UrlFetchError(`Refusing to fetch URL with non-public host: '${host}'`);
  }
}

async function readResponseLimited(
  response: Response,
  limit: number,
  source: string,
): Promise<Uint8Array> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    throw inputTooLarge(limit, length, source);
  }
  if (!response.body) return new Uint8Array();
  return readStreamLimited(Readable.fromWeb(response.body as never), limit, source);
}

export async function readUrl(
  url: string,
  limit: number,
): Promise<{ data: Uint8Array; headers: Headers }> {
  let current = url;
  const hops = maxRedirects();
  const timeoutMs = urlFetchTimeout() * 1000;
  for (let i = 0; i < hops; i++) {
    await requireSafeUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UrlFetchError(`Redirect from '${current}' missing Location header`);
      }
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) {
      throw new UrlFetchError(`Failed to fetch URL: ${response.status}`);
    }
    return {
      data: await readResponseLimited(response, limit, safeSourceContext(current)),
      headers: response.headers,
    };
  }
  throw new UrlFetchError(`Too many redirects (>${hops})`);
}

function mediaFromContent(
  filePath: string,
  content: Uint8Array,
  headers: Headers,
): { data: Uint8Array; mediaType: string } {
  let mediaType = getMediaType(filePath);
  if (mediaType === DEFAULT_MEDIA_TYPE) {
    const header = headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (header) mediaType = header;
  }
  return { data: content, mediaType };
}

async function readFromPath(
  filePath: string,
  maxInputBytes: number,
): Promise<{ data: Uint8Array; mediaType: string }> {
  if (isHttpUrl(filePath)) {
    const { data, headers } = await readUrl(filePath, maxInputBytes);
    return mediaFromContent(filePath, data, headers);
  }
  const source = safeSourceContext(filePath);
  const size = (await stat(filePath)).size;
  if (size > maxInputBytes) throw inputTooLarge(maxInputBytes, size, source);
  const data = await readStreamLimited(createReadStream(filePath), maxInputBytes, source);
  return { data, mediaType: getMediaType(filePath) };
}

function isReadable(value: unknown): value is NodeJS.ReadableStream {
  return (
    typeof value === "object" &&
    value !== null &&
    "read" in value &&
    typeof (value as { read?: unknown }).read === "function"
  );
}

export async function getMedia(
  inputFile: ExtractionInputLike,
  options: { mediaType?: string; maxInputBytes?: number } = {},
): Promise<{ data: Uint8Array; mediaType: string }> {
  let mediaType = options.mediaType;
  let source: MediaSource = inputFile as MediaSource;
  if (isExtractionInput(inputFile)) {
    mediaType ??= inputFile.mediaType;
    source = inputFile.source;
  }
  const limit = resolveMaxInputBytes(options.maxInputBytes);
  if (typeof source === "string" || source instanceof URL) {
    const resolved = await readFromPath(typeof source === "string" ? source : source.href, limit);
    return { data: resolved.data, mediaType: mediaType ?? resolved.mediaType };
  }
  if (source instanceof Uint8Array) {
    if (mediaType == null) throw new TypeError(BYTES_MEDIA_TYPE_REQUIRED);
    return { data: enforceMax(source, limit, "bytes input"), mediaType };
  }
  if (isReadable(source)) {
    if (mediaType == null) throw new TypeError(BYTES_MEDIA_TYPE_REQUIRED);
    return { data: await readStreamLimited(source, limit, "file-like input"), mediaType };
  }
  throw new TypeError(
    "inputFile must be a string path/URL, URL, Uint8Array, or a readable stream.",
  );
}
