import express from "express";
import {generateOtp, sendOtpByEmail, verifyOtp} from "../services/otp";
import {initDbPool} from "../utils/db";

export const getAuthRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER: string;
  MAIL_PASS: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // 1️⃣ Request OTP
  router.post("/request-otp", async (req, res) => {
    try {
      const {email} = req.body;

      if (!email) {
        res.status(400).json({error: "Email required"});
        return;
      }

      const result = await pool.query(
        "SELECT 1 FROM farmers WHERE email = $1 LIMIT 1",
        [email]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          error: "This email is not registered as a farmer.",
        });
        return;
      }

      const otp = generateOtp(email);
      await sendOtpByEmail(email, otp, {
        MAIL_USER: config.MAIL_USER,
        MAIL_PASS: config.MAIL_PASS,
      });

      res.status(200).send("OTP sent");
    } catch (err) {
      console.error("❌ OTP send failed:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // 2️⃣ Verify OTP
  router.post(
    "/verify-otp",
    async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const {email, otp} = req.body;

        if (!email || !otp) {
          res.status(400).json({error: "Email & OTP required"});
          return;
        }

        const farmerResult = await pool.query(
          `SELECT id, first_name, middle_name, last_name, email
           FROM farmers
           WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
           LIMIT 1`,
          [email]
        );

        if (farmerResult.rowCount === 0) {
          res.status(403).json({error: "Farmer not registered."});
          return;
        }

        const valid = verifyOtp(email, otp);
        if (!valid) {
          res.status(401).json({error: "Invalid or expired OTP"});
          return;
        }

        res.status(200).json({
          message: "OTP verified ✅",
          farmer: farmerResult.rows[0],
        });
      } catch (err) {
        console.error("❌ OTP Verification Error:", err);
        res.status(500).json({error: "Server error"});
      }
    }
  );

  return router;
};
