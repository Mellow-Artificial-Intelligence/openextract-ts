import { bearer, defineRemoteAgent } from "../../src/index.js";

export const remote = defineRemoteAgent({
  url: () => process.env.OPENEXTRACT_REMOTE_URL ?? "https://extract.example.com",
  description: "Remote extraction specialist on another openextract deployment.",
  auth: process.env.OPENEXTRACT_REMOTE_TOKEN ? bearer(process.env.OPENEXTRACT_REMOTE_TOKEN) : undefined,
});

export default remote;
