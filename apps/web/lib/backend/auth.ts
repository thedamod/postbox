import type { AuthProvider } from "@postbox/email-client";
import type { EmailAccount } from "@postbox/email-client";

/**
 * Development auth: returns the stored refresh token as a usable credential.
 * A production backend would exchange the refresh token for a short-lived
 * access token via googleapis (or refresh it through the provider's API).
 */
export class DevAuthProvider implements AuthProvider {
  async getAccessToken(account: EmailAccount): Promise<string> {
    if (!account.refreshToken) {
      throw new Error(`No credentials stored for ${account.email}.`);
    }
    return account.refreshToken;
  }
}