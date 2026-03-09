/* eslint-disable max-len */
// src/utils/fileStorage.ts
import fs from "fs";
import path from "path";
import {v4 as uuidv4} from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/data/uploads";

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, {recursive: true});
  console.log(`📁 Created upload directory: ${UPLOAD_DIR}`);
}

export interface SavedFile {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}

export const saveFile = async (file: Express.Multer.File): Promise<SavedFile> => {
  const fileExtension = path.extname(file.originalname);
  const fileName = `${uuidv4()}${fileExtension}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  // Write file to disk
  await fs.promises.writeFile(filePath, file.buffer);

  console.log(`✅ File saved: ${fileName} (${file.size} bytes)`);

  return {
    fileName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    path: filePath,
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
    console.log(`🗑️ File deleted: ${fileName}`);
  }
};
