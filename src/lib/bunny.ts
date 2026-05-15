import sharp from "sharp";

export type ImageFolder =
    | "campaigns"   // kampanya kapak resimleri
    | "products"    // ürün resimleri
    | "shelters"    // barınak resimleri
    | "stories"     // hikaye medyaları
    | "documents"   // barınak belgeleri (PDF)
    | "avatars"     // kullanıcı profil fotoğrafları
    | "store"       // mağaza ürün resimleri
    | "categories"; // kategori görselleri

interface UploadResult {
    success: boolean;
    url?: string;
    error?: string;
}

interface MultiUploadResult {
    success: boolean;
    urls?: string[];
    errors?: string[];
}


function getEnv() {
    const storageZoneName = process.env.BUNNY_STORAGE_ZONE_NAME;
    const storageZonePassword = process.env.BUNNY_STORAGE_ZONE_PASSWORD;
    const cdnUrl = process.env.BUNNY_CDN_URL;

    if (!storageZoneName || !storageZonePassword || !cdnUrl) {
        throw new Error("Bunny CDN environment variables eksik");
    }

    return { storageZoneName, storageZonePassword, cdnUrl };
}

function generateFileName(ext: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${random}-${timestamp}.${ext}`;
}


async function optimizeBuffer(
    buffer: Buffer,
    mimeType: string
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
    // PDF, video, DOC/DOCX — olduğu gibi bırak
    if (mimeType === "application/pdf" || mimeType.startsWith("video/")
        || mimeType === "application/msword"
        || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const extMap: Record<string, string> = {
            "application/pdf": "pdf",
            "application/msword": "doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        };
        const ext = extMap[mimeType] ?? mimeType.split("/")[1];
        return { buffer, ext, contentType: mimeType };
    }

    // Tüm resimler → WebP
    // quality: 85 → görsel kalite korunur, boyut %30-50 küçülür
    const optimized = await sharp(buffer)
        .webp({ quality: 85, effort: 4 })
        .toBuffer();

    return {
        buffer: optimized,
        ext: "webp",
        contentType: "image/webp",
    };
}

export async function uploadFile(
    buffer: Buffer,
    mimeType: string,
    folder: ImageFolder
): Promise<UploadResult> {
    try {
        const { storageZoneName, storageZonePassword, cdnUrl } = getEnv();

        const { buffer: optimized, ext, contentType } = await optimizeBuffer(buffer, mimeType);

        const fileName = generateFileName(ext);
        const filePath = `${folder}/${fileName}`;
        const uploadUrl = `https://storage.bunnycdn.com/${storageZoneName}/${filePath}`;

        const response = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                AccessKey: storageZonePassword,
                "Content-Type": contentType,
            },
            body: new Uint8Array(optimized),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Bunny upload hatası: ${response.status} - ${errorText}`);
        }

        return {
            success: true,
            url: `${cdnUrl}/${filePath}`,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Bilinmeyen hata",
        };
    }
}

export async function uploadMultipleFiles(
    files: { buffer: Buffer; mimeType: string }[],
    folder: ImageFolder
): Promise<MultiUploadResult> {
    const results = await Promise.allSettled(
        files.map((f) => uploadFile(f.buffer, f.mimeType, folder))
    );

    const urls: string[] = [];
    const errors: string[] = [];

    results.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value.success && result.value.url) {
            urls.push(result.value.url);
        } else {
            const error =
                result.status === "rejected"
                    ? result.reason
                    : result.value?.error || "Bilinmeyen hata";
            errors.push(`Dosya ${i + 1}: ${error}`);
        }
    });

    return {
        success: errors.length === 0,
        urls: urls.length > 0 ? urls : undefined,
        errors: errors.length > 0 ? errors : undefined,
    };
}

export async function deleteFile(
    fileUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { storageZoneName, storageZonePassword, cdnUrl } = getEnv();

        if (!fileUrl.startsWith(cdnUrl)) {
            throw new Error("Geçersiz CDN URL");
        }

        const filePath = fileUrl.replace(cdnUrl, "").replace(/^\//, "");
        const deleteUrl = `https://storage.bunnycdn.com/${storageZoneName}/${filePath}`;

        const response = await fetch(deleteUrl, {
            method: "DELETE",
            headers: { AccessKey: storageZonePassword },
        });

        if (!response.ok && response.status !== 404) {
            throw new Error(`Bunny delete hatası: ${response.status}`);
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Bilinmeyen hata",
        };
    }
}

export async function deleteMultipleFiles(
    fileUrls: string[]
): Promise<{ success: boolean; deleted: number; errors?: string[] }> {
    const results = await Promise.allSettled(fileUrls.map(deleteFile));

    let deleted = 0;
    const errors: string[] = [];

    results.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value.success) {
            deleted++;
        } else {
            const error =
                result.status === "rejected" ? result.reason : result.value.error;
            errors.push(`${fileUrls[i]}: ${error}`);
        }
    });

    return {
        success: errors.length === 0,
        deleted,
        errors: errors.length > 0 ? errors : undefined,
    };
}


const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
];
const ALLOWED_DOC_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/jpg",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export function validateImage(
    mimeType: string,
    sizeBytes: number
): { valid: boolean; error?: string } {
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        return { valid: false, error: "Sadece JPEG, PNG, WebP veya AVIF yükleyebilirsiniz" };
    }
    if (sizeBytes > 10 * 1024 * 1024) {
        return { valid: false, error: "Resim 10MB'dan büyük olamaz" };
    }
    return { valid: true };
}

export function validateDocument(
    mimeType: string,
    sizeBytes: number
): { valid: boolean; error?: string } {
    if (!ALLOWED_DOC_TYPES.includes(mimeType)) {
        return { valid: false, error: "Sadece PDF, DOC, DOCX, JPEG veya PNG yükleyebilirsiniz" };
    }
    if (sizeBytes > 5 * 1024 * 1024) {
        return { valid: false, error: "Belge 5MB'dan büyük olamaz" };
    }
    return { valid: true };
}

export function validateVideo(
    mimeType: string,
    sizeBytes: number
): { valid: boolean; error?: string } {
    if (!ALLOWED_VIDEO_TYPES.includes(mimeType)) {
        return { valid: false, error: "Sadece MP4 veya MOV yükleyebilirsiniz" };
    }
    if (sizeBytes > 100 * 1024 * 1024) {
        return { valid: false, error: "Video 100MB'dan büyük olamaz" };
    }
    return { valid: true };
}