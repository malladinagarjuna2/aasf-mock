import crypto from "crypto";

const COOKIE_NAME = "otp_challenge";

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

function getCookie(req: any, name: string) {
  const cookieHeader = String(req.headers?.cookie || "");
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function clearChallengeCookie(res: any) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

function parseChallenge(challenge: string) {
  const [encodedPayload, signature] = challenge.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export default function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const otp = String(req.body?.otp || "").trim();

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  const challenge = parseChallenge(getCookie(req, COOKIE_NAME));
  if (!challenge) {
    clearChallengeCookie(res);
    return res.status(400).json({ error: "OTP not requested or expired" });
  }

  if (challenge.email !== email) {
    return res.status(400).json({ error: "OTP does not match this email" });
  }

  if (!challenge.expires || Date.now() > challenge.expires) {
    clearChallengeCookie(res);
    return res.status(400).json({ error: "OTP has expired" });
  }

  const expectedHash = Buffer.from(challenge.otpHash || "");
  const actualHash = Buffer.from(hashOtp(email, otp));

  if (
    expectedHash.length !== actualHash.length ||
    !crypto.timingSafeEqual(expectedHash, actualHash)
  ) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  clearChallengeCookie(res);
  return res.json({ success: true, message: "OTP verified" });
}
