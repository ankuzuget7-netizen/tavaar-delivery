# Ак-Довурак Доставка — TODO

## Approved foundation and honest scope
- [x] Keep the project on the fixed Expo Router / React Native / TypeScript + Express/tRPC/Drizzle + managed MySQL stack; do not replace it with a different framework inside this project. Evidence: initialized Expo Mobile project, approved `plan.md`, and successful typecheck/build.
- [x] Keep the public catalog empty until a restaurant is approved by the administrator; do not seed fabricated restaurants, menus, reviews, ratings, orders or financial metrics. Evidence: home screen renders `0 заведений` / «Каталог пока пуст» and the database contains no catalog seed tables/data.
- [x] Keep Russian UI, RUB/kopecks money handling and `Asia/Krasnoyarsk` local-time formatting throughout the product. Evidence: implemented customer and partner screens are Russian and use the approved warm editorial palette; currency/time domain modules remain open for later order implementation.

## Customer discovery and catalog
- [ ] Provide the customer home screen with delivery address, search for restaurants/dishes, categories, favorites, order history, promotion/recommendation/banner areas and clear loading/error/empty/offline states.
- [ ] Show only approved restaurants in the public catalog; provide restaurant details with logo/cover, description, address/contact, schedule, open/closed status, preparation time, delivery/pickup options, menu/categories/prices/photos/promotions and only genuine verified reviews/ratings.
- [ ] Provide dish details with photo, name, description, price, ingredients, modifiers, portion size, quantity, item comment and add-to-cart behavior when an approved restaurant has an available menu.

## Cart, checkout and orders
- [ ] Enforce one restaurant per cart. When adding from another restaurant, show exactly «В вашей корзине уже есть блюда другого заведения. Очистить корзину и добавить новый заказ?» with «Отмена» and «Очистить корзину и продолжить».
- [ ] Calculate item prices, quantities, modifiers, discounts, promo codes, delivery and total using server-authoritative integer kopecks; never accept client-submitted authoritative totals.
- [ ] Before creating an order, the server must re-check restaurant availability, dish/modifier availability and prices, address/service area, delivery conditions, fulfillment method, payment method and promo validity.
- [ ] Collect checkout address, entrance, floor, apartment, intercom, phone, courier comment, restaurant comment, delivery/pickup, payment method, promo code and confirmation; do not claim online payment success without server/provider confirmation.
- [ ] Implement server-owned order transitions: оформлен, ожидает подтверждения ресторана, принят, готовится, готов, курьер назначен, передан курьеру, в пути, доставлен, завершен; plus cancellation, restaurant refusal, payment error, refund, complaint and status history.

## Identity, restaurant onboarding and operations
- [ ] Implement phone registration/login and OTP with expiry, one-time use, protected storage, brute-force/resend limits, no OTP logs and no simulated success when an SMS provider is not configured.
- [ ] Implement «Подключить заведение» with name/type/address/phone/INN where applicable/owner or representative/contact/schedule/logo/photos/description/delivery/pickup fields; application status is «На проверке» and it is not public before approval. Phase 1 evidence: the form currently captures name/type/address/phone/contact/description and persists `pending`; INN, owner details, schedule, media and delivery/pickup fields remain open.
- [ ] Implement approved restaurant menu management: categories, dishes, descriptions, images, prices, availability, modifiers, combos, promotions, preparation time, hidden items and schedule.
- [ ] Implement tenant-restricted restaurant order management, reasons for refusal, status actions, history/statistics and new-order notifications; a restaurant must not access another restaurant’s orders. Phase 2 evidence: protected owner cabinet shell is present, but owner/application membership and operational data remain open.

## Administration, support and finance
- [ ] Implement separately authorized admin workflows for restaurant review/approval/rejection/suspension/blocking, staff, users, orders, complaints, support, banners/categories/promotions/promocodes, delivery settings, commissions, reports and CSV exports. Phase 2 evidence: `/admin/applications` provides server-role-gated application filtering and approve/reject/suspend actions; staff, audit metadata, MFA, restaurant publication and other admin modules remain open.
- [ ] Enforce server-side roles, MFA/2FA, login-attempt limits, session revocation and append-only administrative audit logging; a frontend route/button/parameter must never grant admin access.
- [ ] Implement 8% default platform commission with integer/decimal-safe arithmetic, rate snapshots for new orders, order/accrual/commission/settlement/refund ledgers, idempotent accrual and no deletion of financial history by ordinary admin actions.
- [ ] Implement a payment-provider adapter boundary for a selected Russian provider (for example, ЮKassa) with idempotency, server-side status verification, authenticated webhooks, refunds/cancellations/reconciliation and no card storage; no fake payment success.
- [ ] Implement in-app support with FAQ, contact form, order/payment/restaurant complaints, conversation history and ticket statuses; keep external Telegram/MAX channels optional.
- [ ] Implement durable notification inbox/outbox and a push-provider boundary; do not leak personal data in push text.

## Security, legal and release evidence
- [ ] Validate inputs and uploads, use parameterized queries/ORM, enforce object-level authorization, rate limiting, safe sessions/cookies, request/upload limits, XSS/CSRF protections where applicable, secret separation and audit access to personal data.
- [ ] Add privacy policy, user agreement, consent management, account deletion and permissible deletion/anonymization flows; obtain qualified review for applicable Russian personal-data, information-security and cashier/payment requirements.
- [ ] Add unit/API/integration/UI coverage for cart isolation, server price enforcement, restaurant tenant isolation, admin authorization, idempotent payments/commission/webhooks, OTP expiry/limits, unavailable dishes and concurrent requests.
- [ ] Run actual typecheck, lint, tests, DB synchronization and build checks; keep failures and native-device gaps visible.
- [ ] Prepare Android/iOS release metadata and minimal permissions; use Dashboard native builds and real-device verification. Do not call the app RuStore-ready until current requirements, signing, screenshots, privacy/contact metadata and moderation checks are actually completed.
- [ ] Prepare production/test environments, TLS/domains, monitoring, logs, backups and a demonstrated restore procedure without claiming unsupported managed infrastructure capabilities.
