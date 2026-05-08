import { z } from "zod";

export const imageFolderEnum = z.enum([
  "campaigns", "products", "shelters", "stories", "documents", "avatars", "store", "uploads",
]);
