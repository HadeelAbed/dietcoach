ALTER TABLE `customers` ADD `googleWalletObjectId` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `googleWalletStatus` enum('pending','ready','error') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `googleWalletErrorCode` varchar(80);--> statement-breakpoint
ALTER TABLE `customers` ADD `googleWalletUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_googleWalletObjectId_unique` UNIQUE(`googleWalletObjectId`);