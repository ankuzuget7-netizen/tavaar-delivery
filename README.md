# Ак-Довурак Доставка

Native Expo/React Native foundation for a Russian-language food-delivery platform for Ак-Довурак, Republic of Tyva. The managed project uses TypeScript, Expo Router, Express/tRPC, Drizzle and a managed MySQL-compatible database. The app is designed for native Android/iOS builds and also has an Expo Web surface for operational views.

## Current status

Phase 1 is implemented and verified: customer home shell, Russian empty-catalog experience, navigation tabs for home/orders/help/profile, native brand assets, partner application form, server-side Zod validation, and persisted `restaurant_applications` records with `pending` status. The public catalog is intentionally empty because the user approved adding only verified restaurants through onboarding.

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

## Data and security notes

`restaurant_applications` is a durable table with server-validated inputs. Public submission does not grant operator access and approval does not yet create a public restaurant record; the restaurant/menu domain is intentionally a later phase. Admin list/status procedures already use server-side admin authorization, but admin UI, MFA and audit logging remain open.

Never put SMS/payment secrets in the mobile bundle or repository. Configure them through protected project secrets only after the provider, legal basis, contracts and environment separation are selected. Use provider-confirmed server events for payment success and never store card data.

## Delivery readiness

The current checks pass: TypeScript, Expo lint, Vitest (25 tests passed, 1 skipped), database migration generation/application, backend bundle build, API health, and a mobile 390×844 visual capture. These checks do not establish native-device compatibility, security guarantees, production readiness, Russian data-hosting compliance, payment/SMS integration, or RuStore approval.

See [plan.md](./plan.md) for architecture/design decisions and [TODO.md](./TODO.md) for the complete acceptance criteria and remaining launch work.
