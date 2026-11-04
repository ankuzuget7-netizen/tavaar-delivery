# Ак-Довурак Доставка — Architecture and implementation plan

Status: approved by the user on 2026-11-04. Phase 1 foundation implemented; the application is not production-ready.

The source specification is `/home/ubuntu/upload/pasted_content.txt`. Its commercial-platform requirements remain the target; this plan does not label a smaller implementation production-ready.

## 1. Stack decision requiring approval

Manus-managed Mobile is a fixed Expo Router / React Native / TypeScript starter, with Express, tRPC, Drizzle and a managed MySQL-compatible database. It cannot be replaced with Flutter/PostgreSQL inside this managed project.

React Native uses native UI components on Android/iOS, not a WebView wrapper. Shared TypeScript types connect mobile, web views and backend. Expo Web can provide restaurant and administration views using the same business API. Benefits are the available managed preview, native build workflow and shared language. Limitations are the fixed database engine, separate web/native verification, and no demonstrated Russian data-localization arrangement. PostgreSQL migration would need a separately selected infrastructure arrangement and schema port; it is not promised as automatic.

No Redis is needed initially. Orders, idempotency, authorization and finance will use durable database records and transactions rather than ephemeral locks. Managed development and published application share a database: tests must not overwrite production records. Separate test and Russian production infrastructure remain a launch dependency.

## 2. Product and delivery boundary

Implement real, persisted application behavior for the requested customer flows, restaurant onboarding, authorized merchant workflows, platform administration, support and financial records. Browse without login; require validated application authentication for private records and mutations. The entire product UI is Russian, currency is RUB and local date/time formatting uses `Asia/Krasnoyarsk` (UTC+7 for Tuva).

Do not manufacture restaurant claims, customer reviews, star ratings, completed orders, revenues, successful email deliveries or successful payments. An illustrative catalog requires explicit approval, stays visibly labeled as test data, and cannot accept real orders. Without that approval the catalog starts empty and real restaurants enter through the application/approval workflow.

Phone authentication is the required application-owned identity flow. The customer enters a normalized Russian phone number in `+7XXXXXXXXXX` format and chooses Telegram or MAX. A short-lived, single-use deep-link challenge binds the bot chat/user identifier to the pending phone challenge; the server then sends a cryptographically random 4-digit code, stores only its hash, expires it after 5 minutes and enforces a 60-second resend interval. Email/password and SMTP are retired for new customer authentication, while existing email accounts remain readable during migration and phone remains usable as delivery contact data.

Online payment is unavailable until a selected Russian provider, merchant credentials and contractual setup are supplied. Cash/payment on receipt may be available when explicitly allowed by each approved restaurant. Cards are never collected by this app. Provider-dependent refunds cannot be represented as completed until verified by the provider.

Push delivery, signed APK/AAB, physical-device verification, public domains and RuStore submission are distinct external/build steps. None is claimed merely from a working Web Preview.

## 3. Project structure

- `app/(tabs)/`: customer home/catalog, favorites, orders and profile navigation.
- `app/restaurant/[id].tsx`, `app/dish/[id].tsx`: restaurant and dish detail screens.
- `app/cart.tsx`, `app/checkout.tsx`, `app/order/[id].tsx`: cart, server quote, checkout and order timeline.
- `app/auth/`, `app/support/`, `app/partner/`, `app/admin/`: phone registration/login with Telegram/MAX deep-link confirmation; support; restaurant onboarding/authorized cabinet; administrator views.
- `components/food/`, `components/ui/`: reusable cards, money labels, quantities, confirmation sheets, forms and feedback states.
- `hooks/`, `lib/`: query hooks, theme, durable local cart preferences, client validation, native secure token storage and API adapters. Client state never controls financial truth or permissions.
- `server/domain/`: money arithmetic, quotes, cart rules, order state machine and commission policy.
- `server/services/`: transactional application logic, tenant checks, auditing, notifications, provider adapters and support.
- `server/routers/`: typed tRPC modules; REST endpoints under `/api/v1/` for documented external/API integrations.
- `drizzle/`: tables, foreign keys, indexes and committed migrations.
- `tests/`: deterministic unit and API/integration coverage without live charges or fake webhook confirmations.
- `docs/`: architecture, database, API, install/update, backups/restore, administration, restaurant onboarding, payment setup, testing, secrets, incident response and release guide.

