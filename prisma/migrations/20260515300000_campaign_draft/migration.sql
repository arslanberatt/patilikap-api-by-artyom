-- Add DRAFT status to CampaignStatus enum
DO $$ BEGIN
  ALTER TYPE "CampaignStatus" ADD VALUE 'DRAFT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
