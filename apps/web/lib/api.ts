import { NextResponse } from "next/server";

import { getBackend } from "./backend/mail-client";
import type { EmailAccount } from "@postbox/email-client";

export { getBackend };

export function sanitizeAccount(account: EmailAccount) {
  const { refreshToken: _refreshToken, ...rest } = account;
  return rest;
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `Invalid id "${raw}".`);
  }
  return id;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    const extra = (error as { responseText?: string }).responseText;
    return NextResponse.json(
      { error: extra ? `${error.message}: ${extra}` : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ error: String(error) }, { status: 500 });
}

/** Run a handler, mapping thrown errors to JSON error responses. */
export async function guard<T>(handler: () => T | Promise<T>): Promise<NextResponse> {
  try {
    const result = await handler();
    return result instanceof NextResponse ? result : ok(result);
  } catch (error) {
    return fail(error);
  }
}