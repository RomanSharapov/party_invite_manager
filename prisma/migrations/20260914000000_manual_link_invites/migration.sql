CREATE TYPE "InviteDeliveryMethod" AS ENUM ('email', 'manual_link');
ALTER TABLE "Invitee"
  ALTER COLUMN "guardianEmail" DROP NOT NULL,
  ADD COLUMN "deliveryMethod" "InviteDeliveryMethod" NOT NULL DEFAULT 'email',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "linkSharedAt" TIMESTAMP(3);
