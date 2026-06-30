export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(value);
}

export function getUserDisplayName(user: { name: string | null; username?: string | null; email: string }) {
  return user.name ?? user.username ?? user.email.split("@")[0];
}

export function getUserProfileHref(user: { id: string; username: string | null }) {
  return `/users/${user.username ?? user.id}`;
}
