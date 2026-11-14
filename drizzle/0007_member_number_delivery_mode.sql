ALTER TABLE `customers` ADD `membershipNumber` varchar(24);--> statement-breakpoint
ALTER TABLE `customers` ADD `deliveryMode` enum('delivery','manual') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
UPDATE `customers` SET `membershipNumber` = CONCAT('DC-', LPAD(`id`, 8, '0')) WHERE `membershipNumber` IS NULL;--> statement-breakpoint
ALTER TABLE `customers` MODIFY `membershipNumber` varchar(24) NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_membershipNumber_unique` UNIQUE(`membershipNumber`);