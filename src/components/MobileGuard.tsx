import React, { useState, useEffect } from "react";
import { Monitor, Smartphone, Copy, Check, ShieldAlert, Laptop } from "lucide-react";
import AASFLogo from "./AASFLogo";

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Check navigator.userAgentData if available
  const nav = navigator as unknown as { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData && typeof nav.userAgentData.mobile === "boolean") {
    if (nav.userAgentData.mobile) return true;
  }

  // 2. Check user agent string for mobile phone signatures
  const userAgent = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || "";
  const mobileRegex = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;
  const isMobileUA = mobileRegex.test(userAgent);

  // 3. Screen width & touch check (mobile phones typically have screen width <= 768px)
  const isSmallScreen = window.innerWidth <= 768;
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return isMobileUA || (isSmallScreen && isTouchDevice);
}

interface MobileGuardProps {
  children: React.ReactNode;
}

export default function MobileGuard({ children }: MobileGuardProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 overflow-y-auto font-sans">
        {/* Background gradient blur decorations */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
          {/* Logo */}
          <div className="mb-6">
            <AASFLogo />
          </div>

          {/* Icon indicator */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Smartphone className="w-10 h-10 opacity-40" />
              <ShieldAlert className="w-10 h-10 absolute text-red-500 animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white tracking-tight mb-3">
            Desktop Only Access
          </h1>

          {/* Subtitle / Explanation */}
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            This website is disallowed from opening on mobile phones. Please switch to a desktop or laptop computer browser to access this application.
          </p>

          {/* Info Card */}
          <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl p-4 mb-6 text-left text-xs space-y-3 text-slate-300">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-slate-200">Supported Devices</p>
                <p className="text-slate-400 text-[11px]">Desktop & Laptop computers</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-slate-800/80 pt-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-slate-200">Minimum Display</p>
                <p className="text-slate-400 text-[11px]">Screen resolution width &gt; 768px</p>
              </div>
            </div>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Link for Desktop</span>
              </>
            )}
          </button>
        </div>

        <p className="mt-8 text-slate-500 text-xs">
          AASF Mock App &bull; Mobile Access Restricted
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
