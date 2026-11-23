import { describe, expect, it } from "vitest";
import { assertTeamRoleAvailable, normalizeTeamPhone } from "../server/team-policy";

describe("restaurant team policy", () => {
  it("normalizes the supported Russian phone format", () => {
    expect(normalizeTeamPhone(" +7 (999) 123-45-67 ")).toBe("+79991234567");
  });

  it.each(["8 999 123-45-67", "9991234567", "+7 999 123 45 6", "+799912345678"]) (
    "rejects unsupported phone input %s",
    (phone) => expect(() => normalizeTeamPhone(phone)).toThrow("INVALID_PHONE"),
  );

  it("allows a new scoped administrator or courier when the account has no team role", () => {
    expect(() => assertTeamRoleAvailable([], "manager")).not.toThrow();
    expect(() => assertTeamRoleAvailable([], "staff")).not.toThrow();
  });

  it("rejects duplicate and cross-role membership rather than replacing existing rights", () => {
    expect(() => assertTeamRoleAvailable(["manager"], "manager")).toThrow("TEAM_MEMBER_ALREADY_EXISTS");
    expect(() => assertTeamRoleAvailable(["staff"], "manager")).toThrow("TEAM_ROLE_CONFLICT");
    expect(() => assertTeamRoleAvailable(["owner"], "staff")).toThrow("TEAM_ROLE_CONFLICT");
  });
});
