// src/api/files.ts
import express from "express";
import path from "path";
import {fileExists, getFile} from "../utils/fileStorage";

export const getFilesRouter = () => {
  const router = express.Router();

  // Serve files
  router.get("/:fileName", async (req, res) => {
    try {
      const {fileName} = req.params;

      // Security: Prevent directory traversal attacks
      const sanitizedFileName = path.basename(fileName);

      if (!fileExists(sanitizedFileName)) {
        return res.status(404).json({error: "File not found"});
      }

      const filePath = getFile(sanitizedFileName);
      return res.sendFile(filePath);
    } catch (err) {
      console.error("❌ Error serving file:", err);
      return res.status(500).json({error: "Failed to serve file"});
    }
  });

  return router;
};
