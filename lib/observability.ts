import { randomUUID } from "node:crypto";

export function getRequestId(req: Request): string {
  const headerValue = req.headers.get("x-request-id")?.trim();
  if (headerValue) {
    return headerValue;
  }
  return randomUUID();
}

export function logInfo(event: string, fields: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      level: "info",
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

export function logError(event: string, fields: Record<string, unknown>) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

export async function withTimer<T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; durationMs: number }> {
  const startedAt = Date.now();
  const result = await fn();
  return {
    result,
    durationMs: Date.now() - startedAt,
  };
}
