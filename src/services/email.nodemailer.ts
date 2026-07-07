/* eslint-disable max-len */
// src/services/email.nodemailer.ts
import https from 'https';

// Brevo API Configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.MAIL_PASS;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || process.env.MAIL_USER;
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || 'FarmFuzion';

// HTML Email Template
const generateOTPEmailHTML = (otp: string): string => {
  return `
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
  `;
};

// Plain text version
const generateOTPEmailText = (otp: string): string => {
  return `
FarmFuzion - Your OTP Code

Your FarmFuzion OTP is: ${otp}

This code is valid for 5 minutes.

If you didn't request this OTP, please ignore this email.
Never share this code with anyone.

---
FarmFuzion - Sustained Agri-Business
  `;
};

export const sendOtpByEmail = async (
  email: string,
  otp: string,
  config: { MAIL_USER: string; MAIL_PASS: string }
): Promise<any> => {
  const {MAIL_USER, MAIL_PASS} = config;

  // Use MAIL_PASS as the API key (Brevo SMTP key works as API key too)
  const apiKey = MAIL_PASS;
  const fromEmail = MAIL_USER || BREVO_FROM_EMAIL;
  const fromName = BREVO_FROM_NAME;

  if (!apiKey) {
    throw new Error("❌ Brevo API key (MAIL_PASS) missing from config");
  }

  console.log(`📧 Attempting to send OTP to ${email} via Brevo API...`);

  const postData = JSON.stringify({
    sender: {
      name: fromName,
      email: fromEmail
    },
    to: [{
      email: email,
      name: 'User'
    }],
    subject: '🌱 FarmFuzion - Your OTP Code',
    htmlContent: generateOTPEmailHTML(otp),
    textContent: generateOTPEmailText(otp),
  });

  const options = {
    hostname: 'api.brevo.com',
    port: 443,
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 30000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res: any) => {
      let responseData = '';
      res.on('data', (chunk: any) => {
        responseData += chunk;
      });
      
      // Add better error handling for the API response
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log(`✅ OTP Email Sent Successfully via Brevo API:`, {
            statusCode: res.statusCode,
            to: email,
          });
          
          try {
            const parsed = JSON.parse(responseData);
            console.log(`📧 Message ID: ${parsed.messageId || 'N/A'}`);
            resolve(parsed);
          } catch (parseError) {
            // If response isn't JSON, still consider it a success
            console.log(`📧 Email sent (non-JSON response)`);
            resolve({ success: true, raw: responseData });
          }
        } else {
          console.error(`❌ Brevo API error ${res.statusCode}:`, responseData);
          reject(new Error(`API error ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error: { message: any; }) => {
      console.error('❌ Brevo API request failed:', error.message);
      reject(new Error(`API request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Brevo API request timeout');
      reject(new Error('API request timeout'));
    });

    req.write(postData);
    req.end();
  });
};