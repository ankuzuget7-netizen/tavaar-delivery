CREATE TABLE `restaurant_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','manager','staff') NOT NULL DEFAULT 'owner',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `restaurant_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurant_members_restaurant_user_role` UNIQUE(`restaurantId`,`userId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` varchar(80) NOT NULL,
	`address` varchar(240) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`description` text,
	`status` enum('active','suspended','blocked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurants_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurants_applicationId_unique` UNIQUE(`applicationId`)
);
