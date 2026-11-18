export type AuthDestinationUser = {
  role?: string | null;
  access?: {
    isRestaurantOwner?: boolean;
    isDriver?: boolean;
  };
};

/** Server-provided role/access values only; never infer privileges from local storage. */
export function getPostAuthRoute(user: AuthDestinationUser): string {
  if (user.role === "super_admin") return "/owner";
  if (user.role === "admin") return "/admin/applications";
  if (user.access?.isRestaurantOwner) return "/partner/dashboard";
  if (user.access?.isDriver) return "/driver/dashboard";
  return "/(tabs)";
}
