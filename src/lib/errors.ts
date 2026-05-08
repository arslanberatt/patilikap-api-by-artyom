import type { ContentfulStatusCode } from "hono/utils/http-status";

export const errors = {
  NOT_FOUND:    { error: "Not Found" },
  FORBIDDEN:    { error: "Forbidden" },
  UNAUTHORIZED: { error: "Unauthorized" },
  CONFLICT:     { error: "Conflict" },
  BAD_REQUEST:  { error: "Bad Request" },
  SERVER_ERROR: { error: "Internal Server Error" },
} as const;

export class ApiError extends Error {
  status: ContentfulStatusCode;
  code?: string;

  constructor(status: ContentfulStatusCode, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
