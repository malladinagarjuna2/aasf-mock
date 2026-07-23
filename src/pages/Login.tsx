import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, isAllowedEmail } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Chrome, ArrowRight, Loader2, Eye, EyeOff, Shield, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import AASFLogo from '@/src/components/AASFLogo';

export default function Login() {
  const { signInWithGoogle, signInWithEmail, sendPasswordReset, resendEmailVerification, refreshEmailVerification } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'credentials' | 'verify-email'>('credentials');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const navigate = useNavigate();

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllowedEmail(email)) {
      setError('Only @iiitm.ac.in or authorized admin email addresses are permitted.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/email-not-verified') {
        setVerificationNotice(`Your Firebase account for ${email} is not verified yet. Open the verification email, then come back and continue.`);
        setStep('verify-email');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError("Firebase doesn't have a password for this account yet. If you usually use Google, please sign in with the 'Google Account' button first, then set a password in your Profile settings.");
      } else {
        setError(err.message || 'Failed to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const [resetStep, setResetStep] = useState<'request' | 'verify' | 'new-password'>('request');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;

    if (!isAllowedEmail(resetEmail)) {
      setResetError('Only @iiitm.ac.in or authorized admin email addresses are permitted.');
      return;
    }

    setResetLoading(true);
    setResetError(null);
    try {
      await sendPasswordReset(resetEmail);
      setResetSuccess(true);
    } catch (err: any) {
      setResetError(err.message || 'Failed to send reset email. Please check the address.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetOtpVerify = async (e: React.FormEvent) => {
    setIsForgotPassword(false);
  };

  const handleSetNewPassword = () => {
    setIsForgotPassword(false);
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-[40rem] h-[40rem] rounded-full bg-primary/10 blur-[100px] -z-10"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[35rem] h-[35rem] rounded-full bg-tertiary/10 blur-[80px] -z-10"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface-container-lowest/95 p-10 rounded-3xl border border-outline-variant/30 shadow-2xl shadow-black/30 relative z-10"
      >
        <div className="text-center mb-10">
          <AASFLogo className="justify-center mb-8" />
          <h1 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight mb-2">Login</h1>
          <p className="text-on-surface-variant font-body">Sign in to manage AASF quizzes and reports.</p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'credentials' ? (
            <motion.form
              key="credentials-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleInitialSubmit}
              className="space-y-6"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body"
                    placeholder="user@iiitm.ac.in"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label">Password</label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body"
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-md shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Sign In</span>}
                {!loading && <ArrowRight className="w-5 h-5" />}
              </button>
            </motion.form>
          ) : (
            <motion.div
              key="verify-email-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center p-5 bg-primary/5 rounded-2xl">
                <Shield className="w-10 h-10 text-primary mx-auto mb-3" />
                <p className="text-sm text-on-surface-variant">
                  {verificationNotice || `Your Firebase account for ${email} is not verified yet.`}
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const verified = await refreshEmailVerification();
                      if (verified) {
                        navigate('/dashboard');
                        return;
                      }
                      setError('Email is still not verified. Please open the Firebase verification link first.');
                    } catch (err: any) {
                      setError(err.message || 'Failed to refresh verification status.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-md shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>I've Verified My Email</span>}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      await resendEmailVerification();
                      setVerificationNotice(`Verification email sent again to ${email}. Please check your inbox and spam folder.`);
                    } catch (err: any) {
                      setError(err.message || 'Failed to resend verification email.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-4 bg-surface-container-low border border-outline-variant/30 text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container-high transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-70"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('credentials');
                  }}
                  className="w-full py-4 text-on-surface-variant font-bold text-sm hover:bg-surface-container rounded-xl transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-grow bg-outline-variant/20"></div>
          <span className="text-xs font-bold text-outline uppercase tracking-widest">Or continue with</span>
          <div className="h-px flex-grow bg-outline-variant/20"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full py-4 bg-surface-container-low border border-outline-variant/30 text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container-high transition-all flex items-center justify-center gap-3 active:scale-95"
        >
          <Chrome className="w-5 h-5" />
          <span>Google Account</span>
        </button>

        <p className="mt-8 text-center text-on-surface-variant font-body">
          Don't have an account? <Link to="/signup" className="text-primary font-bold hover:underline">Sign up for free</Link>
        </p>

        <AnimatePresence>
          {isForgotPassword && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-container-lowest p-8 rounded-[2.5rem] shadow-2xl border border-outline-variant/10 max-w-md w-full"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-headline text-2xl font-extrabold text-on-surface">Reset Password</h3>
                    <p className="text-sm text-on-surface-variant">
                      We'll send a secure link to your email
                    </p>
                  </div>
                </div>

                {resetSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-6 text-center"
                  >
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h4 className="font-headline text-xl font-bold text-on-surface mb-2">Email Sent!</h4>
                    <p className="text-on-surface-variant mb-6 text-sm leading-relaxed text-left bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                      We've sent a password reset link to <span className="font-bold text-on-surface">{resetEmail}</span>. Please check your inbox and follow the instructions to set a new password.
                    </p>
                    <button
                      onClick={() => {
                        setIsForgotPassword(false);
                        setResetSuccess(false);
                      }}
                      className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      Back to Login
                    </button>
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    <form onSubmit={handleForgotPasswordRequest} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1">Email Address</label>
                        <div className="relative group">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                          <input
                            type="email"
                            required
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            placeholder="user@iiitm.ac.in"
                          />
                        </div>
                      </div>

                      {resetError && (
                        <p className="text-error text-sm font-medium px-1">{resetError}</p>
                      )}

                      <div className="flex gap-4 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(false);
                            setResetError(null);
                          }}
                          className="flex-1 py-4 bg-surface-container-low text-on-surface font-bold rounded-xl hover:bg-surface-container transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="flex-1 py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {resetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Link'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
