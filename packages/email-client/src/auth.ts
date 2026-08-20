import type { EmailAccount } from "./types";

/**
 * Produces short-lived access tokens for a provider account. The email client
 * never stores credentials or tokens itself; hosts back this with their own
 * secure storage (SecureStore on RN, a secrets store on the server).
 */
export interface AuthProvider {
  getAccessToken(account: EmailAccount): Promise<string>;
}