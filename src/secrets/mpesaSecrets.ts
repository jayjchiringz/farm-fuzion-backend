import {
  defineSecret,
} from "firebase-functions/params";

export const MPESA_CONSUMER_KEY = defineSecret("MPESA_CONSUMER_KEY");
export const MPESA_CONSUMER_SECRET = defineSecret("MPESA_CONSUMER_SECRET");
export const MPESA_SHORTCODE = defineSecret("MPESA_SHORTCODE");
export const MPESA_PASSKEY = defineSecret("MPESA_PASSKEY");
export const MPESA_CALLBACK_URL = defineSecret("MPESA_CALLBACK_URL");
