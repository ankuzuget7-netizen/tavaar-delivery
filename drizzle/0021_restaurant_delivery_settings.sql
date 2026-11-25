ALTER TABLE `restaurants` ADD COLUMN `deliveryFeeKopecks` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `restaurants` ADD COLUMN `freeDeliveryFromKopecks` int NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD COLUMN `deliveryTimeMinutes` int NOT NULL DEFAULT 60;--> statement-breakpoint
ALTER TABLE `restaurants` ADD COLUMN `pickupTimeMinutes` int NOT NULL DEFAULT 20;--> statement-breakpoint
