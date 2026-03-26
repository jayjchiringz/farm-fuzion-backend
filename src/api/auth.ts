/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable max-len */
import express, {Request, Response} from "express";
import {generateOtp, sendOtpByEmail, verifyOtp} from "../services/otp";
import {initDbPool} from "../utils/db";
import dns from "dns";
import {Socket} from "net";
import {promisify} from "util";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const resolve4 = promisify(dns.resolve4);

export const getAuthRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
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

          // Try to send email only if mail is configured
          if (config.MAIL_USER && config.MAIL_PASS) {
            try {
              await sendOtpByEmail(email, otp, {
                MAIL_USER: config.MAIL_USER,
                MAIL_PASS: config.MAIL_PASS,
              });
              console.log(`✅ Email sent to ${email}`);
            } catch (emailError) {
              console.error(`⚠️ Email sending failed but OTP is stored for ${email}:`, emailError);
            }
          } else {
            console.log(`⚠️ Email not configured - OTP ${otp} for ${email} (check logs for testing)`);
          }

          // Always return success (OTP is stored regardless of email success)
          res.status(200).json({
            message: "OTP sent",
            role: user.role_name || "user",
            userType: "registered",
            // Add debug info in development only
            ...(process.env.NODE_ENV !== "production" && {
              debug_otp: otp,
              debug_email_sent: !!(config.MAIL_USER && config.MAIL_PASS),
            }),
          });
          return;
        }

        // Check farmers table as fallback
        const farmerResult = await pool.query(
          `SELECT id, email, first_name, last_name 
           FROM farmers WHERE email = $1 LIMIT 1`,
          [email]
        );

        if ((farmerResult.rowCount ?? 0) > 0) {
          const otp = generateOtp(email);

          // Try to send email only if mail is configured
          if (config.MAIL_USER && config.MAIL_PASS) {
            try {
              await sendOtpByEmail(email, otp, {
                MAIL_USER: config.MAIL_USER,
                MAIL_PASS: config.MAIL_PASS,
              });
              console.log(`✅ Email sent to ${email}`);
            } catch (emailError) {
              console.error(`⚠️ Email sending failed but OTP is stored for ${email}:`, emailError);
            }
          } else {
            console.log(`⚠️ Email not configured - OTP ${otp} for ${email} (check logs for testing)`);
          }

          res.status(200).json({
            message: "OTP sent",
            role: "farmer",
            userType: "farmer",
            ...(process.env.NODE_ENV !== "production" && {
              debug_otp: otp,
              debug_email_sent: !!(config.MAIL_USER && config.MAIL_PASS),
            }),
          });
          return;
        }

        res.status(404).json({error: "This email is not registered."});
      } catch (err) {
        console.error("❌ OTP send failed:", err);
        res.status(500).json({error: "Internal Server Error"});
      }
    }
  );

  // 2️⃣ Verify OTP - UPDATED WITH JWT GENERATION
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
          COALESCE(f.last_name, '') as last_name
         FROM users u
         LEFT JOIN user_roles r ON u.role_id = r.id
         LEFT JOIN farmers f ON u.id = f.user_id
         WHERE u.email = $1 LIMIT 1`,
        [email]
      );

      let userData: any = null;
      let userRole = "farmer"; // Default role

      if ((userResult.rowCount ?? 0) > 0) {
        const user = userResult.rows[0];

        if (!user.role) {
          console.warn(`User ${email} has no role assigned, defaulting to 'farmer'`);
          user.role = "farmer";
        }

        userRole = user.role;
        userData = {
          id: user.id,
          email: user.email,
          role: user.role,
          role_id: user.role_id,
          role_description: user.role_description,
          first_name: user.first_name,
          last_name: user.last_name,
          group_id: user.group_id,
        };

        console.log(`✅ User authenticated: ${email}, role: ${user.role}`);
      } else {
        // Try farmers table as fallback
        const farmerResult = await pool.query(
          `SELECT 
            id,
            first_name,
            middle_name,
            last_name,
            email,
            group_id
           FROM farmers 
           WHERE email = $1 LIMIT 1`,
          [email]
        );

        if ((farmerResult.rowCount ?? 0) > 0) {
          const farmer = farmerResult.rows[0];
          userRole = "farmer";
          userData = {
            id: farmer.id,
            email: farmer.email,
            role: "farmer",
            first_name: farmer.first_name,
            last_name: farmer.last_name,
            middle_name: farmer.middle_name,
            group_id: farmer.group_id,
          };
        } else {
          res.status(403).json({error: "User not found."});
          return;
        }
      }

      // ============================================
      // GENERATE JWT TOKEN
      // ============================================
      const JWT_SECRET = process.env.JWT_SECRET;

      if (!JWT_SECRET) {
        console.error("❌ JWT_SECRET is not configured in environment variables!");
        res.status(500).json({error: "Server configuration error"});
        return;
      }

      // Create JWT payload
      const jwtPayload = {
        user_id: userData.id,
        email: userData.email,
        username: userData.email.split("@")[0],
        first_name: userData.first_name || "",
        last_name: userData.last_name || "",
        roles: [userData.role], // Convert to array for PostXpress compatibility
        // Optional: Add audience for PostXpress
        aud: "postxpress",
        // Issued at and expiration
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      };

      // Generate the token
      const token = jwt.sign(jwtPayload, JWT_SECRET, {
        algorithm: "HS256",
      });

      console.log(`✅ JWT generated for user: ${email}, expires in 7 days`);

      // Return user data WITH token
      res.status(200).json({
        message: "OTP verified ✅",
        token: token, // This is what your frontend stores!
        user: userData,
      });
    } catch (err) {
      console.error("❌ OTP Verification Error:", err);
      res.status(500).json({error: "Server error"});
    }
  });

  // 🔍 Diagnostic endpoint to test email connectivity
  router.get("/diagnose-email", async (req: Request, res: Response) => {
    // Define interfaces for the diagnostic results
    interface DnsResult {
      success: boolean;
      addresses?: string[];
      message?: string;
      error?: string;
    }

    interface PortTestResult {
      port: number;
      reachable: boolean;
      error?: string;
    }

    interface PortResults {
      25: PortTestResult;
      465: PortTestResult;
      587: PortTestResult;
      2525: PortTestResult;
    }

    interface SmtpResult {
      success: boolean;
      message: string;
      port?: number;
      error?: string;
      code?: string;
      alternatePort?: SmtpResult;
    }

    interface DiagnosticResult {
      timestamp: string;
      config: {
        mail_user: string;
        mail_pass: string;
        node_env: string | undefined;
      };
      dns: DnsResult;
      ports: Partial<PortResults>;
      smtp: SmtpResult | {};
    }

    const results: DiagnosticResult = {
      timestamp: new Date().toISOString(),
      config: {
        mail_user: config.MAIL_USER ? "✅ Set" : "❌ Missing",
        mail_pass: config.MAIL_PASS ? "✅ Set" : "❌ Missing",
        node_env: process.env.NODE_ENV,
      },
      dns: {success: false},
      ports: {},
      smtp: {},
    };

    // Test DNS resolution
    try {
      const addresses = await resolve4("smtp-relay.brevo.com");
      results.dns = {
        success: true,
        addresses,
        message: `Resolved to ${addresses.join(", ")}`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      results.dns = {
        success: false,
        error: err.message,
      };
    }

    // Test port connectivity if DNS succeeded
    if (results.dns.success && results.dns.addresses && results.dns.addresses.length > 0) {
      const testPort = (port: number): Promise<PortTestResult> => {
        return new Promise((resolve) => {
          const socket = new Socket();
          const timeout = setTimeout(() => {
            socket.destroy();
            resolve({port, reachable: false, error: "Connection timeout"});
          }, 5000);

          // Safe to use [0] because we've checked addresses exists and has length
          const targetAddress = results.dns.addresses![0];

          socket.connect(port, targetAddress, () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve({port, reachable: true});
          });

          socket.on("error", (err: Error) => {
            clearTimeout(timeout);
            socket.destroy();
            resolve({port, reachable: false, error: err.message});
          });
        });
      };

      // Test common SMTP ports
      results.ports = {
        25: await testPort(25),
        465: await testPort(465),
        587: await testPort(587),
        2525: await testPort(2525),
      };
    }

    // Test SMTP authentication if mail is configured
    if (config.MAIL_USER && config.MAIL_PASS) {
      try {
        const nodemailer = require("nodemailer");
        const testTransporter = nodemailer.createTransport({
          host: "smtp-relay.brevo.com",
          port: 587,
          secure: false,
          auth: {
            user: config.MAIL_USER,
            pass: config.MAIL_PASS,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
        });

        await testTransporter.verify();
        results.smtp = {
          success: true,
          message: "SMTP authentication successful on port 587",
          port: 587,
        };
      } catch (error: unknown) {
        const err = error as Error & { code?: string };
        results.smtp = {
          success: false,
          message: "SMTP authentication failed",
          error: err.message,
          code: err.code,
        };

        // Also test port 2525 if 587 fails
        try {
          const testTransporter2525 = nodemailer.createTransport({
            host: "smtp-relay.brevo.com",
            port: 2525,
            secure: false,
            auth: {
              user: config.MAIL_USER,
              pass: config.MAIL_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
          });
          await testTransporter2525.verify();
          (results.smtp as SmtpResult).alternatePort = {
            success: true,
            message: "SMTP authentication successful on port 2525",
            port: 2525,
          };
        } catch (error2525: unknown) {
          const err2525 = error2525 as Error & { code?: string };
          (results.smtp as SmtpResult).alternatePort = {
            success: false,
            message: "SMTP authentication failed on port 2525",
            error: err2525.message,
            code: err2525.code,
          };
        }
      }
    }

    res.json(results);
  });

  return router;
};
