/** True when the web UI can call AI Gateway (local key or Vercel OIDC). */
export function hasGatewayAuth(): boolean {
  // VERCEL_OIDC_TOKEN is injected at runtime and is not available at Next.js
  // build time, so do not read it from process.env here.
  return Boolean(process.env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL);
}
