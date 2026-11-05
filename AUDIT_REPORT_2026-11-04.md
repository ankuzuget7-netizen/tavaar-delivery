# Полный аудит «Таваар Доставка»

Дата: 4 ноября 2026 года  
Проект: `/home/ubuntu/akdovurak`  
Режим: read-only аудит + безопасные исправления без создания тестовых бизнес-записей в общей базе.

## Итог

Проект является рабочей основой мобильного приложения доставки с реальным серверным срезом:

- заявка на подключение заведения;
- серверное одобрение с созданием публичного ресторана и membership владельца;
- scoped-кабинет владельца;
- меню, категории, цены в копейках, доступность и график;
- создание заказа с серверным пересчётом цены;
- серверная история статусов;
- назначение доступного курьера;
- foreground GPS и scoped WebSocket-события;
- durable notifications и Expo push boundary.

Это ещё не завершённая коммерческая платформа. Комиссия 8%, финансы, email/password authentication, платежи, полноценная корзина, расширенная админка, support, legal/compliance и native release evidence отсутствуют либо не подтверждены. SMS-аутентификация явно исключена из текущего scope.

## Что реально проверено

### Автоматические проверки

Запущены успешно:

- `pnpm check` — TypeScript без ошибок;
- `pnpm lint` — без lint-ошибок; остаются предупреждения pnpm/eslint о конфигурации модулей;
- `pnpm test` — 27 тестов прошли, 1 пропущен (`auth.logout` требует OAuth-сессии);
- security regression suite — 2 теста прошли;
- `pnpm build` — backend bundle собран в `dist/index.js`;
- `pnpm db:push` — миграция idempotency key создана и применена;
- `GET /api/health` — `200 OK`;
- неавторизованный `/api/ws` — отказ `1008 Unauthorized`;
- push helper с пустым списком получателей — корректно не отправляет сетевой запрос.

### Проверенные экраны и route-файлы

Инвентаризированы 17 route-файлов, включая layouts и служебные маршруты. Основные пользовательские экраны:

- клиентский home, заказы, профиль, поддержка;
- ресторанная заявка;
- ресторанный кабинет меню/графика;
- кабинет заказов владельца;
- админская проверка заявок;
- кабинет курьера;
- customer tracking;
- публичное меню ресторана.

Статическая проверка и preview-проверки подтверждают наличие обработчиков у основных кнопок и переходов. Однако полный кликовый аудит каждой кнопки на Android и в авторизованном web-сценарии не может считаться пройденным без тестовой авторизованной сессии и native device.

## Исправленные критичные проблемы

### 1. Устранено неатомарное прямое одобрение заявки

Ранее общий admin status endpoint позволял выставить `approved`, не создавая ресторан и owner membership. Теперь общий status endpoint допускает только `pending`, `rejected` и `suspended`; публикация выполняется только через транзакционный `approveRestaurantApplication`.

### 2. Добавлена привязка session token к приложению

`verifySession` теперь отклоняет корректно подписанный JWT, если его `appId` не совпадает с текущим проектом. Добавлен regression test на cross-app token.

### 3. Production authentication fail-closed

Production startup теперь завершается ошибкой при отсутствии project ID, OAuth server URL или JWT secret, а JWT secret короче 32 символов отклоняется.

### 4. Защита от повторного создания заказа

В заказ добавлен nullable unique `idempotencyKey`, создана миграция `0009_small_rattler.sql`. Клиент создаёт UUID на один checkout attempt, а сервер при повторе возвращает исходный заказ вместо создания дубля. Повторное использование ключа другим пользователем отклоняется.

## Что подтверждено исходным кодом

### Onboarding и публикация

- Форма заявки сохраняет основные поля и статус проверки.
- Admin list/approve/status защищены серверной admin role.
- Одобрение создаёт active restaurant и owner membership транзакционно.
- Public catalog фильтрует только active restaurants.

### Меню и ресторанный кабинет

- Owner membership проверяется на сервере.
- Категории, блюда, цены в integer kopecks, preparation minutes и availability работают через scoped procedures.
- Weekly hours сохраняются по ресторану.

### Заказы

- Цена и line totals пересчитываются на сервере.
- Сохраняются snapshots названия и цены блюда.
- Проверяется active restaurant и доступность menu items.
- История статусов сохраняется.
- Есть owner-scoped order queue и customer order history.
- Добавлен retry-safe idempotency key.

### Курьеры и realtime

- Водитель регистрируется через защищённую процедуру.
- Владелец видит доступных курьеров и назначает курьера на готовый delivery order.
- Курьерские переходы `assigned → accepted → picked_up → delivered` проверяются сервером.
- GPS пишется только для активного assignment этого курьера.
- `driver.location_updated` отправляется только customer и участникам нужного ресторана.
- Native-клиент использует foreground Expo Location.

### Auth/CORS baseline

