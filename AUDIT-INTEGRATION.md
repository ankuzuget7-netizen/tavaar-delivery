# Таваар Доставка — аудит связности приложения

Дата: 19 ноября 2026 года

## Итог

Проект использует единую Expo Router-навигацию и единый Express/tRPC backend. Страницы не являются отдельными статическими макетами: клиентские экраны вызывают серверные процедуры, а критические операции проверяют пользователя, роль, принадлежность к заведению и владельца заказа на backend.

При этом приложение ещё нельзя честно назвать полностью завершённым end-to-end продуктом. Открытые области перечислены ниже; они сохранены в TODO и не подменены фиктивными данными.

## Карта маршрутов

Клиентские: `/`, `/cart`, `/orders`, `/profile`, `/support`, `/restaurant/:id`, `/dish/:id`, `/order/success`, `/order/:id/details`, `/order/:id/tracking`, `/account/addresses`, `/account/favorites`, `/account/settings`.

Авторизация: `/auth/login`, `/auth/register`, `/auth/phone-code`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/oauth/callback`.

Партнёр: `/partner/apply`, `/partner/dashboard`, `/partner/orders`.

Администратор и владелец платформы: `/admin/applications`, `/owner/login`, `/owner`, `/owner/applications`, `/owner/users`, `/owner/orders`, `/owner/restaurants`, `/owner/audit`.

Курьер и служебные экраны: `/driver/dashboard`, `/dev/theme-lab`.

Актуальный машинный список опубликован в `public/manus-routes.json`.

## Backend-связи

Каталог подключён к `restaurants.listPublic`, `restaurants.search` и `restaurants.menu`; страницы заведения и блюда используют реальные активные записи и цены в копейках. Корзина хранится на клиенте, но оформление заказа передаёт только идентификаторы блюд и количества, а backend повторно проверяет ресторан, доступность, цены и idempotency key.

Заказы подключены к `customerOrders.create`, `list`, `details`, `tracking`, `cancel` и `complaint`. Кабинет партнёра подключён к owner-scoped процедурам меню, часов, заказов, уведомлений и назначения курьера. Административные процедуры используют `adminProcedure`/`superAdminProcedure`, поэтому роль не может быть выдана изменением frontend-параметров.

Phone/MAX flow использует `requestPhoneChallenge`, `phoneChallengeStatus` и `verifyPhoneCode`. После успешного verify создаётся cookie/SecureStore-сессия, а frontend получает серверный `role` и `access` profile.

## Исправление маршрутизации после MAX

После verify клиент теперь дополнительно запрашивает `auth.me` через только что созданную сессию, сбрасывает auth-stack и выбирает назначение по серверному профилю:

- `super_admin` → `/owner`;
- `admin` → `/admin/applications`;
- активное membership `owner/manager` → `/partner/dashboard`;
- профиль курьера → `/driver/dashboard`;
- обычный клиент → `/(tabs)`.

## Найденные открытые области

Не завершены реальные проверки существующих аккаунтов клиента, владельца и администратора на Web, Android и iOS. Не завершён интерфейс переключения нескольких ролей/заведений без повторной авторизации. Адреса, избранное, история заказов, push/WebSocket и bot delivery имеют серверные части, но требуют реальной multi-device/provider проверки.

Также открыты функциональные блоки из TODO: фотографии/модификаторы меню, промокоды и акции, расширенная статистика, комиссии, ЮKassa, MFA Super Admin, распределённый rate limit, юридические документы/CMS и полноценный backup/restore drill.

## Проверки в Sandbox

`pnpm exec tsc --noEmit` — успешно.

`pnpm build` — успешно.

Live web bundle содержит `/partner/dashboard`, `/admin/applications`, `/owner`, `challengeId` и `verifyPhoneCode`; это подтверждает, что VPS отдаёт сборку с role-routing, а не предыдущий JavaScript.

Production health и главная страница проверены ранее: `/api/health` возвращает `200`, `/` возвращает `200`. Реальные provider-коды и записи пользователей не используются для фиктивного отчёта; их нужно проверять на аккаунтах владельца проекта.
