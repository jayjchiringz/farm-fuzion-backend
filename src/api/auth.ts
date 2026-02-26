/* eslint-disable max-len */
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
        // Check users table first (with role information)
        const userResult = await pool.query(
          `SELECT u.id, u.email, u.role_id, r.name as role_name
           FROM users u
           LEFT JOIN user_roles r ON u.role_id = r.id
           WHERE u.email = $1 LIMIT 1`,
          [email]
        );

        if ((userResult.rowCount ?? 0) > 0) {
          const user = userResult.rows[0];
          const otp = generateOtp(email);
          await sendOtpByEmail(email, otp, {
            MAIL_USER: config.MAIL_USER,
            MAIL_PASS: config.MAIL_PASS,
          });

          // Store the actual role name
          res.status(200).json({
            message: "OTP sent",
            role: user.role_name || "user", // Use actual role from database
            userType: "registered",
          });
          return;
        }

        // Check farmers table as fallback (for backward compatibility)
        const farmerResult = await pool.query(
          `SELECT id, email, first_name, last_name 
           FROM farmers WHERE email = $1 LIMIT 1`,
          [email]
        );

        if ((farmerResult.rowCount ?? 0) > 0) {
          const otp = generateOtp(email);
          await sendOtpByEmail(email, otp, {
            MAIL_USER: config.MAIL_USER,
            MAIL_PASS: config.MAIL_PASS,
          });

          res.status(200).json({
            message: "OTP sent",
            role: "farmer", // Farmers are always farmers
            userType: "farmer",
          });
          return;
        }

        // Email not found in either table
        res.status(404).json({error: "This email is not registered."});
        return;
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

      // Try users table first (with full role information)
      const userResult = await pool.query(
        `SELECT 
          u.id,
          u.email,
          u.role_id,
          r.name as role,
          r.description as role_description,
          u.group_id,
          u.created_at,
          COALESCE(f.first_name, '') as first_name,
          COALESCE(f.last_name, '') as last_name,
          COALESCE(f.phone, '') as phone
         FROM users u
         LEFT JOIN user_roles r ON u.role_id = r.id
         LEFT JOIN farmers f ON u.id = f.user_id
         WHERE u.email = $1 LIMIT 1`,
        [email]
      );

      if ((userResult.rowCount ?? 0) > 0) {
        const user = userResult.rows[0];

        // Ensure we have a role
        if (!user.role) {
          console.warn(`User ${email} has no role assigned, defaulting to 'farmer'`);
          user.role = "farmer";
        }

        console.log(`✅ User authenticated: ${email}, role: ${user.role}`);

        res.status(200).json({
          message: "OTP verified ✅",
          user: {
            id: user.id,
            email: user.email,
            role: user.role, // This is the key field for navigation
            role_id: user.role_id,
            role_description: user.role_description,
            first_name: user.first_name,
            last_name: user.last_name,
            group_id: user.group_id,
            phone: user.phone,
          },
        });
        return;
      }

      // Try farmers table as fallback
      const farmerResult = await pool.query(
        `SELECT 
          id,
          first_name,
          middle_name,
          last_name,
          email,
          group_id,
          phone
         FROM farmers 
         WHERE email = $1 LIMIT 1`,
        [email]
      );

      if ((farmerResult.rowCount ?? 0) > 0) {
        const farmer = farmerResult.rows[0];

        res.status(200).json({
          message: "OTP verified ✅",
          user: {
            id: farmer.id,
            email: farmer.email,
            role: "farmer", // Farmers always have farmer role
            first_name: farmer.first_name,
            last_name: farmer.last_name,
            group_id: farmer.group_id,
            phone: farmer.phone,
          },
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
