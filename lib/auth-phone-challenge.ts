import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

export type PhoneChallengeInput = {
  phone: string;
  channel: "telegram" | "max";
  purpose: "register" | "login";
  name?: string;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
};

export type PhoneChallengeResult = {
  challengeId: number;
  channel: "telegram" | "max";
  deepLink?: string;
  expiresAt: string | Date;
  linked: boolean;
  codeExpiresAt?: string | Date | null;
  resendAvailableAt?: string | Date | null;
};

function extractMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const direct = record.message;
  if (typeof direct === "string" && direct.trim()) return direct;
  return undefined;
}

/**
 * The production server uses tRPC + superjson. This endpoint is intentionally
 * decoded as ordinary JSON here: the challenge payload only contains strings,
 * numbers and nullable dates, and this avoids browser transformer failures when
 * an intermediary returns a valid tRPC JSON envelope.
 */
export async function requestPhoneChallengeJson(input: PhoneChallengeInput): Promise<PhoneChallengeResult> {
  const token = await Auth.getSessionToken();
  const response = await fetch(`${getApiBaseUrl()}/api/trpc/auth.requestPhoneChallenge?batch=1`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ 0: { json: input } }),
  });

  let envelope: any;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("Сервер вернул некорректный ответ. Обновите страницу и повторите попытку.");
  }

  const item = Array.isArray(envelope) ? envelope[0] : envelope;
  if (!response.ok || item?.error) {
    const errorData = item?.error?.json ?? item?.error ?? item;
    const message = extractMessage(errorData);
    throw new Error(message || "Не удалось начать подтверждение номера.");
  }

  const data = item?.result?.data?.json ?? item?.result?.data;
  if (!data || typeof data.challengeId !== "number" || typeof data.channel !== "string") {
    throw new Error("Сервер вернул неполные данные подтверждения. Повторите попытку.");
  }
  return data as PhoneChallengeResult;
}
