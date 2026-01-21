/**
 * Helper functions for Express 5 request parameter handling.
 * Express 5 types req.params and req.query values as string | string[] | undefined.
 */

/**
 * Safely extract a string parameter from req.params or req.query.
 * Returns undefined if the value is not a string.
 */
export function getStringParam(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely extract a number parameter from req.query.
 * Returns the default value if the param is not a valid number string.
 */
export function getNumberParam(value: unknown, defaultValue: number): number {
  if (typeof value !== 'string') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely extract a Date from a query parameter string.
 * Returns undefined if the value is not a valid date string.
 */
export function getDateParam(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}
