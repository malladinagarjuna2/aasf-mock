import { cn } from "@/src/lib/utils";
import aasfIcon from "@/src/assets/aasf-icon.png";

interface AASFLogoProps {
  compact?: boolean;
  className?: string;
}

export default function AASFLogo({ compact = false, className }: AASFLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-tertiary/50 bg-white p-1.5 shadow-[0_0_28px_rgba(255,205,37,0.18)]">
        <img src={aasfIcon} alt="AASF" className="h-full w-full object-contain" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-headline text-xl font-black tracking-tight text-on-surface sm:text-2xl">
            AASF
          </div>
          <div className="mt-1 hidden text-[9px] font-bold uppercase tracking-[0.24em] text-tertiary sm:block">
            Quiz Platform
          </div>
        </div>
      )}
    </div>
  );
}
