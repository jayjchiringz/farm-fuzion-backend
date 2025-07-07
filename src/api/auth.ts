import express, {Request, Response} from "express";
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

  router.post(
    "/request-otp",
    express.json(),
    async (req: Request, res: Response) => {
      const {email} = req.body;
      if (!email) {
        res.status(400).json({error: "Email required"});
        return;
      }

      try {
        let userType: "user" | "farmer" | null = null;

        // Try users table first
        const userResult = await pool.query(
          "SELECT email FROM users WHERE email = $1 LIMIT 1",
          [email]
        );

        if ((userResult.rowCount ?? 0) > 0) {
          userType = "user";
        } else {
          // Fallback to farmers
          const farmerResult = await pool.query(
            "SELECT email FROM farmers WHERE email = $1 LIMIT 1",
            [email]
          );
          if ((farmerResult.rowCount ?? 0) > 0) userType = "farmer";
        }

        if (!userType) {
          res.status(404).json({error: "This email is not registered."});
          return;
        }

        const otp = generateOtp(email);
        await sendOtpByEmail(email, otp, {
          MAIL_USER: config.MAIL_USER,
          MAIL_PASS: config.MAIL_PASS,
        });
        res.status(200).json({message: "OTP sent", role: userType});
      } catch (err) {
        console.error("❌ OTP send failed:", err);
        res.status(500).send("Internal Server Error");
      }
    }
  );

  // 2️⃣ Verify OTP
  router.post("/verify-otp", express.json(), async (req, res) => {
    const {email, otp} = req.body;

    if (!email || !otp) {
      res.status(400).json({error: "Email & OTP required"});
      return;
    }

    try {
      const isValid = verifyOtp(email, otp);
      if (!isValid) {
        res.status(401).json({error: "Invalid or expired OTP"});
        return;
      }

      // Try user
      const userResult = await pool.query(
        `SELECT id, email, role, group_id, created_at
         FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
        [email]
      );

      if ((userResult.rowCount ?? 0) > 0) {
        res.status(200).json({
          message: "OTP verified ✅",
          role: "user",
          user: userResult.rows[0],
        });
        return;
      }

      // Try farmer
      const farmerResult = await pool.query(
        `SELECT id, first_name, middle_name, last_name, email, group_id
         FROM farmers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
        [email]
      );

      if ((farmerResult.rowCount ?? 0) > 0) {
        res.status(200).json({
          message: "OTP verified ✅",
          role: "farmer",
          user: farmerResult.rows[0],
        });
        return;
      }

      res.status(403).json({error: "User not found."});
    } catch (err) {
      console.error("❌ OTP Verification Error:", err);
      res.status(500).json({error: "Server error"});
    }
  });

  return router;
};
