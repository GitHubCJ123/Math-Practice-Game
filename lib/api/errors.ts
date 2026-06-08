import type { VercelResponse } from "@vercel/node";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function apiError(
  res: VercelResponse,
  status: number,
  message: string,
  details?: unknown
) {
  const payload: { error: string; details?: unknown } = { error: message };
  if (details !== undefined) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

export function handleApiError(
  res: VercelResponse,
  endpoint: string,
  context: string,
  error: unknown
) {
  console.error(`[${endpoint}] ${context}:`, error);

  if (error instanceof ApiError) {
    return apiError(res, error.status, error.message, error.details);
  }

  return apiError(res, 500, "Internal server error", error);
}
