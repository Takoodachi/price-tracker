import type { z } from 'zod';
import { HttpError } from './errors';

export class ValidationError extends HttpError {
  constructor(readonly fields: Record<string, string>) {
    super(400, Object.values(fields)[0] ?? 'Invalid request.', 'invalid');
  }
}

/** Parses input with a zod schema, or throws a 400 listing the bad fields. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'body';
    fields[key] ??= issue.message;
  }
  throw new ValidationError(fields);
}

export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'Not found.', 'not_found');
  return id;
}
