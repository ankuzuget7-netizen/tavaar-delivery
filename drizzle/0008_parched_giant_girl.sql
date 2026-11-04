CREATE TABLE `delivery_drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`vehicle` varchar(120),
	`status` enum('offline','available','busy','suspended') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_drivers_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `driver_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`driverId` int NOT NULL,
	`latitudeE6` int NOT NULL,
	`longitudeE6` int NOT NULL,
	`accuracyCm` int,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driver_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_driver_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`driverId` int NOT NULL,
	`assignedByUserId` int NOT NULL,
	`status` enum('assigned','accepted','picked_up','delivered','cancelled') NOT NULL DEFAULT 'assigned',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_driver_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_driver_assignments_orderId_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
ALTER TABLE `delivery_drivers` ADD CONSTRAINT `delivery_drivers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driver_locations` ADD CONSTRAINT `driver_locations_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `driver_locations` ADD CONSTRAINT `driver_locations_driverId_delivery_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `delivery_drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_driver_assignments` ADD CONSTRAINT `order_driver_assignments_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_driver_assignments` ADD CONSTRAINT `order_driver_assignments_driverId_delivery_drivers_id_fk` FOREIGN KEY (`driverId`) REFERENCES `delivery_drivers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_driver_assignments` ADD CONSTRAINT `order_driver_assignments_assignedByUserId_users_id_fk` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;