# Этап 2 — регистрация, авторизация и личный кабинет покупателя

## Реализовано в текущем checkpoint

Добавлены application-owned email/password API и клиентские экраны на существующем Expo Router / React Native / TypeScript / Express / tRPC / Drizzle / MySQL стеке. Пароли не сохраняются в открытом виде: используется salted `scrypt`. Email нормализуется и имеет уникальное ограничение. Регистрация требует имени, email, пароля, повторения пароля и принятия двух согласий.

Добавлены одноразовые хешированные токены подтверждения email и восстановления пароля с ограниченным сроком действия. Добавлены ограничения повторной отправки, пять неудачных попыток входа с временной блокировкой, безопасные generic-ошибки и `authVersion` для отзыва старых email-сессий после сброса пароля. `auth.me` больше не возвращает password hash или поля защиты аккаунта.

Добавлены экраны входа, регистрации, восстановления и подтверждения email. Для native-сессии токен хранится через SecureStore; для Web используется HttpOnly session cookie. Добавлены экраны профиля, настроек, адресов и server-backed favorites. Адреса поддерживают добавление, редактирование, удаление с подтверждением и выбор основного адреса. Телефон остаётся необязательным и редактируется в профиле.

## SMTP-статус

SMTP-секреты сохранены через защищённые настройки проекта: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` и `SMTP_SECURE`. В backend добавлен Nodemailer transport, русские шаблоны verification/reset писем и ссылки на существующие Expo Router экраны. Raw-токены не сохраняются в базе и не выводятся в логи.

DNS-проверка SMTP host проходит, но handshake с текущей парой учётных данных возвращает `EAUTH` — сервер отвергает авторизацию. Поэтому письма не считаются отправленными, а registration/resend/reset возвращают безопасную ошибку после неудачной попытки доставки. Для завершения настройки нужен корректный SMTP login и пароль либо provider-specific app password/token; значения следует заменить только через защищённую карточку секретов проекта.

SMS, SMS OTP и авторизация по номеру телефона не реализуются и не используются.

## Проверки

`pnpm check` — проходит.

`pnpm lint` — проходит после исправления новых hook/unused-import замечаний.

`pnpm test -- --reporter=verbose` — 27 тестов прошли, 1 существующий logout-тест пропущен.

`pnpm build` — проходит, backend bundle собран в `dist/index.js`.

`pnpm db:push` — применена миграция `drizzle/0011_same_the_professor.sql` с account, token, address и favorite таблицами.

## Обнаруженные проблемы и открытые задачи

Сквозная проверка реальной регистрации и восстановления через письмо невозможна до подключения почтового провайдера. Необходимо добавить production mail transport, шаблоны писем, подписанные ссылки с фиксированным callback URL и отдельные integration tests.

Server-synced favorite API и cabinet присутствуют, но требуется завершить UI-toggle для блюд и выполнить cross-device ownership tests. Требуются authenticated integration tests для адресов, favorites, заказов и отказа в доступе к чужим данным.

Metro Web watcher периодически завершается с известной ошибкой `Cannot read properties of undefined (reading 'addedFiles')` внутри NativeWind/Metro FileMap. TypeScript, lint, tests и backend build при этом проходят; native-device compatibility и стабильный Web preview требуют отдельной проверки после исправления watcher.

См. полный список в [TODO.md](TODO.md).
