import { z } from 'zod';

/** Request validation shared by the API (enforcement) and the web app (forms). */

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254));

export const registerSchema = z.object({
  email,
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const searchSchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters.').max(120),
});

const targetPrice = z.number().int().positive().max(100_000_000).nullable();

export const favoriteCreateSchema = z.object({
  productId: z.number().int().positive(),
  targetPriceCents: targetPrice.optional(),
});

export const favoriteUpdateSchema = z.object({
  targetPriceCents: targetPrice,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type FavoriteCreateInput = z.infer<typeof favoriteCreateSchema>;
export type FavoriteUpdateInput = z.infer<typeof favoriteUpdateSchema>;
