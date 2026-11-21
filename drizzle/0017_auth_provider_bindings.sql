CREATE TABLE `auth_provider_bindings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `channel` enum('telegram','max') NOT NULL,
  `providerUserId` varchar(128) NOT NULL,
  `providerChatId` varchar(128),
  `verifiedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `auth_provider_bindings_id` PRIMARY KEY(`id`),
  CONSTRAINT `auth_provider_bindings_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`),
  CONSTRAINT `auth_provider_bindings_channel_provider_user` UNIQUE(`channel`,`providerUserId`),
  CONSTRAINT `auth_provider_bindings_user_channel` UNIQUE(`userId`,`channel`)
);
