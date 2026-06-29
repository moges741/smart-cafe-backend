/*
  Warnings:

  - The values [card,mobile_money] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `gatewayRef` on the `Payment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[txRef]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('chapa', 'cash');
ALTER TABLE "Payment" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "gatewayRef",
ADD COLUMN     "chapaPaymentMethod" TEXT,
ADD COLUMN     "chapaRef" TEXT,
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "txRef" TEXT,
ALTER COLUMN "method" SET DEFAULT 'chapa';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txRef_key" ON "Payment"("txRef");

-- CreateIndex
CREATE INDEX "Payment_txRef_idx" ON "Payment"("txRef");