Keep the generated app slug, bundle/package identifiers and deep-link scheme. Remove unused native plugins that request unnecessary microphone/media permissions. Native and platform icons must share the brand identity.

## 4. Database model

Use integer kopecks for all stored amounts. Snapshot prices, commission rate and relevant product terms at order creation. Use immutable financial events plus compensating events, not edits to history.

| Module | Tables and important ownership/integrity rules |
|---|---|
| Identity | Existing `users` plus customer profile, consent versions, password credentials, email-verification tokens, password-reset tokens, sessions, optional phone contact and restaurant memberships. Never grant roles from a client parameter. |
| Catalog | Restaurant applications, restaurants, schedules, service areas, menu categories, dishes, modifier groups/options, promotions and media references. Unapproved restaurants are excluded by server queries. |
| Customer | Addresses, favorites and genuine verified-order reviews. Private records are scoped to the session user. |
| Orders | Orders, immutable order items/modifiers, status events and idempotency records. One restaurant per order; current server prices and availability required. |
| Finance | Commission snapshots, ledger events, settlements, payment attempts, provider event receipts, refunds and adjustments. Unique business-event keys prevent duplicate entries. |
| Platform | Promo codes/redemptions, banners, delivery/commission settings, admin audit events and session revocations. |
| Support | Tickets, messages, participants and ticket status events. Customer/restaurant access checked on each object. |
| Notifications | Durable notification inbox and delivery outbox; delivery attempt status, retry metadata and device token ownership. No address/phone in push content. |

Indexes: restaurant/publication status, category/menu availability, orders by owner and restaurant/status, unique provider event IDs, unique user/idempotency key, unique normalized phone, provider/chat binding, phone challenge expiry and promo redemption constraints. Foreign keys prevent orphaned business records.

## 5. Roles and security boundaries

Customer: only their own profile, addresses, favorites, orders, reviews and support. Restaurant operator: only restaurants with active server-side membership and their associated menus/orders. Administrator: explicit server-side role, separate authorized views, sensitive-action policy and audited operations. Public restaurant application submission does not grant operator access.

Administrative MFA and secure initial administrator provisioning must be implemented and configured before operational admin access. A hidden route/button is not a security boundary. A separate production admin hostname requires domain provisioning; Expo Web route separation alone is not that hostname.

Validate requests with Zod, bound payload/text/upload sizes, parameterized ORM queries, per-object tenant authorization, token/session expiry and revocation, secure cookies where applicable, password-attempt/email-token abuse limits and CSRF protections for cookie-authenticated writes. No app-owned secret may shadow platform credentials. No application secrets, password hashes or email tokens in bundles/logs. Fail closed on missing credentials.

Upload controls include extension/MIME/content checks, allowed raster formats, decoded image size limits and image processing before storage. These controls must exist before uploads are enabled.

## 6. API and business rules

Customer catalog reads: approved restaurants, filters, search across dishes/restaurants, restaurant schedule/service metadata, menus and available modifier options. Customer writes: address/favorite management, server quotes, create/cancel orders under policy, verified reviews and support.

One cart, one restaurant. If another restaurant's dish is added, show exactly: «В вашей корзине уже есть блюда другого заведения. Очистить корзину и добавить новый заказ?» with «Отмена» and «Очистить корзину и продолжить». A controlled confirmation sheet must work on both Web and native; React Native Web Alert callbacks cannot be relied upon.

Checkout sends dish IDs, option IDs, quantities, comments and fulfillment/payment choices, not authoritative prices. Server validates restaurant approval/open status, delivery/service address, dish/options availability, quantity bounds, promotion validity and delivery/minimum-order terms. Calculate subtotal, modifiers, valid discounts, delivery and total in kopecks. A changed quote requires customer reconfirmation before committing the order. Create order/items/status event/financial snapshot in a transaction, guarded by a unique idempotency key.

Checkout fields: delivery address, entrance, floor, apartment, intercom, phone, courier comment, restaurant comment, delivery/pickup, payment method, promo code and itemized total. Pickup does not require delivery-only fields.

Order state machine preserves: created → awaiting restaurant → accepted → preparing → ready → courier assigned → handed to courier → en route → delivered → completed. Pickup skips courier-only states under explicit rules. Decline/cancellation require reasons and permitted transitions. Payment failure, refund and complaint are separate records/states with timelines. Customers cannot call restaurant/admin status mutations.

