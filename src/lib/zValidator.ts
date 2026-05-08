import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

type Target = "json" | "query" | "param" | "header" | "form" | "cookie";

export function zv<T extends ZodType>(target: Target, schema: T) {
  return honoZValidator(target as any, schema, (result) => {
    if (!result.success) throw result.error;
  });
}
