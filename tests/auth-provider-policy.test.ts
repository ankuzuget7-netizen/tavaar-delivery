import { describe, expect, it } from "vitest";
import { assertProviderCanComplete, assertProviderCanStart } from "../server/auth-provider-policy";

describe("auth provider binding security", () => {
  const telegramBinding = { userId: 7, channel: "telegram" as const, providerUserId: "tg-100", providerChatId: "chat-100" };
  const maxBinding = { userId: 8, channel: "max" as const, providerUserId: "max-200", providerChatId: "max-chat-200" };

  it.each([
    ["Telegram", telegramBinding],
    ["MAX", maxBinding],
  ])("rejects login through an unbound %s account", (_label, binding) => {
    expect(() => assertProviderCanStart({
      purpose: "login",
      userId: binding.userId,
      providerUserId: "attacker-provider",
      providerChatId: "attacker-chat",
    })).toThrow("PROVIDER_NOT_BOUND");
  });

  it.each([
    ["Telegram", telegramBinding],
    ["MAX", maxBinding],
  ])("rejects a provider already bound to another account during registration", (_label, binding) => {
    expect(() => assertProviderCanStart({
      purpose: "register",
      providerUserId: binding.providerUserId,
      providerChatId: binding.providerChatId!,
      binding,
    })).toThrow("PROVIDER_ALREADY_BOUND");
  });

  it.each([
    ["Telegram", telegramBinding],
    ["MAX", maxBinding],
  ])("rejects a provider chat identity mismatch", (_label, binding) => {
    expect(() => assertProviderCanStart({
      purpose: "login",
      userId: binding.userId,
      providerUserId: binding.providerUserId,
      providerChatId: "different-chat",
      binding,
    })).toThrow("PROVIDER_ALREADY_BOUND");
  });

  it("allows a first provider binding only after the authenticated change-phone flow", () => {
    expect(() => assertProviderCanComplete({ purpose: "change_phone", userId: 7 })).not.toThrow();
  });

  it("does not allow a binding owned by another user to complete login", () => {
    expect(() => assertProviderCanComplete({ purpose: "login", userId: 7, binding: { ...telegramBinding, userId: 9 } })).toThrow("PROVIDER_NOT_BOUND");
  });

  it("allows the exact previously verified binding to complete login", () => {
    expect(() => assertProviderCanComplete({ purpose: "login", userId: 7, binding: telegramBinding })).not.toThrow();
  });
});
