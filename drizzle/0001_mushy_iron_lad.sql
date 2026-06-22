CREATE TABLE `inspection_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`region` varchar(64) NOT NULL,
	`property` varchar(128) NOT NULL,
	`checked` boolean NOT NULL DEFAULT false,
	`xed` boolean NOT NULL DEFAULT false,
	`note` text,
	`pdfName` varchar(255),
	`pdfKey` varchar(512),
	`pdfSize` int,
	`pdfUploadedAt` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_records_id` PRIMARY KEY(`id`)
);
