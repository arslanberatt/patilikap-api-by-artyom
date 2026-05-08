import { z } from "zod";

export const getPaytrTokenBody = z.object({
  orderNumber: z.string().min(1),
  email:       z.string().email(),
  amount:      z.number().int().min(1),
  userName:    z.string().min(1).max(100),
  userPhone:   z.string().min(7).max(20),
  userAddress: z.string().min(1).max(300),
  userCity:    z.string().min(1).max(60),
  userIp:      z.string().min(1),
  basketItems: z.array(z.tuple([z.string(), z.string(), z.number()])),
});

export const paytrRefundBody = z.object({
  orderId:   z.string().min(1),
  orderType: z.enum(["donation", "store"]),
});
