-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steuerjahr" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewAnswer_userId_steuerjahr_idx" ON "InterviewAnswer"("userId", "steuerjahr");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAnswer_userId_steuerjahr_questionId_key" ON "InterviewAnswer"("userId", "steuerjahr", "questionId");
