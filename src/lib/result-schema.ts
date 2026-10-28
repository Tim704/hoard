// ───────────────────────────────────────────────────────────────────────────
//  The shape a client-sent search hit (NormalizedResult) must have before any
//  server action looks at it: addToList, addResultToList and the import
//  commit. `fields` are flat column → primitive maps of bounded size; the
//  catalogue write then keeps only the model's allow-listed columns
//  (src/lib/media-upsert.ts), so this is the first of two gates.
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

/** At most this many columns in a hit's `fields` (the widest model has ~25). */
export const MAX_FIELD_KEYS = 60;

/** One column value: a primitive, or a list of strings (genres, authors, …). */
const FieldValue = z.union([
  z.string().max(50_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
  z.array(z.string().max(2000)).max(200),
]);

export const ResultFieldsSchema = z
  .record(z.string().min(1).max(64), FieldValue)
  .refine((f) => Object.keys(f).length <= MAX_FIELD_KEYS, 'Too many fields.');

export const NormalizedResultSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  imageUrl: z.string().max(2000).nullable(),
  subtitle: z.string().max(1000).nullable(),
  year: z.number().int().min(-10_000).max(10_000).nullable(),
  description: z.string().max(50_000).nullable(),
  fields: ResultFieldsSchema,
});
