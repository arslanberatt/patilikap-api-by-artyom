-- Add PENDING_PAYMENT status to PaymentStatus enum
-- PAYTR siparişlerinde callback gelmeden önce kullanılır; admin listesinde gizlenir
DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_PAYMENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
