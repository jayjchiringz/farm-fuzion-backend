// src/services/otp.ts
import {sendOtpByEmail as sendBrevoOtp} from "./email.nodemailer";

// Re-export the email function (this is what auth.ts imports)
export const sendOtpByEmail = sendBrevoOtp;

// In-memory OTP storage (consider Redis for production)
const otpMap: Record<string, { otp: string; expires: number }> = {};

export const generateOtp = (email: string): string => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  otpMap[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
  console.log(`✅ OTP stored for ${email}: ${otp}`);
  return otp;
};

export const verifyOtp = (email: string, otp: string): boolean => {
  const record = otpMap[email];
  if (!record) {
    console.warn(`❌ No OTP found for ${email}`);
    return false;
  }

  const isExpired = record.expires < Date.now();
  const isMatch = record.otp === otp;

  console.log(`🔍 Verifying OTP:
    Email: ${email}
    Entered: ${otp}
    Stored: ${record.otp}
    Expired: ${isExpired}
    Match: ${isMatch}
  `);

  // Clean up expired OTP
  if (isExpired) {
    delete otpMap[email];
    return false;
  }

  if (isMatch) {
    // OTP used successfully - remove it
    delete otpMap[email];
    return true;
  }

  return false;
};

// Optional: Clean up expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of Object.entries(otpMap)) {
    if (record.expires < now) {
      delete otpMap[email];
      console.log(`🧹 Cleaned up expired OTP for ${email}`);
    }
  }
}, 60 * 1000); // Clean up every minute
