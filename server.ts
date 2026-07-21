import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // In-memory OTP storage (for demo purposes, could use Redis or Firestore in production)
  // Format: { email: { otp: string, expires: number } }
  const otpStore: Record<string, { otp: string; expires: number }> = {};

  // Email Transporter (using environment variables)
  const getTransporter = () => {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      console.warn("EMAIL_USER or EMAIL_PASS not set. Email functionality will fail.");
      return null;
    }

    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user,
        pass: pass,
      },
    });
  };

  // Endpoint to send OTP
  app.post("/api/otp/send", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    otpStore[email] = { otp, expires };

    const transporter = getTransporter();
    if (!transporter) {
      // For development/demo, log the OTP if no email config
      console.log(`[DEV MODE] OTP for ${email}: ${otp}`);
      return res.json({ 
        success: true, 
        message: "OTP sent (logged to console as EMAIL_USER/EMAIL_PASS is missing)",
        devMode: true,
        otp: otp // Include OTP in response for development ease
      });
    }

    try {
      await transporter.sendMail({
        from: `"Kinetic Educator" <${process.env.EMAIL_USER}>`,
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
            <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send OTP", details: error.message });
    }
  });

  // Endpoint to verify OTP
  app.post("/api/otp/verify", (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const storedData = otpStore[email];
    if (!storedData) {
      return res.status(400).json({ error: "OTP not requested or expired" });
    }

    if (Date.now() > storedData.expires) {
      delete otpStore[email];
      return res.status(400).json({ error: "OTP has expired" });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Success
    delete otpStore[email];
    res.json({ success: true, message: "OTP verified" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
