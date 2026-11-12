CREATE TABLE `deliveryStations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`cashierId` int NOT NULL,
	`branchId` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `deliveryStations_id` PRIMARY KEY(`id`),
	CONSTRAINT `deliveryStations_token_unique` UNIQUE(`token`),
	CONSTRAINT `deliveryStations_cashierId_unique` UNIQUE(`cashierId`)
);
