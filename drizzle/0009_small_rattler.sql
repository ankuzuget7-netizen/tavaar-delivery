ALTER TABLE `orders` ADD `idempotencyKey` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_idempotencyKey_unique` UNIQUE(`idempotencyKey`);