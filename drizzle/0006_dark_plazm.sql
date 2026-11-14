CREATE TABLE `mealPackages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`durationDays` int NOT NULL,
	`totalMeals` int NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mealPackages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `gender` enum('female','male','unspecified') DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `packageId` int;--> statement-breakpoint
ALTER TABLE `customers` ADD `packageName` varchar(140) DEFAULT 'غير محدد' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `packageDays` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `packageStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `packageExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `registrationLinks` ADD `packageSelectionEnabled` int DEFAULT 0 NOT NULL;