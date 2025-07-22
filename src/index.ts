// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";

import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
} from "./registerWithDocs";

let app: ReturnType<typeof createMainApp> | null = null;

// Boot app once
const bootApp = async () => {
  if (!app) {
    app = createMainApp({
      PGUSER,
      PGPASS,
      PGHOST,
      PGDB,
      PGPORT,
      MAIL_USER,
      MAIL_PASS,
    });
  }
};

export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    await bootApp(); // wait for app to be ready
    return app?.(req, res); // safely use app
  }
);
