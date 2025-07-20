/* eslint-disable require-jsdoc */
// functions/src/services/mpesa.ts
import axios from "axios";
import {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
} from "../secrets/mpesaSecrets";

export async function getMpesaAccessToken(): Promise<string> {
  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      auth: {
        username: MPESA_CONSUMER_KEY.value(),
        password: MPESA_CONSUMER_SECRET.value(),
      },
    }
  );
  return res.data.access_token;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith("+254")) return phone.substring(1);
  if (phone.startsWith("0")) return "254" + phone.substring(1);
  if (!phone.startsWith("254")) return "254" + phone;
  return phone;
}

export async function initiateMpesaSTK(phone: string, amount: number) {
  const token = await getMpesaAccessToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .substring(0, 14);

  // ✅ Declare values BEFORE usage
  const shortcode = MPESA_SHORTCODE.value();
  const passkey = MPESA_PASSKEY.value();
  const callbackUrl = MPESA_CALLBACK_URL.value();

  const password = Buffer.from(
    `${shortcode}${passkey}${timestamp}`
  ).toString("base64");

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: formatPhone(phone),
    PartyB: shortcode,
    PhoneNumber: formatPhone(phone),
    CallBackURL: callbackUrl,
    AccountReference: "FarmFuzion",
    TransactionDesc: "Wallet Top-Up",
  };

  const response = await axios.post(
    "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    payload,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}
