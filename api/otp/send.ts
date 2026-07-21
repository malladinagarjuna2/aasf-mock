import crypto from "crypto";
import nodemailer from "nodemailer";

const COOKIE_NAME = "otp_challenge";
const OTP_TTL_MS = 5 * 60 * 1000;

function getSecret() {
  return process.env.OTP_SECRET || process.env.EMAIL_PASS || "development-otp-secret";
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function hashOtp(email: string, otp: string) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${email.toLowerCase()}:${otp}`)
    .digest("hex");
}

function createChallenge(email: string, otp: string) {
  const payload = JSON.stringify({
    email: email.toLowerCase(),
    otpHash: hashOtp(email, otp),
    expires: Date.now() + OTP_TTL_MS,
  });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function setChallengeCookie(res: any, challenge: string) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${challenge}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(OTP_TTL_MS / 1000)}`
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = String(req.body?.email || "").trim();
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  setChallengeCookie(res, createChallenge(email, otp));

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    return res.json({
      success: true,
      message: "OTP generated, but email credentials are not configured.",
      devMode: true,
      otp,
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Kinetic Educator" <${user}>`,
      to: email,
      subject: "Your Verification Code - Kinetic Educator",
      text: `Your verification code is: ${otp}. It will expire in 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
          <h2 style="color: #6200EE; text-align: center;">Kinetic Educator</h2>
          <p>Hi there,</p>
          <p>Your verification code for signing in/up is:</p>
          <div style="background: #F5F5F5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to send OTP",
      details: error?.message || "Unknown error",
    });
  }
}
