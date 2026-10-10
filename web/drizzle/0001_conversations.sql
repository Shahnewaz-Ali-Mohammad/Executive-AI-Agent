CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
-- Keep existing chats: each workspace's old running chat becomes one saved
-- conversation, titled with its first question.
INSERT INTO "conversations" ("workspace_id", "title", "created_at", "updated_at")
SELECT m."workspace_id",
	COALESCE(
		(SELECT left(regexp_replace(f."content", '\s+', ' ', 'g'), 60) FROM "chat_messages" f
			WHERE f."workspace_id" = m."workspace_id" AND f."role" = 'user'
			ORDER BY f."created_at" LIMIT 1),
		'Earlier conversation'),
	min(m."created_at"), max(m."created_at")
FROM "chat_messages" m
GROUP BY m."workspace_id";--> statement-breakpoint
UPDATE "chat_messages" m SET "conversation_id" = c."id"
FROM "conversations" c WHERE c."workspace_id" = m."workspace_id";--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_workspace_idx" ON "conversations" USING btree ("workspace_id","updated_at");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","created_at");