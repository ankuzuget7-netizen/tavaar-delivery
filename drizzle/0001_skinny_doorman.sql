CREATE TABLE `restaurant_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` varchar(80) NOT NULL,
	`address` varchar(240) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`contact` varchar(120) NOT NULL,
	`description` text,
	`status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_applications_id` PRIMARY KEY(`id`)
);
