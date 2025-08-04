/* eslint-disable @typescript-eslint/no-explicit-any */
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {MsimboService} from "../../services/MsimboService";
import {ProviderDef} from "../../services/msimboClient/api";

const msimbo = new MsimboService();

export const topupMpesa = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send({error: "Method not allowed"});
    return;
  }

  const {phone, amount} = req.body;

  if (!phone || !amount) {
    res.status(400).send({error: "Phone and amount are required"});
    return;
  }

  try {
    const orderId = `order_${Date.now()}`;
    const response = await msimbo.c2bPayment({
      customer_id: phone,
      order_id: orderId,
      amount: Number(amount).toFixed(2),
      currency: "KES",
      country: "KE",
      provider_id: ProviderDef.NUMBER_14,
    });

    logger.info("Msimbo C2B top-up response", response);

    res.status(200).send(response);
  } catch (error: any) {
    logger.error("Msimbo top-up failed", error);
    res.status(500).send({
      error: "Top-up failed",
      details: error?.response?.data || error.message,
    });
  }
});
