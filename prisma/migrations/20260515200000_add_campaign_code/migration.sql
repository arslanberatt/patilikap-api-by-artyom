-- CreateTable: CampaignCode
CREATE TABLE IF NOT EXISTS "CampaignCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignCode_code_key" ON "CampaignCode"("code");
CREATE INDEX IF NOT EXISTS "CampaignCode_code_isActive_idx" ON "CampaignCode"("code", "isActive");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CampaignCode" ADD CONSTRAINT "CampaignCode_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Order: add campaignCodeId column
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "campaignCodeId" TEXT;

-- AddForeignKey Order -> CampaignCode
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_campaignCodeId_fkey"
    FOREIGN KEY ("campaignCodeId") REFERENCES "CampaignCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
