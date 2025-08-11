export class HttpError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;

  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (code) this.code = code;
    if (typeof retryAfter === 'number' && !Number.isNaN(retryAfter)) this.retryAfter = retryAfter;
  }
}

function normalizeErrorCode(status: number, fallback?: string): string | undefined {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'unprocessable_entity';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_error';
  if (status >= 400) return 'bad_request';
  return fallback;
}

export function httpErrorFromResponse(res: Response, bodyText?: string, fallbackCode?: string): HttpError {
  const retryAfterHeader = (res as any)?.headers?.get?.('retry-after');
  const retryAfterNum = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
  const status = (res as unknown as { status?: number }).status ?? 500;
  const statusText = (res as unknown as { statusText?: string }).statusText || '';
  const message = bodyText && String(bodyText).trim().length > 0
    ? `${status} ${statusText}: ${bodyText}`.trim()
    : `${status} ${statusText}`.trim();
  const code = normalizeErrorCode(status, fallbackCode);
  return new HttpError(status, message, code, retryAfterNum && !Number.isNaN(retryAfterNum) ? retryAfterNum : undefined);
}

