import { describe, expect, it } from "vitest";
import { RESTAURANT_OPERATOR_ROLES } from "../server/membership-policy";

describe("restaurant operator membership policy", () => {
  it("keeps owners and managers aligned with partner-cabinet access", () => {
    expect(RESTAURANT_OPERATOR_ROLES).toEqual(["owner", "manager"]);
  });

  it("does not grant partner-cabinet access to staff memberships", () => {
    expect(RESTAURANT_OPERATOR_ROLES).not.toContain("staff");
  });
});
