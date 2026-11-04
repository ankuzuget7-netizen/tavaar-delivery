import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";

export type PhoneChannel = "telegram" | "max";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type BotIdentity = { id: string; username: string };

function tokenFor(channel: PhoneChannel) {
  const token = channel === "telegram" ? process.env.TG_BOT_TOKEN : process.env.MAX_BOT_TOKEN;
  if (!token) throw new Error("BOT_NOT_CONFIGURED");
  return token;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, description: `HTTP_${response.status}` };
  }
}

async function telegramRequest<T>(method: string, body?: Record<string, unknown>) {
  const token = tokenFor("telegram");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readJson(response) as TelegramResponse<T>;
  if (!response.ok || !data.ok) throw new Error("BOT_PROVIDER_ERROR");
  return data.result as T;
}

async function maxRequest<T>(urlPath: string, init: { method?: string; body?: string } = {}) {
  const token = tokenFor("max");
  const caPath = path.resolve(process.cwd(), "resources/certs/russian_trusted_ca_bundle.pem");
  let ca: Buffer;
  try {
    ca = readFileSync(caPath);
  } catch {
    throw new Error("MAX_TLS_CA_MISSING");
  }
  const payload = init.body;
  const data = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = https.request(`https://platform-api2.max.ru${urlPath}`, { method: init.method || "GET", ca, headers: { authorization: token, ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}) }, timeout: 15000 }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode || 500, body: JSON.parse(text) as Record<string, unknown> }); }
        catch { resolve({ status: response.statusCode || 500, body: {} }); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("MAX_TIMEOUT")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
  if (data.status < 200 || data.status >= 300) throw new Error(data.status === 401 ? "BOT_AUTH_FAILED" : "BOT_PROVIDER_ERROR");
  return data.body as T;
}

export async function getBotIdentity(channel: PhoneChannel): Promise<BotIdentity> {
  if (channel === "telegram") {
    const result = await telegramRequest<{ id: number; username?: string }>("getMe");
    if (!result.username) throw new Error("BOT_USERNAME_UNAVAILABLE");
    return { id: String(result.id), username: result.username };
  }
  const result = await maxRequest<{ user_id?: number; username?: string; name?: string }>("/me");
  if (!result.user_id || !result.username) throw new Error("BOT_USERNAME_UNAVAILABLE");
  return { id: String(result.user_id), username: result.username };
}

export async function createBotDeepLink(channel: PhoneChannel, state: string) {
  const identity = await getBotIdentity(channel);
  return channel === "telegram"
    ? `https://t.me/${identity.username}?start=${encodeURIComponent(state)}`
    : `https://max.ru/${identity.username}?start=${encodeURIComponent(state)}`;
}

export async function sendBotCode(channel: PhoneChannel, chatId: string, code: string) {
  const text = `Код подтверждения «Ак-Довурак Доставка»: ${code}. Код действует 5 минут и используется один раз.`;
  if (channel === "telegram") {
    await telegramRequest("sendMessage", { chat_id: chatId, text });
    return;
  }
  await maxRequest(`/messages?user_id=${encodeURIComponent(chatId)}`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function hashBotState(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function extractTelegramStart(update: any) {
  const message = update?.message;
  const text = typeof message?.text === "string" ? message.text : "";
  const match = text.match(/^\/start(?:@[^\s]+)?(?:\s+([A-Za-z0-9_-]{20,64}))?/);
  if (!match?.[1] || message?.chat?.type !== "private" || message?.chat?.id == null) return null;
  return { state: match[1], chatId: String(message.chat.id), userId: message.from?.id == null ? String(message.chat.id) : String(message.from.id) };
}

function extractMaxStart(update: any) {
  if ((update?.update_type === "bot_started" || update?.updateType === "bot_started") && typeof update?.payload === "string") {
    const userId = update?.user?.user_id ?? update?.user?.userId ?? update?.user?.id;
    const chatId = update?.chat_id ?? update?.chatId ?? userId;
    if (userId != null && chatId != null) return { state: update.payload, chatId: String(chatId), userId: String(userId) };
  }
  const message = update?.message || update?.message_created || update?.body;
  const text = typeof message?.body?.text === "string" ? message.body.text : typeof message?.text === "string" ? message.text : "";
  const match = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{20,64}))?/);
  const senderId = message?.sender?.user_id ?? message?.sender?.userId ?? update?.user?.user_id ?? update?.user?.id;
  const chatId = message?.recipient?.chat_id ?? message?.recipient?.chatId ?? message?.chat_id ?? senderId;
  if (!match?.[1] || senderId == null || chatId == null) return null;
  return { state: match[1], chatId: String(chatId), userId: String(senderId) };
}

export function parseBotStart(channel: PhoneChannel, update: unknown) {
  return channel === "telegram" ? extractTelegramStart(update) : extractMaxStart(update);
}
