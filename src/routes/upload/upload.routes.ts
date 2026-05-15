import { Hono } from "hono";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  uploadImage,
  uploadImages,
  uploadDocument,
  uploadVideo,
  uploadReceiptPublic,
} from "./upload.handler.js";

const upload = new Hono();

// Dekont upload — misafir kullanıcılar da yükleyebilir (auth gerektirmez)
upload.post("/receipt-public", uploadReceiptPublic);

// Geri kalan endpoint'ler giriş gerektirir
upload.use("*", requireAuth);

upload.post("/image", uploadImage);       // tek resim
upload.post("/images", uploadImages);     // çoklu resim
upload.post("/document", uploadDocument); // PDF belge
upload.post("/video", uploadVideo);       // hikaye videosu

export default upload;