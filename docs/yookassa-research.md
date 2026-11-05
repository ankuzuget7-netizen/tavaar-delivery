# ЮKassa — подтверждённые требования для плана

Источники проверены 2026-11-05.

- API endpoint: `https://api.yookassa.ru/v3/`. Для обычного магазина используется HTTP Basic Auth: shop ID как username и secret key как password. Секретный ключ нельзя публиковать или передавать в браузер.
  Источник: https://yookassa.ru/developers/using-api/interaction-format
- Для POST/DELETE нужно передавать `Idempotence-Key`, до 64 символов; рекомендуется V4 UUID. ЮKassa сохраняет идемпотентность 24 часа. HTTP 500 не доказывает успех/неуспех операции; сначала нужно запросить результат объекта.
  Источник: https://yookassa.ru/developers/using-api/interaction-format
- Webhook payload имеет `type=notification`, `event` и `object`. Для обычной HTTP Basic Auth подписка на уведомления настраивается в личном кабинете в разделе HTTP-уведомлений; URL должен быть HTTPS на 443 или 8443 и TLS 1.2+.
- Для платежей полезны события `payment.waiting_for_capture`, `payment.succeeded`, `payment.canceled`; для возвратов — `refund.succeeded`. ЮKassa требует ответ HTTP 200; другие ответы приводят к повторной доставке уведомления в течение следующих 24 часов.
- Подлинность webhook можно дополнительно проверять по актуальному статусу объекта через API и по IP-диапазонам ЮKassa, опубликованным в документации. Проверка статуса через API должна быть источником истины, а webhook — триггером обработки.
  Источник: https://yookassa.ru/developers/using-api/webhooks
- Для чеков/54-ФЗ нужно заранее определить сценарий фискализации и состав передаваемых позиций; официальная документация отдельно описывает receipts API и настройки онлайн-кассы.
  Источник: https://yookassa.ru/developers/solutions-for-businesses/receipts

Текущее состояние проекта:
- `orders` уже хранит server-authoritative `totalKopecks`, status history и idempotencyKey.
- Migration 0014 добавляет только `paymentMethod='cash'`; онлайн-поле/платёжный объект ЮKassa ещё не реализованы.
- `customerOrders.create` внутри транзакции заново загружает active restaurant/menu items и пересчитывает totalKopecks.
- Существуют статусы orders `payment_error` и `refunded`, но нет `yookassaPaymentId`, payment status/event ledger, webhook route, refund workflow или provider adapter.
