/* eslint-disable max-len */
// src/services/email.nodemailer.ts
import nodemailer from "nodemailer";

// Define error interface
interface NodemailerError extends Error {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
}

export const sendOtpByEmail = async (
  email: string,
  otp: string,
  config: { MAIL_USER: string; MAIL_PASS: string }
) => {
  const {MAIL_USER, MAIL_PASS} = config;

  if (!MAIL_USER || !MAIL_PASS) {
    throw new Error("❌ MAIL_USER or MAIL_PASS missing from config");
  }

  console.log(`📧 Attempting to send OTP to ${email} using Brevo...`);

  // Create transporter with Brevo SMTP settings (port 2525 for Render compatibility)
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false, // false for port 2525
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 15000,
    socketTimeout: 20000,
    // Add TLS options for better compatibility
    tls: {
      rejectUnauthorized: false,
    },
    // Enable debug in development only
    ...(process.env.NODE_ENV === "development" && {
      debug: true,
      logger: true,
    }),
  });

  const mailOptions = {
    from: `"FarmFuzion" <${MAIL_USER}>`,
    to: email,
    subject: "Your FarmFuzion OTP Code",
    // Add plain text version for better deliverability
    text: `Your FarmFuzion OTP is: ${otp}. This code is valid for 5 minutes. Do not share this code with anyone.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>FarmFuzion OTP</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: #8dc71d; padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🌱 FarmFuzion</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9;">Sustained Agri-Business</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Hello 👨‍🌾,</p>
            
            <p style="font-size: 16px; color: #333; margin-bottom: 15px;">Your One-Time Password (OTP) for login is:</p>
            
            <div style="background-color: #f8f9fa; padding: 25px; text-align: center; border-radius: 8px; margin: 25px 0; border: 2px dashed #8dc71d;">
              <h2 style="font-size: 48px; letter-spacing: 8px; margin: 0; color: #333; font-weight: bold;">${otp}</h2>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <p style="font-size: 14px; color: #856404; margin: 0;">
                <strong>⏰ Valid for 5 minutes only</strong><br>
                🔒 Never share this code with anyone
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
              If you didn't request this OTP, please ignore this email.<br>
              &copy; ${new Date().getFullYear()} FarmFuzion. All rights reserved.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="font-size: 12px; color: #999; margin: 0;">
              FarmFuzion - Sustained Agri-Business
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    // Add headers to improve deliverability
    headers: {
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
      "Importance": "high",
    },
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ OTP Email Sent Successfully via Brevo:", {
      messageId: info.messageId,
      response: info.response,
      to: email,
      accepted: info.accepted,
    });
    return info;
  } catch (error: unknown) {
    const isNodemailerError = (err: unknown): err is NodemailerError => {
      return err instanceof Error && ("code" in err || "command" in err);
    };

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorCode = isNodemailerError(error) ? error.code : undefined;
    const errorCommand = isNodemailerError(error) ? error.command : undefined;

    console.error("❌ Failed to send OTP email via Brevo:", {
      error: errorMessage,
      code: errorCode,
      command: errorCommand,
      to: email,
    });

    // Provide specific error messages
    if (errorCode === "ETIMEDOUT") {
      throw new Error("Email service timeout - please try again");
    } else if (errorCode === "EAUTH") {
      throw new Error("Email authentication failed - check credentials");
    } else if (errorCode === "ESOCKET") {
      throw new Error("Network error - unable to connect to email server");
    } else if (errorCode === "ECONNREFUSED") {
      throw new Error("Connection refused - email server may be blocking the request");
    } else {
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
};