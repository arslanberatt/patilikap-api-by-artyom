import type { Context } from "hono";
import { uploadFile, uploadMultipleFiles, validateImage, validateDocument, validateVideo } from "../../lib/bunny.js";
import { errors } from "../../lib/errors.js";
import type { ImageFolder } from "../../lib/bunny.js";


export async function uploadImage(c: Context) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as ImageFolder) || "uploads";

    if (!file) return c.json(errors.BAD_REQUEST, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const check = validateImage(file.type, buffer.length);
    if (!check.valid) return c.json({ error: check.error }, 400);

    const result = await uploadFile(buffer, file.type, folder);
    if (!result.success) return c.json(errors.SERVER_ERROR, 500);

    return c.json({ url: result.url }, 201);
}


export async function uploadImages(c: Context) {
    const formData = await c.req.formData();
    const files = formData.getAll("files") as File[];
    const folder = (formData.get("folder") as ImageFolder) || "uploads";

    if (!files || files.length === 0) return c.json(errors.BAD_REQUEST, 400);
    if (files.length > 10) return c.json({ error: "En fazla 10 dosya yükleyebilirsiniz" }, 400);

    const validated: { buffer: Buffer; mimeType: string }[] = [];
    for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const check = validateImage(file.type, buffer.length);
        if (!check.valid) return c.json({ error: check.error }, 400);
        validated.push({ buffer, mimeType: file.type });
    }

    const result = await uploadMultipleFiles(validated, folder);
    if (!result.success && !result.urls) return c.json(errors.SERVER_ERROR, 500);

    return c.json({ urls: result.urls, errors: result.errors }, 201);
}


export async function uploadDocument(c: Context) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json(errors.BAD_REQUEST, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const check = validateDocument(file.type, buffer.length);
    if (!check.valid) return c.json({ error: check.error }, 400);

    const result = await uploadFile(buffer, file.type, "documents");
    if (!result.success) return c.json(errors.SERVER_ERROR, 500);

    return c.json({ url: result.url }, 201);
}


export async function uploadReceiptPublic(c: Context) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json(errors.BAD_REQUEST, 400);

    const buffer = Buffer.from(await file.arrayBuffer());

    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) return c.json({ error: "Sadece resim veya PDF yükleyebilirsiniz" }, 400);
    if (buffer.length > 10 * 1024 * 1024) return c.json({ error: "Dosya 10MB'dan küçük olmalıdır" }, 400);

    const result = await uploadFile(buffer, file.type, "receipts" as ImageFolder);
    if (!result.success) return c.json(errors.SERVER_ERROR, 500);

    return c.json({ url: result.url }, 201);
}

export async function uploadVideo(c: Context) {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json(errors.BAD_REQUEST, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const check = validateVideo(file.type, buffer.length);
    if (!check.valid) return c.json({ error: check.error }, 400);

    const result = await uploadFile(buffer, file.type, "stories");
    if (!result.success) return c.json(errors.SERVER_ERROR, 500);

    return c.json({ url: result.url }, 201);
}