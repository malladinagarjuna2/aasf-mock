import { User, LogOut, Info } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/src/lib/utils";
import { useAuth } from "../context/AuthContext";
import { isDemoMode } from "../firebase";
import AASFLogo from "./AASFLogo";

interface TopAppBarProps {
  variant?: "standard" | "quiz";
  progress?: number;
  currentTask?: string;
  timeLeft?: string;
  timerProgress?: number;
  isLowTime?: boolean;
  onLogoClick?: () => void;
}

export default function TopAppBar({ variant = "standard", progress, currentTask, timeLeft, timerProgress, isLowTime, onLogoClick }: TopAppBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const LogoLink = () => {
    const content = <AASFLogo className="transition-transform group-hover:scale-[1.03]" />;

    if (onLogoClick) {
      return (
        <button onClick={onLogoClick} className="flex items-center gap-3 group">
          {content}
        </button>
      );
    }

    return (
      <Link to="/" className="flex items-center gap-3 group">
        {content}
      </Link>
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full group">
      {isDemoMode && (
        <div className="bg-tertiary text-on-tertiary-container py-2 px-6 flex items-center justify-center gap-2 text-xs font-bold font-label">
          <Info className="w-3.5 h-3.5" />
          Note: This app is running in DEMO MODE. Data is stored locally in your browser.
        </div>
      )}
      <div className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/50 shadow-[0_0_20px_4px_rgba(0,0,0,0.42)]">
        <div className="flex justify-between items-center w-full px-6 py-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3">
          <LogoLink />
        </div>

        {variant === "standard" && (
          <div className="flex items-center gap-6">
            {user && (
              <nav className="hidden md:flex gap-8">
                <Link
                  to="/dashboard"
                  className={cn(
                    "font-label font-medium transition-colors py-1",
                    location.pathname === "/dashboard" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  {profile?.role?.toLowerCase() === 'student' ? 'Home' : 'Dashboard'}
                </Link>
                <Link
                  to="/quiz-editor"
                  className={cn(
                    "font-label font-medium transition-colors py-1",
                    location.pathname === "/quiz-editor" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  Quizzes
                </Link>
                <Link
                  to="/join"
                  className={cn(
                    "font-label font-medium transition-colors py-1",
                    location.pathname === "/join" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  Join
                </Link>
                <Link
                  to="/reports"
                  className={cn(
                    "font-label font-medium transition-colors py-1",
                    location.pathname === "/reports" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  {profile?.role?.toLowerCase() === 'student' ? 'History' : 'Reports'}
                </Link>
                <Link
                  to="/profile"
                  className={cn(
                    "font-label font-medium transition-colors py-1",
                    location.pathname === "/profile" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  Profile
                </Link>
              </nav>
            )}
            
            {user ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-bold text-on-surface leading-none mb-1">{profile?.full_name || user.email}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none">{profile?.role ? (profile.role.toLowerCase() === 'admin' ? 'Administrator' : profile.role.toLowerCase() === 'teacher' ? 'Educator' : profile.role) : 'Educator'}</p>
                </div>
                <Link to="/profile" className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container font-bold overflow-hidden shadow-sm border border-outline-variant/20">
                  {(profile?.avatar_url || user?.photoURL) ? (
                    <img
                      src={profile?.avatar_url || user?.photoURL!}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </Link>
                <button 
                  onClick={handleSignOut}
                  className="p-2.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-xl transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login" className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:text-primary transition-colors">Sign In</Link>
                <Link to="/signup" className="px-5 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-md shadow-lg shadow-primary/20 hover:bg-surface hover:text-on-surface hover:ring-1 hover:ring-on-surface active:scale-95 transition-all">Get Started</Link>
              </div>
            )}
          </div>
        )}

        {variant === "quiz" && (
          <div className="flex items-center gap-4 sm:gap-8 ml-auto">
            <div className="hidden xs:flex flex-col items-center">
              <span className="text-on-surface-variant font-label text-[8px] sm:text-[10px] uppercase tracking-widest leading-none mb-1">Progress</span>
              <span className="font-headline font-bold text-sm sm:text-lg text-primary whitespace-nowrap">{currentTask}</span>
            </div>
            
            <div className={cn(
              "relative flex items-center justify-center h-12 sm:h-14 w-24 sm:w-32 backdrop-blur-md rounded-lg sm:rounded-xl px-2 sm:px-4 overflow-hidden border-b-2 transition-colors duration-300 shadow-sm",
              isLowTime ? "bg-error-container/50 border-error" : "bg-surface-container-highest/70 border-tertiary"
            )}>
              <div className="flex flex-col items-center z-10">
                <span className={cn(
                  "text-[8px] sm:text-[10px] font-label font-bold uppercase tracking-tighter leading-none mb-0.5",
                  isLowTime ? "text-error" : "text-tertiary"
                )}>Time Left</span>
                <span className={cn(
                  "font-headline font-extrabold text-xl sm:text-2xl leading-none",
                  isLowTime ? "text-error animate-pulse" : "text-on-surface"
                )}>{timeLeft}</span>
              </div>
              <div className={cn(
                "absolute inset-0 bg-gradient-to-t to-transparent opacity-30",
                isLowTime ? "from-error-container" : "from-tertiary-container"
              )}></div>
            </div>
          </div>
        )}
      </div>
      
      {variant === "quiz" && timerProgress !== undefined && (
        <div className="w-full h-1 bg-surface-container-low overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-1000 ease-linear",
              isLowTime ? "bg-error" : "bg-primary"
            )}
            style={{ width: `${timerProgress}%` }}
          />
        </div>
      )}
    </div>
  </header>
);
}
