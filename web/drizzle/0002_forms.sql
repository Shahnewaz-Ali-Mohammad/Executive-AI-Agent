CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"template_name" text NOT NULL,
	"fields" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "form" jsonb;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_template_id_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."form_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_workspace_idx" ON "form_submissions" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- Two example templates to start with (they can be edited or deleted in the app).
INSERT INTO "form_templates" ("name", "description", "fields") VALUES
('Leave request', 'Request time off for an employee.', '[
  {"key":"employee_name","label":"Employee name","type":"text","required":true},
  {"key":"department","label":"Department","type":"text","required":true},
  {"key":"leave_type","label":"Leave type","type":"select","required":true,"options":["Annual","Sick","Unpaid","Other"]},
  {"key":"start_date","label":"Start date","type":"date","required":true},
  {"key":"end_date","label":"End date","type":"date","required":true},
  {"key":"reason","label":"Reason","type":"long_text","required":false},
  {"key":"handover_arranged","label":"Handover arranged","type":"checkbox","required":false}
]'::jsonb),
('Expense claim', 'Claim back money spent on company business.', '[
  {"key":"employee_name","label":"Employee name","type":"text","required":true},
  {"key":"expense_date","label":"Date of expense","type":"date","required":true},
  {"key":"category","label":"Category","type":"select","required":true,"options":["Travel","Meals","Accommodation","Supplies","Other"]},
  {"key":"amount","label":"Amount","type":"number","required":true,"hint":"Total including tax"},
  {"key":"currency","label":"Currency","type":"select","required":true,"options":["BDT","USD","EUR","GBP"]},
  {"key":"description","label":"What it was for","type":"long_text","required":true},
  {"key":"receipt_attached","label":"Receipt attached","type":"checkbox","required":false}
]'::jsonb);
