/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Configuration,
  OnlinePaymentsApi,
  PaymentBody,
  PaymentBodyB2c,
  StatusBody,
} from "./msimboClient";
import axios from "axios";
import {generateSignature} from "../utils/generateSignature";

// Attach secrets to function runtime (important for Firebase deploy)
export const msimboSecrets = [
  "MSIMBO_MERCHANT_ID",
  "MSIMBO_SECRET_KEY",
  "MSIMBO_PUBLIC_ID",
] as const;

const client = new OnlinePaymentsApi(
  new Configuration({
    basePath: "https://api.msimbo.tech",
  }),
  undefined,
  axios
);

export class MsimboService {
  private merchantId = process.env.MSIMBO_MERCHANT_ID!;
  private secretKey = process.env.MSIMBO_SECRET_KEY!;
  private publicId = process.env.MSIMBO_PUBLIC_ID!;

  private sign<T extends Record<string, any>>(data: T): T {
    const signed = {
      ...data,
      merchant_id: this.merchantId,
    };
    const signature = generateSignature(signed, this.secretKey);
    return {...signed, signature};
  }

  async c2bPayment(params: Omit<PaymentBody, "merchant_id" | "signature">) {
    const body = this.sign(params);
    const {data} = await client.public_idPaymentC2bPost(this.publicId, body);
    return data;
  }

  async b2cPayment(params: Omit<PaymentBodyB2c, "merchant_id" | "signature">) {
    const body = this.sign(params);
    const {data} = await client.public_idPaymentB2cPost(this.publicId, body);
    return data;
  }

  async getStatus(params: Omit<StatusBody, "merchant_id" | "signature">) {
    const body = this.sign(params);
    const {data} = await client.public_idStatusPost(this.publicId, body);
    return data;
  }
}
