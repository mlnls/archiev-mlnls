CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analyses_job_kind_idx` ON `analyses` (`job_id`,`kind`);--> statement-breakpoint
CREATE TABLE `batch_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text DEFAULT 'schedule' NOT NULL,
	`status` text NOT NULL,
	`stats` text,
	`errors` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `job_status` (
	`job_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`company_logo` text,
	`location` text,
	`categories` text NOT NULL,
	`tech_stacks` text NOT NULL,
	`min_career` integer,
	`max_career` integer,
	`newcomer` integer DEFAULT false NOT NULL,
	`employment_type` text,
	`deadline` integer,
	`always_open` integer DEFAULT false NOT NULL,
	`posted_at` integer,
	`salary_text` text,
	`education_text` text,
	`tags` text NOT NULL,
	`description` text,
	`detail_fetched_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_active_idx` ON `jobs` (`active`);--> statement-breakpoint
CREATE INDEX `jobs_source_idx` ON `jobs` (`source`);--> statement-breakpoint
CREATE INDEX `jobs_first_seen_idx` ON `jobs` (`first_seen_at`);--> statement-breakpoint
CREATE TABLE `matches` (
	`job_id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`track` text,
	`excluded` integer DEFAULT false NOT NULL,
	`result` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matches_score_idx` ON `matches` (`score`);--> statement-breakpoint
CREATE TABLE `profile_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
