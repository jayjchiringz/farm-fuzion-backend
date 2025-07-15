/* eslint-disable @typescript-eslint/no-unused-vars */
import {onRequest} from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";
import multer from "multer";
import os from "os";
// import path from "path";
// import {storage} from "./utils/firebase";
// import {initDbPool} from "./utils/db";

// ⚙️ Setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, os.tmpdir()),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: {fileSize: 10 * 1024 * 1024},
});

const app = express();
app.use(cors({origin: true}));
app.post("/", upload.any(), async (req, res) => {
  // your existing logic from groups.ts here...
});

export const registerWithDocs = onRequest(app);
