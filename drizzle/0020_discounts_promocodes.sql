ALTER TABLE `orders`
  ADD COLUMN `subtotalKopecks` int NOT NULL DEFAULT 0,
  ADD COLUMN `discountKopecks` int NOT NULL DEFAULT 0,
  ADD COLUMN `promoCode` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `order_items`
  ADD COLUMN `originalPriceKopecks` int NOT NULL DEFAULT 0,
  ADD COLUMN `discountKopecks` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `menu_discounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `restaurantId` int NOT NULL,
  `menuItemId` int NULL,
  `categoryId` int NULL,
  `discountType` enum('percent','fixed') NOT NULL,
  `value` int NOT NULL,
  `startsAt` timestamp NULL,
  `endsAt` timestamp NULL,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `menu_discounts_id` PRIMARY KEY(`id`),
  CONSTRAINT `menu_discounts_restaurant_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_discounts_item_fk` FOREIGN KEY (`menuItemId`) REFERENCES `menu_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `menu_discounts_category_fk` FOREIGN KEY (`categoryId`) REFERENCES `menu_categories`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `restaurantId` int NOT NULL,
  `code` varchar(64) NOT NULL,
  `discountType` enum('percent','fixed') NOT NULL,
  `value` int NOT NULL,
  `minOrderKopecks` int NOT NULL DEFAULT 0,
  `usageLimit` int NULL,
  `usagePerUserLimit` int NULL,
  `usageCount` int NOT NULL DEFAULT 0,
  `startsAt` timestamp NULL,
  `endsAt` timestamp NULL,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `promo_codes_id` PRIMARY KEY(`id`),
  CONSTRAINT `promo_codes_restaurant_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promo_codes_restaurant_code` UNIQUE(`restaurantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `promo_code_usages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `promoCodeId` int NOT NULL,
  `restaurantId` int NOT NULL,
  `orderId` int NOT NULL,
  `customerId` int NOT NULL,
  `discountKopecks` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `promo_code_usages_id` PRIMARY KEY(`id`),
  CONSTRAINT `promo_code_usages_promo_fk` FOREIGN KEY (`promoCodeId`) REFERENCES `promo_codes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promo_code_usages_restaurant_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promo_code_usages_order_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promo_code_usages_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promo_code_usages_order_promo` UNIQUE(`orderId`,`promoCodeId`)
);
