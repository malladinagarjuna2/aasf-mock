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

  // Mobile device blocking middleware for page requests
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff2?|ttf|eot)$/)) {
      const userAgent = req.headers["user-agent"] || "";
      const mobileRegex = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;

      if (mobileRegex.test(userAgent)) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Desktop Access Only - AASF</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                background-color: #020617;
                color: #f8fafc;
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
                box-sizing: border-box;
              }
              .card {
                max-width: 400px;
                margin: 20px;
                padding: 32px 24px;
                background-color: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
              }
              h1 { font-size: 24px; font-weight: 700; margin-top: 16px; margin-bottom: 8px; color: #ffffff; }
              p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
              .icon {
                width: 64px;
                height: 64px;
                margin: 0 auto;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.2);
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ef4444;
                font-size: 28px;
              }
              .badge {
                display: inline-block;
                padding: 6px 12px;
                background-color: #1e293b;
                border-radius: 8px;
                font-size: 12px;
                color: #cbd5e1;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">🚫</div>
              <h1>Desktop Only Access</h1>
              <p>This website is disallowed from opening on mobile phone devices. Please switch to a desktop or laptop computer to continue.</p>
              <div class="badge">AASF Mock App &bull; Mobile Access Restricted</div>
            </div>
          </body>
          </html>
        `);
      }
    }
    next();
  });

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

  const getAdminEmails = (): string[] => {
    const raw = [
      process.env.VITE_ADMIN_EMAILS,
      process.env.ADMIN_EMAILS,
      process.env.EMAIL_USER,
    ]
      .filter(Boolean)
      .join(",");
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  };

  const isAllowedEmail = (email: string): boolean => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.endsWith("@iiitm.ac.in")) return true;
    if (normalized.startsWith("admin@")) return true;
    const adminEmails = getAdminEmails();
    return adminEmails.includes(normalized);
  };

  // Endpoint to send OTP
  app.post("/api/otp/send", async (req, res) => {
    const rawEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!rawEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!isAllowedEmail(rawEmail)) {
      return res.status(400).json({ error: "Only @iiitm.ac.in or authorized admin email addresses are permitted." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    otpStore[rawEmail] = { otp, expires };

    const transporter = getTransporter();
    if (!transporter) {
      console.log(`[DEV MODE] OTP for ${rawEmail}: ${otp}`);
      return res.json({
        success: true,
        message: "OTP generated in Sandbox mode.",
        devMode: true
      });
    }

    try {
      await transporter.sendMail({
        from: `"AASF" <${process.env.EMAIL_USER}>`,
        to: rawEmail,
        subject: "Your Verification Code - AASF MOCK APP",
        text: `Your verification code is: ${otp}. It will expire in 5 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
            <h2 style="color: #6200EE; text-align: center;">AASF MOCK APP</h2>
            <p>Hi there,</p>
            <p>Your verification code for signing in/up is:</p>
            <div style="background: #F5F5F5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0; user-select: all;">
              ${otp}
            </div>
            <p style="color: #666; font-size: 12px; text-align: center;">This code will expire in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
      console.error("Error sending email via Nodemailer:", error?.message || error);
      console.log(`[DEV MODE FALLBACK] OTP for ${rawEmail}: ${otp}`);
      res.json({
        success: true,
        message: "Email sending failed. Using Sandbox mode.",
        devMode: true
      });
    }
  });

  // Endpoint to verify OTP
  app.post("/api/otp/verify", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim().replace(/\D/g, "");
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    if (!isAllowedEmail(email)) {
      return res.status(400).json({ error: "Only @iiitm.ac.in or authorized admin email addresses are permitted." });
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
