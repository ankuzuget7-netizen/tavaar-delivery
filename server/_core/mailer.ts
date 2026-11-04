import nodemailer from "nodemailer";

const configured = () => Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD &&
  process.env.SMTP_FROM,
);

export function emailProviderStatus() {
  return configured()
    ? { configured: true, message: "Письмо отправлено. Проверьте входящие и папку «Спам»." }
    : { configured: false, message: "Почтовый провайдер не настроен." };
}

function appUrl() {
  const value = process.env.APP_PUBLIC_URL || process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL;
  if (!value) throw new Error("APP_PUBLIC_URL_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}

function transport() {
  if (!configured()) throw new Error("SMTP_NOT_CONFIGURED");
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_INVALID_PORT");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

function baseMessage(to: string, subject: string, text: string, html: string) {
  return { from: process.env.SMTP_FROM, to, subject, text, html };
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${appUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
  await transport().sendMail(baseMessage(
    to,
    "Подтвердите email — Ак-Довурак Доставка",
    `Подтвердите email по ссылке: ${link}\n\nСсылка действительна 30 минут. Если вы не создавали аккаунт, проигнорируйте это письмо.`,
    `<p>Подтвердите email для «Ак-Довурак Доставка»:</p><p><a href="${link}">Подтвердить email</a></p><p>Ссылка действительна 30 минут. Если вы не создавали аккаунт, проигнорируйте это письмо.</p>`,
  ));
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  await transport().sendMail(baseMessage(
    to,
    "Восстановление пароля — Ак-Довурак Доставка",
    `Установите новый пароль по ссылке: ${link}\n\nСсылка действительна 30 минут и используется один раз. Если вы не запрашивали восстановление, проигнорируйте это письмо.`,
    `<p>Запрос на восстановление пароля для «Ак-Довурак Доставка»:</p><p><a href="${link}">Установить новый пароль</a></p><p>Ссылка действительна 30 минут и используется один раз. Если вы не запрашивали восстановление, проигнорируйте это письмо.</p>`,
  ));
}

export async function verifySmtpConnection() {
  await transport().verify();
  return { configured: true } as const;
}
