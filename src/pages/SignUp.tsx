import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, isAllowedEmail } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Chrome, ArrowRight, Loader2, User, AtSign, Eye, EyeOff, Briefcase, CheckCircle2, Shield } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import AASFLogo from '@/src/components/AASFLogo';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [roll, setRoll] = useState('');
  const [role, setRole] = useState('teacher');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'verify-email'>('details');
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const { signInWithGoogle, signUpWithEmail, resendEmailVerification } = useAuth();
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
      await signUpWithEmail(email, password, name, username, role, roll);
      setVerificationNotice(`A Firebase verification email has been sent to ${email}. Please verify it before logging in.`);
      setStep('verify-email');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please go to the Login page to sign in, or use Forgot Password if you need to set a password.');
      } else {
        setError(err.message || 'Failed to create account or send verification email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
      navigate('/onboarding');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google.');
      }
    }
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
          <h1 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight mb-2">Sign Up</h1>
          <p className="text-on-surface-variant font-body">Create your account to start building AASF quizzes.</p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'details' ? (
            <motion.form
              key="details-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleInitialSubmit}
              className="space-y-5"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Full Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body"
                    placeholder="Dr. Sarah Wilson"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Username</label>
                <div className="relative group">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body"
                    placeholder="sarah_username"
                  />
                </div>
              </div>

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
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Account Role</label>
                <div className="relative group">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full pl-12 pr-10 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body appearance-none cursor-pointer"
                  >
                    <option value="teacher">Educator</option>
                    <option value="admin">Administrator</option>
                    <option value="student">Student</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                    <ArrowRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {role === 'student' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Roll Number</label>
                    <div className="relative group">
                      <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline group-focus-within:text-primary transition-colors" />
                      <input
                        type="text"
                        required
                        value={roll}
                        onChange={(e) => setRoll(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body"
                        placeholder="2024-STUDENT-001"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant font-label ml-1">Password</label>
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
                  className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium flex flex-col gap-2"
                >
                  <p>{error}</p>
                  {error.includes('already registered') && (
                    <Link
                      to="/login"
                      className="text-xs font-bold underline hover:text-error/80 transition-colors self-start"
                    >
                      Go to Login
                    </Link>
                  )}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-md shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:scale-100"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Create Account</span>}
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
                  {verificationNotice || `A verification email has been sent to ${email}.`}
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
                      await resendEmailVerification();
                      setVerificationNotice(`Verification email sent again to ${email}. Please check your inbox and spam folder.`);
                    } catch (err: any) {
                      setError(err.message || 'Failed to resend verification email.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-md shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Resend Verification Email</span>}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full py-4 text-on-surface-variant font-bold text-sm hover:bg-surface-container rounded-xl transition-colors"
                >
                  Go to Login
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
          onClick={handleGoogleSignUp}
          className="w-full py-4 bg-surface-container-low border border-outline-variant/30 text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container-high transition-all flex items-center justify-center gap-3 active:scale-95"
        >
          <Chrome className="w-5 h-5" />
          <span>Google Account</span>
        </button>

        <p className="mt-10 text-center text-on-surface-variant font-body">
          Already have an account? <Link to="/login" className="text-primary font-bold hover:underline">Sign in instead</Link>
        </p>
      </motion.div>
    </div>
  );
}
