/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import QuizEditor from "./pages/QuizEditor";
import StudentJoin from "./pages/StudentJoin";
import StudentQuiz from "./pages/StudentQuiz";
import StudentScore from "./pages/StudentScore";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Onboarding from "./pages/Onboarding";
import { QuizProvider } from "./context/QuizContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { Loader2 } from "lucide-react";
import AASFLogo from "./components/AASFLogo";
import MobileGuard from "./components/MobileGuard";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-5">
        <AASFLogo />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-5">
        <AASFLogo />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/join" replace />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/signup",
    element: <SignUp />,
  },
  {
    path: "/join",
    element: <StudentJoin />,
  },
  {
    path: "/quiz",
    element: <StudentQuiz />,
  },
  {
    path: "/score",
    element: <StudentScore />,
  },
  {
    path: "/onboarding",
    element: (
      <ProtectedRoute>
        <Onboarding />
      </ProtectedRoute>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/reports",
    element: (
      <ProtectedRoute>
        <Reports />
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: "/quiz-editor",
    element: (
      <ProtectedRoute>
        <QuizEditor />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/join" replace />,
  },
]);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QuizProvider>
          <MobileGuard>
            <div className="min-h-screen flex flex-col">
              <RouterProvider router={router} />
            </div>
          </MobileGuard>
        </QuizProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
