CREATE TABLE `menu_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`priceKopecks` int NOT NULL,
	`prepMinutes` int NOT NULL DEFAULT 30,
	`available` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restaurant_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`isClosed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_hours_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurant_hours_restaurant_day` UNIQUE(`restaurantId`,`dayOfWeek`)
);
--> statement-breakpoint
ALTER TABLE `menu_categories` ADD CONSTRAINT `menu_categories_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_items` ADD CONSTRAINT `menu_items_categoryId_menu_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `menu_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `restaurant_hours` ADD CONSTRAINT `restaurant_hours_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;