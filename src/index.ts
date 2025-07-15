// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";

export const api = onRequest(
  {
    secrets: [
      "PGUSER", "PGPASS", "PGHOST", "PGDB", "PGPORT", "MAIL_USER", "MAIL_PASS",
    ],
    timeoutSeconds: 300,
  },
  createMainApp()
);
