/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// functions/src/api/otp.ts
import express from "express";

export const getOtpRouter = (dbConfig: any) => {
  const router = express.Router();

  router.post("/request", async (req, res) => {
    try {
      const {phone} = req.body;

      if (!phone) {
        return res.status(400).json({error: "Phone number is required"});
      }

      // Stub logic: send OTP (fake)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      console.log(`🔐 OTP for ${phone}: ${otp} (simulated)`);

      return res.status(200).json({success: true, otp});
    } catch (err) {
      console.error("❌ OTP request error:", err);
      return res.status(500).json({error: "Failed to request OTP"});
    }
  });

  return router;
};
