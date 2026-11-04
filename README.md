# Ак-Довурак Доставка

Native Expo/React Native foundation for a Russian-language food-delivery platform for Ак-Довурак, Republic of Tyva. The managed project uses TypeScript, Expo Router, Express/tRPC, Drizzle and a managed MySQL-compatible database. The app is designed for native Android/iOS builds and also has an Expo Web surface for operational views.

## Current status

Phase 1 is implemented and verified: customer home shell, Russian empty-catalog experience, navigation tabs for home/orders/help/profile, native brand assets, partner application form, server-side Zod validation, persisted `restaurant_applications` records with `pending` status, a server-authorized admin application-review cabinet, a protected restaurant-owner cabinet, transactional approval that creates an active public restaurant plus an owner membership, owner management for menu categories/items, kopeck-safe prices, item availability and weekly operating hours, the first end-to-end order loop with customer placement, immutable price snapshots, owner status tracking and durable notifications, plus authenticated WebSocket events and Expo push-token registration/delivery. The public catalog is intentionally empty until an actual application is approved.

The 2026-11-04 audit is documented in [AUDIT_REPORT_2026-11-04.md](AUDIT_REPORT_2026-11-04.md). The audit hardening prevents generic admin status updates from bypassing atomic restaurant publication, rejects session tokens bound to another app, fails closed on missing/weak production auth configuration, and adds a unique UUID idempotency key to customer order creation so retries do not create duplicate orders.

This is not a production-ready delivery platform yet. Cart, checkout, orders, email/password authentication, restaurants and menus, operator/admin dashboards, payment/push/email providers, finance ledgers, support tickets, privacy/legal documents, production infrastructure and native release verification remain open in `TODO.md`. The project does not simulate successful payments, email delivery, reviews, orders, ratings or financial metrics. SMS authentication is explicitly out of scope.

## Run locally in the managed project

The fixed mobile runtime uses Metro/Web on port 8081 and the API on port 3000:

```bash
pnpm db:push
pnpm dev
```

Useful checks:

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
```

The API health endpoint is `GET /api/health`. The current API uses the managed database configured by the Webdev project; do not point tests at production-like data without an isolated environment because managed development and published data share the database.

## Important routes

- `/` — customer home and intentionally empty restaurant catalog.
- `/orders` — empty order history state.
- `/support` — help/FAQ shell.
- `/profile` — profile and partner entry point.
- `/partner/apply` — restaurant onboarding application.
- `/partner/dashboard` — owner cabinet for menu categories, dishes, integer kopeck prices, availability, weekly operating hours and the entry point to order operations; private operations remain locked until a real authenticated owner/application membership exists.
- `/partner/orders` — owner order queue, server-validated status transitions and durable notification inbox.
- `/restaurant/:id` — public approved-restaurant menu and authenticated customer checkout flow.
- `/driver/dashboard` — authenticated driver registration, assigned deliveries, delivery status actions and foreground GPS capture.
- `/order/:id/tracking` — customer delivery status and latest driver location with a link to external maps.

The API WebSocket endpoint is `/api/ws`. It authenticates the session cookie or connection token, scopes connections by user ID and emits `order.created` to restaurant owners and `order.status_changed` to customers only after the corresponding database transaction commits. The app root invalidates durable tRPC queries when these events arrive, so a dropped socket cannot become the source of truth. Native builds request Expo notification permission, register the Expo push token in `push_tokens`, and the server sends order events through Expo's push endpoint; Web Preview skips native registration but still uses WebSockets where authenticated cookies are available.

Delivery adds `delivery_drivers`, `order_driver_assignments` and append-only `driver_locations`. Owners can assign an available registered driver only after an order is ready. Drivers can accept, pick up and complete the assignment. While an assignment is active, the native driver screen requests foreground location permission and sends a coordinate at most every 10 seconds or 25 meters; the server verifies the assignment before persisting it and broadcasts `driver.location_updated` only to the customer and restaurant members for that order. The customer sees the latest coordinates and timestamp and can open them in an external map. Background location, geofencing, route ETA, map tiles and automatic driver identity verification remain open.
- `/admin/applications` — admin application review; the screen requires the server-side `admin` role and cannot be unlocked by a frontend parameter.

## Data and security notes

`restaurant_applications` is a durable table with server-validated inputs. If an applicant is authenticated, the application stores that user ID and approval can use it automatically. For an unauthenticated application, the administrator must enter an existing user account ID; the server never invents an owner. Approval runs in one transaction: it validates the application and owner, creates an active restaurant, creates an `owner` membership, and marks the application approved. A unique application-to-restaurant constraint and idempotent membership insert prevent duplicate approval side effects. Owner menu/hour/order procedures resolve an active owner membership first and scope every query/mutation to that restaurant. Prices and order totals are integer kopecks; order items store name/price snapshots; totals are recomputed on the server; status history and owner/customer notifications are written transactionally. WebSocket broadcasts and Expo push sends happen after commit, while durable notifications remain authoritative. Admin list/status procedures and the admin cabinet use server-side admin authorization, but MFA, audit logging, reviewer metadata, payment providers and courier assignment remain open.

Never put email/payment secrets in the mobile bundle or repository. Configure them through protected project secrets only after the provider, legal basis, contracts and environment separation are selected. If the email provider is absent, show an unavailable state instead of claiming that a verification or reset email was sent. Use provider-confirmed server events for payment success and never store card data.

## Delivery readiness

The current checks pass: TypeScript, Expo lint, Vitest, database migration generation/application, backend bundle build, API health, and a mobile 390×844 visual capture. These checks do not establish native-device compatibility, security guarantees, production readiness, Russian data-hosting compliance, payment/email integration, or RuStore approval.

See [plan.md](./plan.md) for architecture/design decisions and [TODO.md](./TODO.md) for the complete acceptance criteria and remaining launch work.