- HttpOnly cookie и secure/same-site handling присутствуют.
- CORS suite проверяет origin allowlisting, loopback и cookie isolation.
- Cross-app session binding теперь покрыт отдельными тестами.

## Не реализовано или не подтверждено

### Критичные продуктовые пробелы

1. **Email/password authentication:** нет application-owned регистрации по имени/email/password, email verification links, email/password login, password reset links, password-attempt throttling и account email/password settings.
2. **Email delivery:** нет подключённого transactional email provider. Нельзя заявлять отправку verification/reset писем.
3. Нет 8% commission model, rate snapshot, accrual/settlement/refund ledger и financial reports.
4. Нет online payments, YooKassa/provider adapter, webhooks, reconciliation и refund flow.
5. Нет полноценной persistent cart, cross-restaurant replacement dialog с требуемым точным текстом, modifiers, promos, delivery pricing и полной checkout form.
6. Нет persisted addresses, favorites, reviews/ratings, account deletion/anonymization и consent model.
7. Нет полноценной support ticket/conversation system.
8. Admin cabinet покрывает только заявки; users, staff, all orders, complaints, banners, promos, finance, CSV и audit events отсутствуют.
9. Нет MFA/2FA, session revocation table, rate limiting и append-only admin audit log.
10. Нет background GPS, geofencing, ETA или embedded map.
11. Нет подтверждённого Android APK/AAB, подписи, physical-device run, Play/RuStore metadata или offline/native regression pass.

### Тестовое заведение и тестовый заказ

Тестовое заведение «ТЕСТ — Таваар Доставка», 10 блюд и тестовый заказ **не создавались**. Причина: managed database проекта общая для development/testing/production, а в текущем окружении нет отдельной изолированной test database и безопасной auth-fixture системы. Создание записей без такого разделения могло бы загрязнить production data.

Также нет реализованного полностью изолированного сценария:

`покупатель → ресторан → заказ → комиссия → финансы → админка`.

Поэтому этот сценарий не заявляется как пройденный.

## Безопасность: оставшиеся риски

Высокий приоритет:

- нет server-side session revocation; текущая модель всё ещё использует долгоживущие сессии;
- нет rate limiting для public onboarding, OAuth/session exchange, order creation и push registration;
- нет MFA/step-up controls и audit log для admin actions;
- нет request/body/upload quotas как отдельного security boundary;
- нет finance/payment/webhook idempotency, поскольку сами finance/payment modules отсутствуют.

Средний приоритет:

- driver pool глобальный, а не явно привязан к ресторану/service area;
- location retention, deletion и access audit не реализованы;
- application status transition policy ограничена не полностью;
- pickup использует общую обязательную address-модель и не имеет отдельной checkout-модели;
- legal/privacy/consent/retention документы и workflows отсутствуют.

## Почему не выполнены реальные UI/E2E сценарии

Для настоящего сквозного теста нужны одновременно:

- изолированная база или официальная test environment;
- test identities для customer, owner, admin и driver;
- созданное approved test restaurant;
- native Android emulator/device для location и push;
- Expo/EAS credentials и зарегистрированные push tokens;
- платёжный sandbox, если проверять payment flow;
- transactional email sandbox, если проверять verification/reset.

Их отсутствие нельзя заменять фиктивными успешными ответами или тестовыми production-записями.

## Рекомендованный следующий этап

1. Добавить test environment и seed/fixture reset tooling.
2. Реализовать email/password identity model, verification/reset tokens и безопасные email-provider unavailable states.
3. Реализовать commission/finance ledger до создания тестового заказа на 1000 ₽.
4. Реализовать persistent cart и полную checkout model.
5. Добавить автоматические API/integration tests для tenant isolation, idempotency, order transitions, commission и authorization.
6. После этого пройти изолированный E2E сценарий с реальными fixture records.
7. Выполнить native Android build и physical-device checks для push/location.

## Addendum: обновлённое требование авторизации

SMS-регистрация, SMS OTP и SMS-восстановление пароля полностью исключены из scope. Целевой flow: регистрация по имени, email и паролю; подтверждение email через expiring single-use link; вход по email/password с защитой от перебора; восстановление пароля через expiring single-use email link; управление email и паролем в настройках с re-authentication и session revocation.

Телефон не обязателен при регистрации. Он может собираться только как необязательный контакт при оформлении заказа для связи с курьером или рестораном. Email-доставка никогда не имитируется: при отсутствии или недоступности почтового провайдера UI показывает честное состояние «подтверждение/восстановление пока недоступно», а сервер не сообщает об успешной отправке.

## Файлы аудита

- [План проекта](/home/ubuntu/akdovurak/plan.md)
- [TODO с acceptance clauses](/home/ubuntu/akdovurak/TODO.md)
- [README с текущим scope](/home/ubuntu/akdovurak/README.md)
- [Security regression tests](/home/ubuntu/akdovurak/tests/security.regression.test.ts)
- [Idempotency migration](/home/ubuntu/akdovurak/drizzle/0009_small_rattler.sql)
