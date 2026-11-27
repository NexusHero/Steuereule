-- Unread answers of the owl, kept on the server: when the last answer of a conversation finished and when the
-- user last had the conversation open. An answer newer than the last look is unread on every device and after a
-- reload. Both are null for existing conversations, which therefore count as read.
ALTER TABLE "BeraterGespraech" ADD COLUMN "beantwortetAm" TIMESTAMP(3);
ALTER TABLE "BeraterGespraech" ADD COLUMN "gelesenAm" TIMESTAMP(3);
