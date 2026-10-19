CREATE TABLE "document_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"date" date,
	"value" text,
	"page" integer,
	"quote" text,
	"status" text DEFAULT 'unchecked' NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"reminder_days" jsonb DEFAULT '[30,7,0]'::jsonb NOT NULL,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "fact_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "facts_status" text DEFAULT 'not_read' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "facts_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "facts_error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "document_facts" ADD CONSTRAINT "document_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_facts" ADD CONSTRAINT "document_facts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_facts_workspace_date_idx" ON "document_facts" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "document_facts_document_idx" ON "document_facts" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_fact_id_document_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."document_facts"("id") ON DELETE set null ON UPDATE no action;