Commission defaults to 800 basis points (8%). Compute using integer arithmetic and defined rounding. On a 1000 ₽ eligible food amount: 80 ₽ commission, 920 ₽ restaurant amount, before acquiring/tax/refunds/other costs. Delivery is accounted for separately unless a contract explicitly changes the commission base. Snapshot rate for new orders; later configuration changes do not mutate old orders. Accrual occurs exactly once at the chosen eligible event; refunds use reversal entries. Reports and CSV derive from real ledger rows and show empty states otherwise.

Restaurant workflows: application with name/type/address/phone/INN where applicable/owner/contact/schedule/logo/photos/description/delivery/pickup, status «На проверке», administrator approval before publication; categories, dishes, modifiers, combos/promotions, prices, availability, preparation time and schedule editing; order acceptance/decline/preparation/ready/handoff/completion, history and real statistics. New-order notification sound is subject to browser/native permission and autoplay rules.

Admin workflows: restaurant application approval/rejection/suspension/blocking, commissions/staff, user search/block/unblock, all-order search/filter/timeline/cancellation/refund workflow, complaints/support, banners/categories/promos/content/delivery settings, financial exports and append-only audit trail. Financial history cannot be deleted by an ordinary administrative action.

## 7. Integrations

Phone authentication: Telegram and MAX bot adapters use protected tokens only on the server. The app creates a short-lived deep-link challenge, the webhook validates the opaque state and binds the provider chat/user identifier, and the adapter sends a 4-digit code only after the user starts the bot. Codes are generated with cryptographically secure randomness, stored only as hashes, expire after 5 minutes, are single-use, never logged, and can be requested only once per 60 seconds. Missing provider credentials or an unavailable bot returns an honest error and never shows a successful delivery. Existing email/password records are retained for migration compatibility but are not the new registration/login UI.

Payments: select ЮKassa or another explicitly approved Russian provider. Read its current official documentation before implementing the adapter. Use provider idempotency, server-to-server status verification, authenticated/validated notifications according to that provider's contract, unique event receipts and reconciliation. Never assume every provider supports a cryptographic webhook signature. Split payments require a separate approved marketplace arrangement, not subtraction on the client.

Notifications: in-app inbox/outbox works independently of a push provider. Connect Expo/FCM or an appropriate approved provider only after native credentials and the data-handling basis are resolved. Telegram/MAX authentication uses the dedicated bot adapters and webhooks; the app's ticket system does not depend on them.

Legal: policies and agreement/consent drafts must be marked as drafts for counsel. Obtain qualified review of applicable 152-ФЗ, 149-ФЗ, 54-ФЗ and related requirements. Do not assume managed hosting meets Russian localization requirements. Do not send personal data to external services without approved necessity and legal basis.

## 8. Design

Three candidate directions: warm editorial neighborhood-market style (probability 0.07); restrained alpine utility with blue accents (0.04); vivid contemporary orange food-market style (0.08). Choose warm editorial neighborhood-market style.

**Design movement:** contemporary editorial food-market design, with confident typography, generous imagery and tactile rounded controls.

**Core principles:** food-first imagery; one-handed action placement; concise Russian microcopy; honest status/empty/error feedback.

**Color philosophy:** warm ivory surfaces and deep ink typography make food photography inviting; tomato-red accents identify primary actions; muted sage distinguishes available/positive states. Avoid ornamental gradients and misleading urgency badges.

**Layout paradigm:** a portrait editorial feed with a compact address header, broad search, horizontal category rail, asymmetric promotional banner and vertically flowing restaurant cards. Detail screens use edge-to-edge photography and a sticky purchase action. Web expands with a navigation rail while keeping clear content hierarchy; operations views use purpose-built tables/panels rather than a phone screenshot stretched to desktop.

**Signature elements:** abstract bowl/route-pin brand mark; small uppercase editorial eyebrows; compact pill-shaped metadata and selection controls.

**Interaction philosophy:** immediately visible selected states, recoverable cart confirmation, clear recalculated checkout totals and persistent navigation. Never silently destroy a cart.

**Animation:** brief 160–220 ms opacity/scale transitions for sheets, selections and cart badges; preserve scroll position; honor reduced motion. No animations that delay checkout or hide information.

**Typography:** system-native Cyrillic sans serif body with a bold editorial sans headline treatment, 28–32 px major headings, 18–22 px section titles, 15–16 px body and 12–13 px metadata. Support dynamic font sizes and readable contrast.

