// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";

// 🔐 Shared secrets
import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
} from "./registerWithDocs";
// MPESA-only secrets
import {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
} from "./secrets/mpesaSecrets";

// 🌐 Main aggregated Express app
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

// 🔥 Individually exported Cloud Functions
export {registerWithDocs} from "./registerWithDocs";
export {getRoles} from "./api/getRoles";
export {updateRole} from "./api/updateRole";
export {deleteRole} from "./api/deleteRole";
export {createRole} from "./api/createRole";
