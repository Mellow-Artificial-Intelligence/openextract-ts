import type { OutboundAuthFn } from "./agent.js";

export function bearer(token: string | (() => string | Promise<string>)): OutboundAuthFn {
  return async () => ({
    Authorization: `Bearer ${typeof token === "function" ? await token() : token}`,
  });
}

export function basic(
  creds:
    | { username: string; password: string }
    | (() => { username: string; password: string } | Promise<{ username: string; password: string }>),
): OutboundAuthFn {
  return async () => {
    const { username, password } = typeof creds === "function" ? await creds() : creds;
    return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
  };
}

export function vercelOidc(): OutboundAuthFn {
  return async () => {
    const token = process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error("VERCEL_OIDC_TOKEN is not set.");
    return { Authorization: `Bearer ${token}` };
  };
}
