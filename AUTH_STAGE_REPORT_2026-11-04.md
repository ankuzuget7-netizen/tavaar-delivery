# Этап 2 — регистрация, авторизация и личный кабинет покупателя

## Реализовано в текущем checkpoint

Новая регистрация и авторизация переведены на телефонный номер в формате `+7XXXXXXXXXX`. Интерфейс больше не запрашивает email или пароль: пользователь вводит имя и телефон, выбирает Telegram или MAX, открывает deep link бота и нажимает «Старт».

Добавлен серверный `phone_auth_challenges` flow. В базе сохраняются только хеш состояния deep link и хеш одноразового 4-значного кода. Состояние challenge действует ограниченное время, код действует 5 минут, используется один раз, ограничен пятью ошибочными попытками, а повторный запрос блокируется на 60 секунд. Номер телефона уникален, подтверждённый номер получает `phoneVerifiedAt`, а обычное редактирование профиля не может заменить подтверждённый login-телефон.

Добавлены серверные адаптеры Telegram Bot API и MAX Bot API. Telegram использует `getMe`, ссылку `https://t.me/<bot_username>?start=<state>` и `sendMessage`. MAX использует `/me`, ссылку `https://max.ru/<bot_username>?start=<state>`, событие `bot_started.payload` и `POST /messages?user_id=...`. Токены читаются только из защищённых переменных `TG_BOT_TOKEN` и `MAX_BOT_TOKEN` и не выводятся в логи или клиентский bundle.

Добавлены webhook endpoints:

- `POST /api/bots/telegram/webhook`
- `POST /api/bots/max/webhook`

Они связывают opaque state с provider user/chat identifier, создают код и отправляют его через выбранного бота. При наличии `TG_BOT_WEBHOOK_SECRET` или `MAX_BOT_WEBHOOK_SECRET` проверяется соответствующий заголовок webhook. MAX-запросы используют официальный CA-бандл Минцифры `resources/certs/russian_trusted_ca_bundle.pem`; отключение проверки TLS не используется.

Существующие email/password-поля, таблицы и backend-процедуры сохранены для совместимости старых аккаунтов и данных. Новая клиентская регистрация/авторизация ими не пользуется. Существующие заказы, рестораны, кабинеты и роли не переписаны.

## Изменённые файлы и миграция

- `server/phone-auth.ts` — challenge, нормализация номера, TTL, хеш кода, resend guard, подтверждение и выдача пользователя.
- `server/_core/bots.ts` — Telegram/MAX API, deep links, parsing webhook updates и безопасный MAX TLS.
- `server/_core/index.ts` — webhook endpoints и optional webhook-secret checks.
- `server/routers.ts` — tRPC procedures `requestPhoneChallenge`, `phoneChallengeStatus`, `verifyPhoneCode` и phone session issuance.
- `drizzle/schema.ts` — `phoneVerifiedAt`, unique phone и `phone_auth_challenges`.
- `drizzle/0012_glamorous_mysterio.sql` плюс `drizzle/meta/0012_snapshot.json` и журнал миграций.
- `app/auth/login.tsx`, `app/auth/register.tsx`, `app/auth/phone-code.tsx` — телефонный UI и deep-link confirmation.
- `app/(tabs)/profile.tsx`, `app/account/settings.tsx`, `lib/_core/auth.ts` — профиль, verified phone и legacy email compatibility.
- `public/manus-routes.json` — маршрут `/auth/phone-code` и остальные Expo Web routes.
- `README.md`, `plan.md`, `TODO.md` — обновлённые требования и честный статус.

Миграция добавляет:

- `users.phoneVerifiedAt`;
- уникальное ограничение `users.phone`;
- таблицу `phone_auth_challenges` с channel/purpose/state hash/provider identifiers/code hash/expiry/attempts/consumed markers.

Миграция применена к управляемой MySQL-базе. Таблица проверена через `SHOW TABLES`.

## Проверки

- `pnpm check` — проходит.
- `pnpm lint` — проходит; остаётся только существующее предупреждение pnpm о deprecated `pnpm`-поле и предупреждение Node о module type в ESLint config.
- `pnpm test` — 27 тестов прошли, 1 существующий logout-тест пропущен.
- `pnpm build` — проходит, backend bundle собран в `dist/index.js`.
- API `GET /api/health` — отвечает `{"ok":true,...}`.
- Интеграционный прогон с защищёнными токенами получил профили обоих ботов: Telegram `Akdov17_bot` и MAX `se14900789_bot`; значения токенов не выводились.
- Интеграционный прогон для обоих каналов проверил формирование deep link, state binding, хешированный код, 60-секундный resend guard, успешное создание/подтверждение test account и single-use запрет повторного кода. Test users/challenges удалены после проверки.
- Прямой парсер проверен на Telegram `/start <state>` и официальном MAX `bot_started.payload`.
- Реальная отправка в пользовательский Telegram/MAX чат не выполнялась, потому что для неё требуется реальный пользователь, открывший бота; фиктивная доставка не заявляется.

## Требует участия пользователя или production-инфраструктуры

1. На публичном HTTPS-домене зарегистрировать Telegram webhook на `/api/bots/telegram/webhook` и MAX subscription на `/api/bots/max/webhook` с update type `bot_started` (MAX) и соответствующим webhook secret.
2. Открыть каждый deep link в реальном Telegram/MAX аккаунте, нажать «Старт», получить код и завершить регистрацию/вход на Android/Web. Это подтвердит delivery path, который нельзя доказать синтетическим chat ID.
3. Убедиться, что выбранный публичный домен доступен провайдерам на HTTPS/443 и содержит полную TLS-цепочку; Preview localhost не является production webhook endpoint.
4. Отдельно закончить rate limiting по IP/device, административную MFA, аудит действий, поддержку, finance/commission, payment provider, production monitoring и native release verification согласно `TODO.md`.

Полный список открытых требований находится в [TODO.md](TODO.md).
