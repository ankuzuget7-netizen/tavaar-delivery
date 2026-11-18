import { Linking } from "react-native";

const MAX_BOT_LINK_RE = /^https:\/\/max\.ru\/[A-Za-z0-9._-]+\?start=[A-Za-z0-9_-]{20,128}$/;

export function isValidMaxBotLink(value: string) {
  return MAX_BOT_LINK_RE.test(value);
}

/**
 * MAX exposes bot deep links as HTTPS universal links. The MAX app handles the
 * link when installed; otherwise the operating system opens the same bot URL
 * in the browser. Never replace this with a bare max.ru home URL.
 */
export async function openMaxBotLink(value: string) {
  if (!isValidMaxBotLink(value)) throw new Error("INVALID_MAX_DEEP_LINK");
  await Linking.openURL(value);
}
