-- CreateIndex
CREATE INDEX "Order_cancelRequest_createdAt_idx" ON "Order"("cancelRequest", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE INDEX "StoreOrder_cancelRequest_createdAt_idx" ON "StoreOrder"("cancelRequest", "createdAt");

-- CreateIndex
CREATE INDEX "StoreOrder_paymentMethod_idx" ON "StoreOrder"("paymentMethod");
