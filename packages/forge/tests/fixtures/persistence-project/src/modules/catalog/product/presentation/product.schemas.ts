import { z } from 'zod';

export const productIdSchema = z.uuid();

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(200),
  expectedVersion: z.number().int().positive(),
}).strict();
