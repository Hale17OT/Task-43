const MAX_LIMIT = 100;
const MAX_PAGE = 10000;

/**
 * Clamp pagination parameters to safe bounds.
 * Prevents DoS via unbounded LIMIT/OFFSET queries.
 */
export function safePagination(query: Record<string, string>): { page: number; limit: number } {
  let page = query.page ? parseInt(query.page, 10) : 1;
  let limit = query.limit ? parseInt(query.limit, 10) : 20;

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 20;

  return {
    page: Math.min(page, MAX_PAGE),
    limit: Math.min(limit, MAX_LIMIT),
  };
}
