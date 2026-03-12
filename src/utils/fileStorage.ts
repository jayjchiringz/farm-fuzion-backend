/* eslint-disable max-len */
// src/utils/fileStorage.ts
import fs from "fs";
import path from "path";
import {v4 as uuidv4} from "uuid";

// Primary upload directory (Render disk)
const RENDER_DISK_DIR = process.env.UPLOAD_DIR || "/var/data/uploads";
// Fallback directory for POC (local to project)
const POC_UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Determine which directory to use
let UPLOAD_DIR: string;
let storageType: "render-disk" | "poc-local";

try {
  // Try to create the Render disk directory
  fs.mkdirSync(RENDER_DISK_DIR, {recursive: true});
  UPLOAD_DIR = RENDER_DISK_DIR;
  storageType = "render-disk";
  console.log(`📁 Using Render disk at: ${UPLOAD_DIR}`);
} catch (error) {
  // Fallback to local POC directory
  fs.mkdirSync(POC_UPLOAD_DIR, {recursive: true});
  UPLOAD_DIR = POC_UPLOAD_DIR;
  storageType = "poc-local";

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ⚠️ POC MODE: Using local filesystem storage              ║
║  📁 Files stored in: ${POC_UPLOAD_DIR}                    ║
║                                                            ║
║  ⚠️ These files will NOT persist across deploys!          ║
║  ⚠️ For production, use Render Disk or cloud storage      ║
║                                                            ║
║  Current Storage: Local (POC)                              ║
╚════════════════════════════════════════════════════════════╝
  `);
}

export interface SavedFile {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  storageType: "render-disk" | "poc-local";
}

export const saveFile = async (file: Express.Multer.File): Promise<SavedFile> => {
  const fileExtension = path.extname(file.originalname);
  const fileName = `${uuidv4()}${fileExtension}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  // Write file to disk
  await fs.promises.writeFile(filePath, file.buffer);

  console.log(`✅ File saved: ${fileName} (${file.size} bytes) to ${storageType} storage`);

  return {
    fileName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    path: filePath,
    storageType,
  };
};

export const getFile = (fileName: string): string => {
  return path.join(UPLOAD_DIR, fileName);
};

export const fileExists = (fileName: string): boolean => {
  return fs.existsSync(path.join(UPLOAD_DIR, fileName));
};

export const deleteFile = async (fileName: string): Promise<void> => {
  const filePath = path.join(UPLOAD_DIR, fileName);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    console.log(`🗑️ File deleted: ${fileName} from ${storageType} storage`);
  }
};

// Optional: Add a cleanup function for POC mode
export const getStorageInfo = () => ({
  type: storageType,
  path: UPLOAD_DIR,
  isPersistent: storageType === "render-disk",
});
