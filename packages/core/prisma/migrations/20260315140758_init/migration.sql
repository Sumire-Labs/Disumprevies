-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "InfractionType" AS ENUM ('WARN', 'MUTE', 'KICK', 'BAN');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "exemptRoles" TEXT[],
    "logChannel" TEXT,
    "modChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Infraction" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "InfractionType" NOT NULL,
    "reason" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "moderator" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Infraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFilter" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Infraction_guildId_userId_idx" ON "Infraction"("guildId", "userId");

-- CreateIndex
CREATE INDEX "Infraction_guildId_createdAt_idx" ON "Infraction"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "WordFilter_guildId_idx" ON "WordFilter"("guildId");

-- AddForeignKey
ALTER TABLE "Infraction" ADD CONSTRAINT "Infraction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFilter" ADD CONSTRAINT "WordFilter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
