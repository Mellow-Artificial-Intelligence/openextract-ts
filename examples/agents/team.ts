import { defineAgent } from "../../src/index.js";
import invoice from "./invoice.js";
import search from "./search.js";

export const team = defineAgent({
  description: "Invoice team: direct extract plus a search specialist.",
  subagents: [invoice, search],
});

export default team;
