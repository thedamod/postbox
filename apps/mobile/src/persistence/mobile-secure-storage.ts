import * as SecureStore from "expo-secure-store";

import type { AuthProvider } from "@postbox/email-client/domain";
import type { EmailAccount } from "@postbox/email-client/domain";

const REFRESH_KEY = (accountId: number) => `refresh_token:${accountId}`;

/**
 * Stores refresh tokens in the OS keychain. A real app exchanges the refresh
 * token for a short-lived access token via googleapis before every sync/send.
 */
export class SecureAuthProvider implements AuthProvider {
  async getAccessToken(account: EmailAccount): Promise<string> {
    const stored = await SecureStore.getItemAsync(REFRESH_KEY(account.id));
    if (!stored) {
      throw new Error(`No stored credentials for ${account.email}.`);
    }
    return stored;
  }

  async storeRefreshToken(accountId: number, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY(accountId), refreshToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async clearRefreshToken(accountId: number): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_KEY(accountId));
  }
}