import nodemailer from "nodemailer";

const otpMap: Record<string, { otp: string; expires: number }> = {};

export const generateOtp = (email: string): string => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  otpMap[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
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

  return !isExpired && isMatch;
};

export const sendOtpByEmail = async (
  email: string,
  otp: string,
  config: { MAIL_USER: string; MAIL_PASS: string }
) => {
  const {MAIL_USER, MAIL_PASS} = config;

  if (!MAIL_USER || !MAIL_PASS) {
    throw new Error("❌ MAIL_USER or MAIL_PASS missing from config");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"FarmFuzion Auth" <${MAIL_USER}>`,
    to: email,
    subject: "Your FarmFuzion OTP Code",
    html: `
      <p>Hello 👨‍🌾,</p>
      <p>Your OTP is: <b>${otp}</b></p>
      <p>It is valid for 5 minutes. Do not share this code.</p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("✅ OTP Email Sent:", info.messageId);
};
