# Ак-Довурак Доставка

Native Expo/React Native foundation for a Russian-language food-delivery platform for Ак-Довурак, Republic of Tyva. The managed project uses TypeScript, Expo Router, Express/tRPC, Drizzle and a managed MySQL-compatible database. The app is designed for native Android/iOS builds and also has an Expo Web surface for operational views.

## Current status

Phase 1 is implemented and verified: customer home shell, Russian empty-catalog experience, navigation tabs for home/orders/help/profile, native brand assets, partner application form, server-side Zod validation, persisted `restaurant_applications` records with `pending` status, a server-authorized admin application-review cabinet, a protected restaurant-owner cabinet, transactional approval that creates an active public restaurant plus an owner membership, owner management for menu categories/items, kopeck-safe prices, item availability and weekly operating hours, and the first end-to-end order loop with customer placement, immutable price snapshots, owner status tracking and durable notifications. The public catalog is intentionally empty until an actual application is approved.

This is not a production-ready delivery platform yet. Cart, checkout, orders, phone OTP, restaurants and menus, operator/admin dashboards, payment/push/SMS providers, finance ledgers, support tickets, privacy/legal documents, production infrastructure and native release verification remain open in `TODO.md`. The project does not simulate successful payments, SMS, reviews, orders, ratings or financial metrics.

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
- `/admin/applications` — admin application review; the screen requires the server-side `admin` role and cannot be unlocked by a frontend parameter.

## Data and security notes

`restaurant_applications` is a durable table with server-validated inputs. If an applicant is authenticated, the application stores that user ID and approval can use it automatically. For an unauthenticated application, the administrator must enter an existing user account ID; the server never invents an owner. Approval runs in one transaction: it validates the application and owner, creates an active restaurant, creates an `owner` membership, and marks the application approved. A unique application-to-restaurant constraint and idempotent membership insert prevent duplicate approval side effects. Owner menu/hour/order procedures resolve an active owner membership first and scope every query/mutation to that restaurant. Prices and order totals are integer kopecks; order items store name/price snapshots; totals are recomputed on the server; status history and owner/customer notifications are written transactionally. Admin list/status procedures and the admin cabinet use server-side admin authorization, but MFA, audit logging, reviewer metadata, payment providers, courier assignment and push delivery remain open.

Never put SMS/payment secrets in the mobile bundle or repository. Configure them through protected project secrets only after the provider, legal basis, contracts and environment separation are selected. Use provider-confirmed server events for payment success and never store card data.

## Delivery readiness

The current checks pass: TypeScript, Expo lint, Vitest (25 tests passed, 1 skipped), database migration generation/application, backend bundle build, API health, and a mobile 390×844 visual capture. These checks do not establish native-device compatibility, security guarantees, production readiness, Russian data-hosting compliance, payment/SMS integration, or RuStore approval.

See [plan.md](./plan.md) for architecture/design decisions and [TODO.md](./TODO.md) for the complete acceptance criteria and remaining launch work.
