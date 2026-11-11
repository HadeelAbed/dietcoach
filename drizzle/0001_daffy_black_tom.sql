CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`location` varchar(255),
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cashiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`email` varchar(320) NOT NULL,
	`branchId` int NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cashiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cashiers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`email` varchar(320),
	`totalMeals` int NOT NULL,
	`mealsRemaining` int NOT NULL,
	`registrationLinkId` int NOT NULL,
	`sourceBranchId` int NOT NULL,
	`sourceCashierId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `deliveryLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`customerId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`cashierId` int,
	`branchId` int,
	`status` enum('pending','completed','expired') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`redeemedAt` timestamp,
	CONSTRAINT `deliveryLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `deliveryLinks_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`branchId` int,
	`cashierId` int,
	`method` enum('cashier','delivery') NOT NULL,
	`deliveryLinkId` int,
	`redeemedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registrationLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`branchId` int NOT NULL,
	`cashierId` int NOT NULL,
	`totalMeals` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registrationLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `registrationLinks_token_unique` UNIQUE(`token`)
);
