import type { Response } from "express";

export interface PageMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

interface SuccessBody {
  success: true;
  data: unknown;
  meta?: PageMeta;
}

/**
 * Consistent success envelope. Frontend Stage-8 integration unwraps `data`
 * (and `meta`) inside its apiClient — UI components stay untouched.
 */
export function ok(res: Response, data: unknown, status = 200): Response {
  const body: SuccessBody = { success: true, data };
  return res.status(status).json(body);
}

export function created(res: Response, data: unknown): Response {
  return ok(res, data, 201);
}

export function paginated(
  res: Response,
  items: unknown[],
  total: number,
  page: number,
  limit: number
): Response {
  const pages = Math.max(1, Math.ceil(total / limit));
  const body: SuccessBody = { success: true, data: items, meta: { total, page, pages, limit } };
  return res.status(200).json(body);
}
