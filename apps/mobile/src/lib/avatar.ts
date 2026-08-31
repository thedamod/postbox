/**
 * Google's public profile-photo endpoint is the closest provider-neutral
 * representation available for an incoming Gmail sender. It returns the
 * sender's Google photo when public and falls back to the initials component
 * when the account has no public image. Never use generated avatars here.
 */
export function avatarUrl(email: string | undefined, size = 80): string {
  const address = (email ?? "").trim().toLowerCase();
  if (!address) return "";
  return `https://www.google.com/s2/photos/profile?sz=${size}&email=${encodeURIComponent(address)}`;
}
