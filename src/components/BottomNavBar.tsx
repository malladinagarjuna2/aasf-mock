import { LayoutDashboard, ClipboardList, BarChart3, User, Radio } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/src/lib/utils";
import { useAuth } from "../context/AuthContext";

export default function BottomNavBar() {
  const location = useLocation();
  const { profile } = useAuth();

  const isStudent = profile?.role?.toLowerCase() === 'student';

  const navItems = isStudent ? [
    { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
    { icon: BarChart3, label: "History", path: "/reports" },
    { icon: Radio, label: "Join", path: "/join" },
    { icon: User, label: "Profile", path: "/profile" },
  ] : [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: ClipboardList, label: "Quizzes", path: "/quiz-editor" },
    { icon: Radio, label: "Join", path: "/join" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-2 bg-surface/85 backdrop-blur-xl border-t border-outline-variant/40 shadow-[0_-16px_40px_rgba(0,0,0,0.34)] z-50 rounded-t-2xl md:hidden transition-colors">
      {navItems.map((item) => (
        <Link
          key={item.label}
          to={item.path}
          className={cn(
            "flex flex-col items-center justify-center px-3 py-1 transition-all",
            location.pathname === item.path ? "bg-primary text-on-primary rounded-xl scale-105" : "text-on-surface-variant hover:bg-surface-container-high/50 hover:text-primary"
          )}
        >
          <item.icon className={cn("w-6 h-6", location.pathname === item.path && "fill-current")} />
          <span className="font-label text-[10px] font-medium uppercase tracking-wider mt-1">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
