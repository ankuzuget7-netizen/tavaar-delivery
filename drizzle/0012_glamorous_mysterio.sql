CREATE TABLE `phone_auth_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(16) NOT NULL,
	`channel` enum('telegram','max') NOT NULL,
	`purpose` enum('register','login') NOT NULL,
	`stateHash` varchar(64) NOT NULL,
	`name` varchar(120),
	`termsAcceptedAt` timestamp,
	`privacyAcceptedAt` timestamp,
	`providerUserId` varchar(128),
	`providerChatId` varchar(128),
	`linkedAt` timestamp,
	`codeHash` varchar(64),
	`codeExpiresAt` timestamp,
	`resendAvailableAt` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`verifiedAt` timestamp,
	`consumedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `phone_auth_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `phone_auth_challenges_stateHash_unique` UNIQUE(`stateHash`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phoneVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_phone_unique` UNIQUE(`phone`);