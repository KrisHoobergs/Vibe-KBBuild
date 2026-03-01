import { z } from "zod";

export const createArticleSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(200, "Titel mag maximaal 200 tekens zijn"),
  excerpt: z.string().max(500, "Samenvatting mag maximaal 500 tekens zijn").optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  content_text: z.string().default(""),
  cover_image_url: z.string().url("Ongeldige URL").optional().or(z.literal("")),
  tag_ids: z.array(z.string().uuid()).default([]),
});

export const updateArticleSchema = createArticleSchema.partial();

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
