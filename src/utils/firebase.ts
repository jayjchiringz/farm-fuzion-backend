// functions/src/utils/firebase.ts
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const storage = admin.storage();
