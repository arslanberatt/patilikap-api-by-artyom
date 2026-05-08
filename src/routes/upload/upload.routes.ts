import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  uploadImage,
  uploadImages,
  uploadDocument,
  uploadVideo,
} from "./upload.handler.js";

const upload = new Hono();

// Tüm upload endpoint'leri giriş gerektirir
upload.use("*", requireAuth);

upload.post("/image", uploadImage);       // tek resim
upload.post("/images", uploadImages);     // çoklu resim
upload.post("/document", uploadDocument); // PDF belge
upload.post("/video", uploadVideo);       // hikaye videosu

export default upload;