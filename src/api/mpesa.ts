// functions/src/api/mpesa.ts
import express from "express";
import {initiateMpesaSTK} from "../services/mpesa";

export const getMpesaRouter = () => {
  const router = express.Router();

  router.post("/stk", async (req, res) => {
    try {
      const {phone, amount} = req.body;

      if (!phone || !amount) {
        return res.status(400).json({error: "Phone and amount are required"});
      }

      const result = await initiateMpesaSTK(phone, amount);
      return res.status(200).json(result);
    } catch (err) {
      console.error("❌ MPESA STK Error:", err);
      return res.status(500).json({error: "STK Push Failed"});
    }
  });

  return router;
};
