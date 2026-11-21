ALTER TABLE `phone_auth_challenges`
  MODIFY COLUMN `purpose` enum('register','login','change_phone','bind_provider') NOT NULL;
