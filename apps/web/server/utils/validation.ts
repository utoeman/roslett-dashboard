/**
 * Request validation with one error shape for all routes. Not named
 * `readBody`, which would shadow Nitro's auto-import.
 */

import type { H3Event } from 'h3';
import { readBody as h3ReadBody, getQuery, getRouterParam } from 'h3';
import type { ZodType } from 'zod';
import { badRequest, notFound, validationError } from './errors.js';

export async function readJsonBody<T>(
  event: H3Event,
  schema: ZodType<T>,
): Promise<T> {
  const body = await h3ReadBody(event);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

export function readQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const result = schema.safeParse(getQuery(event));
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID from the path; invalid ids get a 400 instead of a Postgres error. */
export function readId(event: H3Event, name = 'id'): string {
  const value = getRouterParam(event, name);
  if (value === undefined || value === '') {
    throw badRequest('Es wurde keine Kennung angegeben.');
  }
  if (!UUID_PATTERN.test(value)) {
    throw badRequest('Die angegebene Kennung ist ungueltig.');
  }
  return value;
}

/** Returns the record or throws 404. */
export function requireFound<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw notFound(what);
  }
  return value;
}
