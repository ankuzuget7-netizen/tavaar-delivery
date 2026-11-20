ALTER TABLE `restaurants` ADD COLUMN `logoUrl` varchar(500) NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD COLUMN `coverUrl` varchar(500) NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD COLUMN `deliveryConditions` text NULL;--> statement-breakpoint
ALTER TABLE `menu_items` ADD COLUMN `imageUrl` varchar(500) NULL;
