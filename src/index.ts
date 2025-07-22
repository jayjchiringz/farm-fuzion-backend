// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {initMainApp} from "./main";
import express from "express";

import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
} from "./registerWithDocs";

let app: express.Express | null = null;

export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    if (!app) {
      app = await initMainApp({
        PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
      });
    }
    app(req, res);
  }
);

// COMMENT OUT other exports TEMPORARILY until api() works
/*
export { registerWithDocs } from "./registerWithDocs";
export { getRoles } from "./api/getRoles";
export { updateRole } from "./api/updateRole";
export { deleteRole } from "./api/deleteRole";
export { createRole } from "./api/createRole";
*/
