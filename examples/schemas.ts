import { z } from "zod";

export const DocumentInfo = z.object({
  title: z.string(),
  summary: z.string(),
  language: z.string(),
});

export const Invoice = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    }),
  ),
});
