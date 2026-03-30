CREATE TABLE "dead_letter_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"object_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error_code" text NOT NULL,
	"first_error" text NOT NULL,
	"last_error" text NOT NULL,
	"attempts" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"object_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text,
	"job_type" text NOT NULL,
	"object_id" text NOT NULL,
	"oracle_id" text,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedup_idx" ON "jobs" USING btree ("object_id","type") WHERE "jobs"."status" = 'pending';