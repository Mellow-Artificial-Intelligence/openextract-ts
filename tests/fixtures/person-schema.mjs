import { z } from "zod";

export const Person = z.object({
  name: z.string(),
});
