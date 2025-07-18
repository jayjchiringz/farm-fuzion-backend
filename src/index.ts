// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";
import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
} from "./registerWithDocs"; // or wherever you defined `defineSecret`

export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  createMainApp({
    PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
  })
);

export {registerWithDocs} from "./registerWithDocs";
export {getRoles} from "./api/getRoles";
