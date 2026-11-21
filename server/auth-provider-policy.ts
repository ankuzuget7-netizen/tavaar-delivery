import type { PhoneChannel } from "./_core/bots";

export type ProviderBindingLike = {
  userId: number;
  channel: PhoneChannel;
  providerUserId: string;
  providerChatId?: string | null;
};

export function assertProviderCanStart(input: {
  purpose: "register" | "login" | "change_phone" | "bind_provider";
  userId?: number;
  providerUserId: string;
  providerChatId: string;
  binding?: ProviderBindingLike;
}) {
  const { purpose, userId, providerUserId, providerChatId, binding } = input;
  if (binding && (binding.providerUserId !== providerUserId || (binding.providerChatId && binding.providerChatId !== providerChatId))) {
    throw new Error("PROVIDER_ALREADY_BOUND");
  }
  if (purpose === "login" && (!userId || !binding || binding.userId !== userId)) {
    throw new Error("PROVIDER_NOT_BOUND");
  }
  if (purpose === "register" && binding) throw new Error("PROVIDER_ALREADY_BOUND");
}

export function assertProviderCanComplete(input: {
  purpose: "register" | "login" | "change_phone" | "bind_provider";
  userId?: number;
  binding?: ProviderBindingLike;
}) {
  const { purpose, userId, binding } = input;
  if (purpose === "login" && (!userId || !binding || binding.userId !== userId)) {
    throw new Error("PROVIDER_NOT_BOUND");
  }
  if (purpose === "change_phone" && binding && userId !== binding.userId) {
    throw new Error("PROVIDER_ALREADY_BOUND");
  }
}
