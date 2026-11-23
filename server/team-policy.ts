export type RestaurantTeamRole = "owner" | "manager" | "staff";

/** Canonicalize the supported Russian account phone format without guessing country codes. */
export function normalizeTeamPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+7\d{10}$/.test(compact)) throw new Error("INVALID_PHONE");
  return compact;
}

/** One account has one restaurant-scoped team role at a restaurant. */
export function assertTeamRoleAvailable(existingRoles: readonly RestaurantTeamRole[], requested: Exclude<RestaurantTeamRole, "owner">) {
  if (existingRoles.length === 0) return;
  if (existingRoles.includes(requested)) throw new Error("TEAM_MEMBER_ALREADY_EXISTS");
  throw new Error("TEAM_ROLE_CONFLICT");
}
