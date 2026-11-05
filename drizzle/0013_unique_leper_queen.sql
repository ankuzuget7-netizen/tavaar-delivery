ALTER TABLE `phone_auth_challenges` MODIFY COLUMN `purpose` enum('register','login','change_phone') NOT NULL;--> statement-breakpoint
ALTER TABLE `phone_auth_challenges` ADD `userId` int;--> statement-breakpoint
ALTER TABLE `phone_auth_challenges` ADD CONSTRAINT `phone_auth_challenges_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;