// src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {createMainApp} from "./main";

// 🔐 Shared secrets
import {
  PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
} from "./registerWithDocs";

// ✅ DEFERRED Express app
export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    const app = createMainApp({
      PGUSER,
      PGPASS,
      PGHOST,
      PGDB,
      PGPORT,
      MAIL_USER,
      MAIL_PASS,
    });

    return app(req, res);
  }
);

// 🔥 Individual Cloud Functions
export {registerWithDocs} from "./registerWithDocs";
export {getRoles} from "./api/getRoles";
export {updateRole} from "./api/updateRole";
export {deleteRole} from "./api/deleteRole";
export {createRole} from "./api/createRole";
