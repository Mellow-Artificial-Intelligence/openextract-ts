import { defineRemoteAgent } from "../../../src/index.js";
import { bearer } from "../../../src/agent-auth.js";
import { Invoice } from "../../schemas.js";

export default defineRemoteAgent({
  url: () => process.env.OPENEXTRACT_REMOTE_URL ?? "https://extract.example.com",
  description: "Remote extraction specialist on another openextract deployment.",
  auth: process.env.OPENEXTRACT_REMOTE_TOKEN ? bearer(process.env.OPENEXTRACT_REMOTE_TOKEN) : undefined,
  outputSchema: Invoice,
});