**Brand essence:** Food from your neighborhood, delivered with care in Ак-Довурак. Personality: warm, dependable, local.

**Brand voice:** direct and welcoming, never generic hype. Examples: «Что вкусного сегодня?» and «Добавить в корзину · 390 ₽».

**Wordmark and logo:** a compact bowl/pin symbol beside a two-line Ак-Довурак wordmark; square native launcher icon without baked-in rounded corners.

**Signature brand color:** tomato red `#E64B36`. Light/dark/automatic themes preserve legibility and identity.

Food images require supplied restaurant photos for real listings. Approved illustrative data can use clearly identified illustrative photography without fabricated ratings, testimonials or real-world business claims.

## 9. Implementation sequence

1. Approve this stack, architecture and illustrative-data choice. Preserve the complete specification in project documentation and write outcome-based TODO criteria before application coding.
2. Implement schema/migrations, money/order domain rules, identity/session boundaries and provider-unavailable states. Establish the starter schema before its first auth/API request.
3. Implement catalog/search/favorites/restaurant/dish/cart flows, Russian theme system, native branding assets and server-backed quote/checkout/order history. Add approved real catalog or explicitly approved isolated test catalog.
4. Implement restaurant onboarding and tenant-restricted operations, administrator provisioning/MFA/access, support, append-only financial ledger/reporting and in-app notifications. Keep unavailable external actions disabled and explained.
5. Run actual compiler/unit/API/integration checks, fix confirmed defects and obtain one read-only implementation review. Report executed checks separately from unverified native/integration scenarios. Do not advance an affected operational feature with unresolved critical defects.
6. Save an accepted checkpoint and hand off source/configuration and documentation. Keep publication off until separately authorized and verified. Native APK/AAB builds are performed through the Dashboard, not inside the sandbox. A build is not a signed release until its actual result is available.
7. Complete Russian production/test hosting, backups and demonstrated restore, monitoring, domains/TLS, email/payment/push providers, legal review, real-device closed testing, signing and then current RuStore requirements review before submission. These are launch gates, not assumed completed tasks.

## 10. Build and operational workflow

Development: managed Metro/Web listener on 8081 and API on 3000; preserve platform-supplied public/device addresses without hardcoding. Dependencies are installed; reuse pinned pnpm and lockfile. TypeScript diagnostics are registered. Run finite database synchronization before starter auth/API traffic, then start only missing listeners and verify readiness. Keep secret values server-only.

Checks: use the project's actual TypeScript/Vitest commands and focused integration checks, with no live financial side effects. CI must install from lockfile, check types, run tests and compile server; native release build remains a separate Dashboard workflow. Document test limitations honestly.

Checkpoint: fetch canonical main, preserve remote work, commit/push intended source and confirm recorded checkpoint. Existing auto-publication is off. Do not publish an unauthenticated administrative surface or claim that Preview is production.

Android/iOS: Dashboard Connect Expo uses protected credentials. Preview and Expo Go do not prove signed release or all native features. Configure minimal permissions, actual icon and release metadata; use Dashboard APK/AAB/iOS build results. Store signing credentials securely; never commit them. RuStore account, contact details, policy, genuine device screenshots, age/content declarations and moderation submission require user-supplied/verified information.

Backups, restore, incident handling and update instructions must distinguish available managed capabilities from the independently provisioned production architecture. Never invent a managed point-in-time-restore API or claim a backup was tested unless it was restored successfully.

## 11. Decisions and inputs needed

- Approve React Native/Expo + managed MySQL instead of the preferred Flutter/PostgreSQL stack.
- Choose an empty real catalog or explicitly approved, isolated and visibly labeled illustrative catalog. Illustrative businesses are not represented as real partners and cannot accept real orders.
- Select and connect an approved transactional email provider for verification and password recovery; no email delivery success will be simulated. SMS authentication is explicitly excluded. Supply the password policy, session lifetime and account-recovery policy for review.
- Supply verified restaurant/menu/address/delivery data and operator membership information.
- Select payment provider and merchant arrangement. Providers, hosting, domains and store accounts may have fees; no paid provider is purchased without authorization.
- Resolve Russian production data hosting and legal policies with qualified counsel.
- Supply administrator provisioning details/MFA setup, Expo/build account, release signing, developer contacts, production domain and RuStore account when reaching their stages.

Until these launch gates are resolved and critical scenarios are verified, the product must not be described as ready for commercial production.
