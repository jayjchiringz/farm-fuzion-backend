// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";

// 🔐 Shared secrets
import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
  MSIMBO_MERCHANT_ID, MSIMBO_SECRET_KEY, MSIMBO_PUBLIC_ID,
} from "./registerWithDocs";

// 🌐 Main aggregated Express app
export const api = onRequest(
  {
    secrets: [
      PGUSER, PGPASS, PGHOST, PGDB, PGPORT,
      MAIL_USER, MAIL_PASS,
      MSIMBO_MERCHANT_ID, MSIMBO_SECRET_KEY, MSIMBO_PUBLIC_ID, // 👈 add these
    ],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  createMainApp({
    PGUSER, PGPASS, PGHOST, PGDB, PGPORT,
    MAIL_USER, MAIL_PASS,
    MSIMBO_MERCHANT_ID, MSIMBO_SECRET_KEY, MSIMBO_PUBLIC_ID,
  })
);

// 🔥 Individually exported Cloud Functions
export {registerWithDocs} from "./registerWithDocs";
export {getRoles} from "./api/getRoles";
export {updateRole} from "./api/updateRole";
export {deleteRole} from "./api/deleteRole";
export {createRole} from "./api/createRole";
// export {topupAirtel} from "./api/topup/airtel";
