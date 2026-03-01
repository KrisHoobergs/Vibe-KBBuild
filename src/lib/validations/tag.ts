import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1, "Naam is verplicht").max(50, "Naam mag maximaal 50 tekens zijn"),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
