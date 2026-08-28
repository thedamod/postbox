import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, sanitizeAccount } from "@/lib/api";

export async function GET() {
  const { client } = getBackend();
  return ok({ accounts: client.listAccounts().map(sanitizeAccount) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.email) {
      throw new ApiError(400, "email is required.");
    }

    const { client } = getBackend();
    const account = client.addAccount({
      provider: body.provider ?? "gmail",
      email: String(body.email),
      displayName: body.displayName ?? null,
      picture: body.picture ?? null,
      refreshToken: body.refreshToken ?? "",
    });

    return ok({ account: sanitizeAccount(account) }, 201);
  } catch (error) {
    return fail(error);
  }
}
