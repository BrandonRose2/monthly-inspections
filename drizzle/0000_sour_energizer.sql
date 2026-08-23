CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "inspection_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"monthKey" varchar(7) NOT NULL,
	"region" varchar(64) NOT NULL,
	"property" varchar(128) NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"xed" boolean DEFAULT false NOT NULL,
	"note" text,
	"pdfName" varchar(255),
	"pdfKey" varchar(512),
	"pdfSize" integer,
	"pdfUploadedAt" varchar(64),
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
