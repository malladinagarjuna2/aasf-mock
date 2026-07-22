import TopAppBar from "@/src/components/TopAppBar";
import BottomNavBar from "@/src/components/BottomNavBar";
import ThemeToggle from "@/src/components/ThemeToggle";
import { ArrowRight, Radio, Hourglass, CheckCircle2, Info, Loader2, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuiz } from "@/src/context/QuizContext";
import { useAuth } from "@/src/context/AuthContext";
import { cn } from "@/src/lib/utils";
import { useEffect } from "react";
import { doc, getDoc } from 'firebase/firestore';
import { db } from "@/src/firebase";

export default function StudentJoin() {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || "";
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpSuccessMsg, setOtpSuccessMsg] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const { quiz, findQuizByRoomCode, joinQuiz, participants, isRollAllowed, currentStudentRoll } = useQuiz();
  const { user, profile, sendOTP, verifyOTP } = useAuth();
  const navigate = useNavigate();

  // Pre-fill and auto-verify email if user is logged in
  useEffect(() => {
    if (user && user.email) {
      setEmail(user.email);
      setIsOtpVerified(true);
    }
  }, [user]);

  useEffect(() => {
    if (resendTimer > 0) {
      const interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [resendTimer]);

  const handleSendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setOtpError("Please enter your @iiitm.ac.in email address.");
      return;
    }

    if (!cleanEmail.endsWith("@iiitm.ac.in")) {
      setOtpError("Only @iiitm.ac.in email addresses are permitted.");
      return;
    }

    setSendingOtp(true);
    setOtpError("");
    setOtpSuccessMsg("");

    try {
      const res = await sendOTP(cleanEmail);
      setOtpSent(true);
      setResendTimer(60);
      if (res.devMode) {
        setOtpSuccessMsg("Verification code generated! (Sandbox mode)");
      } else {
        setOtpSuccessMsg("Verification code sent to your email!");
      }
    } catch (err: any) {
      setOtpError(err.message || "Failed to send OTP. Please check your email address.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanOtp) {
      setOtpError("Please enter the 6-digit verification code.");
      return;
    }

    setVerifyingOtp(true);
    setOtpError("");
    setOtpSuccessMsg("");

    try {
      await verifyOTP(cleanEmail, cleanOtp);
      setIsOtpVerified(true);
      setOtpSuccessMsg("Email verified successfully!");
    } catch (err: any) {
      setOtpError(err.message || "Invalid or expired OTP. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Session Guardian: If already joined an active session, don't allow staying on join page
  useEffect(() => {
    if (quiz && currentStudentRoll && quiz.status !== 'finished' && !searchParams.get('error')) {
      const p = (participants || []).find(part => part.roll === currentStudentRoll);
      if (p && p.status !== 'Submitted') {
        navigate("/quiz");
      }
    }
  }, [quiz, currentStudentRoll, participants, navigate]);
  const [history] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('quizHistory') || '[]');
    return [...saved].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });
  const [liveQuizzes, setLiveQuizzes] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (profile) {
      if (!name) setName(profile.full_name || "");
      if (!roll) setRoll(profile.roll || "");
    }
  }, [profile]);

  useEffect(() => {
    const checkLiveStatus = async () => {
      if (history.length === 0) return;
      setLoadingHistory(true);
      const live: any[] = [];
      
      // We check until we find 3 live ones or finish the list
      for (const item of history) {
        if (live.length >= 3) break;
        
        try {
          const quizDoc = await getDoc(doc(db, 'quizzes', item.id));
          if (quizDoc.exists()) {
            const data = quizDoc.data();
            // Show only if not finished
            if (data.status !== 'finished') {
              live.push({ ...item, status: data.status });
            }
          }
        } catch (err) {
          console.error("Error checking live status:", err);
        }
      }
      setLiveQuizzes(live);
      setLoadingHistory(false);
    };

    checkLiveStatus();
  }, [history]);

  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) {
      setError(urlError);
    }
  }, [searchParams]);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      validateCode(initialCode);
    }
  }, [initialCode]);

  const validateCode = async (inputCode: string) => {
    const cleanCode = inputCode.replace(/[^A-Z0-9]/gi, '');
    if (cleanCode.length === 6) {
      setIsValidating(true);
      const found = await findQuizByRoomCode(inputCode);
      setIsCodeValid(!!found);
      if (!found) setError("Invalid room code");
      else setError("");
      setIsValidating(false);
    } else {
      setIsCodeValid(false);
      setError("");
    }
  };

  const handleJoin = async () => {
    if (!code) {
      setError("Please enter a room code");
      return;
    }

    setIsValidating(true);
    let targetQuiz = quiz;
    if (!isCodeValid || !targetQuiz) {
      const found = await findQuizByRoomCode(code);
      if (!found) {
        setError("Invalid room code");
        setIsValidating(false);
        return;
      }
      setIsCodeValid(true);
      targetQuiz = found;
    }

    if (!name || !roll) {
      setError("Please enter your name and roll number");
      setIsValidating(false);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.endsWith("@iiitm.ac.in")) {
      setError("Please enter a valid @iiitm.ac.in email address.");
      setIsValidating(false);
      return;
    }

    if (!user && !isOtpVerified) {
      setError("Please verify your @iiitm.ac.in email address using OTP before joining.");
      setIsValidating(false);
      return;
    }

    // Roll number validation
    if (targetQuiz.allowedRollPatterns && targetQuiz.allowedRollPatterns.length > 0) {
      if (!isRollAllowed(roll, targetQuiz.allowedRollPatterns)) {
        setError("Invalid roll number format. Use XXXXABC-XXX, where X is a number and ABC is letters. For further assistance, talk to the coordinator.");
        setIsValidating(false);
        return;
      }
    }

    try {
      await joinQuiz({ name, roll, email: cleanEmail }, targetQuiz);
      
      // Check if this student already submitted
      const p = (participants || []).find(part => part.roll === roll);
      if (p?.status === 'Submitted') {
        navigate("/score");
      } else {
        navigate("/quiz");
      }
    } catch (err: any) {
      let msg = err.message || "An error occurred. Please try again.";
      const isExpectedError = msg === "user already joined" || msg === "already participated";
      
      if (!isExpectedError) {
        console.error("Join error:", err);
      }
      
      // Try to extract a clean message if it's a JSON string from handleFirestoreError
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.error || msg;
      } catch {
        // Not a JSON string, use as is
      }
      setError(msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleHistoryClick = (item: any) => {
    setCode(item.roomCode);
    setError("");
    validateCode(item.roomCode);
    if (item.name) setName(item.name);
    if (item.roll) setRoll(item.roll);
  };

  return (
    <div className="bg-surface min-h-screen flex flex-col pt-20 md:pt-28 pb-32 overflow-x-hidden">
      <TopAppBar />
      
      <main className="flex-grow flex flex-col items-center px-4 md:px-6 py-8 md:py-16 relative">
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] right-[-5%] w-[40rem] h-[40rem] rounded-full bg-primary-container/10 blur-[100px] -z-10"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[35rem] h-[35rem] rounded-full bg-secondary-container/10 blur-[80px] -z-10"></div>
        
        <div className="w-full max-w-lg">
          <div className="text-left mb-10">
            <h2 className="font-headline text-3xl md:text-5xl font-extrabold text-on-surface tracking-tight mb-4">Join Quiz Room</h2>
            <p className="text-on-surface-variant text-lg max-w-md">Enter your details and the unique 6-digit code provided by the organizer.</p>
          </div>

          <div className="grid gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/15 shadow-[0_20px_40px_rgba(42,43,81,0.06)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Radio className="w-24 h-24" />
              </div>
              
              <div className="relative z-10">
                <label className="block text-sm font-semibold text-on-surface-variant uppercase tracking-widest mb-3" htmlFor="room-code">Room Code</label>
                <div className="group relative mb-8">
                  <input 
                    id="room-code"
                    value={code}
                    onChange={(e) => { 
                      const val = e.target.value.toUpperCase();
                      setCode(val); 
                      setError("");
                      validateCode(val);
                    }}
                    className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 text-3xl md:text-4xl font-headline font-bold tracking-[0.2em] py-4 px-4 placeholder:text-outline-variant/30 transition-all duration-300 text-center rounded-t-lg" 
                    maxLength={8}
                    placeholder="000-000" 
                    type="text" 
                  />
                  {isValidating && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  )}
                  {isCodeValid && !isValidating && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {isCodeValid && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-emerald-800 text-sm font-bold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              Room Found: <span className="underline">{quiz?.title}</span>
                            </p>
                            <p className="text-[10px] text-emerald-600 font-bold uppercase mt-1">
                              Status: {quiz?.status === 'waiting' ? 'In Lobby' : quiz?.status === 'starting' ? 'Starting...' : 'Active Session'}
                            </p>
                          </div>
                          <div className="text-right">
                             <div className="flex -space-x-2 mb-1 justify-end">
                               {(participants || []).slice(0, 3).map((p, i) => (
                                 <div key={p.roll || i} className={cn(
                                   "w-6 h-6 rounded-full ring-2 ring-emerald-50 flex items-center justify-center text-[8px] font-bold text-white",
                                   ['bg-blue-400', 'bg-purple-400', 'bg-orange-400'][i % 3]
                                 )}>
                                   {p.name ? p.name.charAt(0) : '?'}
                                 </div>
                               ))}
                               {(participants || []).length > 3 && (
                                 <div className="w-6 h-6 rounded-full ring-2 ring-emerald-50 bg-emerald-200 flex items-center justify-center text-[8px] font-bold text-emerald-700">
                                   +{(participants || []).length - 3}
                                 </div>
                               )}
                             </div>
                             <div className="text-[8px] font-bold text-emerald-600 uppercase tracking-tighter">
                               {(participants || []).length} Joining
                             </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant uppercase tracking-widest mb-3" htmlFor="student-name">Full Name</label>
                        <input 
                          id="student-name"
                          value={name}
                          onChange={(e) => { setName(e.target.value); setError(""); }}
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 text-xl font-headline font-bold py-4 px-4 placeholder:text-outline-variant/30 transition-all duration-300 rounded-t-lg" 
                          placeholder="Enter your full name" 
                          type="text" 
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant uppercase tracking-widest mb-3" htmlFor="roll-number">Roll Number</label>
                        <input 
                          id="roll-number"
                          value={roll}
                          onChange={(e) => { setRoll(e.target.value); setError(""); }}
                          className="w-full bg-surface-container-low border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 text-xl font-headline font-bold py-4 px-4 placeholder:text-outline-variant/30 transition-all duration-300 rounded-t-lg" 
                          placeholder="Enter your roll number" 
                          type="text" 
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant uppercase tracking-widest mb-3" htmlFor="student-email">
                          @iiitm.ac.in Email Address
                        </label>
                        <div className="relative">
                          <input 
                            id="student-email"
                            value={email}
                            disabled={isOtpVerified || !!user}
                            onChange={(e) => { 
                              setEmail(e.target.value); 
                              setError(""); 
                              setOtpError("");
                              if (isOtpVerified && !user) setIsOtpVerified(false);
                            }}
                            className={cn(
                              "w-full bg-surface-container-low border-0 border-b-2 focus:ring-0 text-xl font-headline font-bold py-4 pl-4 pr-12 placeholder:text-outline-variant/30 transition-all duration-300 rounded-t-lg",
                              isOtpVerified ? "border-emerald-500 text-emerald-800 bg-emerald-50/30" : "border-transparent focus:border-primary"
                            )}
                            placeholder="student@iiitm.ac.in" 
                            type="email" 
                          />
                          {isOtpVerified ? (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-600 font-bold text-xs">
                              <ShieldCheck className="w-5 h-5 text-emerald-500" />
                            </div>
                          ) : (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40">
                              <Mail className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* OTP Verification Section for non-logged in users */}
                        {!user && !isOtpVerified && (
                          <div className="mt-4 p-4 bg-surface-container-low/80 rounded-xl border border-outline-variant/15 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                                <KeyRound className="w-4 h-4 text-primary" />
                                Email OTP Verification
                              </span>
                              
                              {!otpSent ? (
                                <button
                                  type="button"
                                  onClick={handleSendOtp}
                                  disabled={sendingOtp || !email.trim().toLowerCase().endsWith("@iiitm.ac.in")}
                                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg shadow-sm hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {sendingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send OTP"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleSendOtp}
                                  disabled={sendingOtp || resendTimer > 0}
                                  className="text-xs text-primary font-bold hover:underline disabled:opacity-50 flex items-center gap-1"
                                >
                                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend OTP"}
                                </button>
                              )}
                            </div>

                            {otpSent && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  maxLength={6}
                                  value={otp}
                                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError(""); }}
                                  placeholder="6-digit code"
                                  className="flex-1 bg-surface-container-lowest border border-outline-variant/20 text-center text-lg font-mono font-bold tracking-widest py-2.5 px-3 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={handleVerifyOtp}
                                  disabled={verifyingOtp || otp.length < 6}
                                  className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                >
                                  {verifyingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify Code"}
                                </button>
                              </div>
                            )}

                            {otpError && (
                              <p className="text-error text-xs font-bold flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5" />
                                {otpError}
                              </p>
                            )}

                            {otpSuccessMsg && (
                              <p className="text-emerald-600 text-xs font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {otpSuccessMsg}
                              </p>
                            )}
                          </div>
                        )}

                        {isOtpVerified && !user && (
                          <div className="mt-2 text-emerald-600 text-xs font-bold flex items-center gap-1 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Verified with @iiitm.ac.in OTP
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-error text-sm font-bold mt-6 flex items-center gap-2 bg-error/10 p-3 rounded-lg"
                  >
                    <Info className="w-4 h-4" />
                    {error}
                  </motion.p>
                )}
                
                <div className="mt-10">
                  <button 
                    onClick={handleJoin}
                    disabled={isValidating || (isCodeValid && !user && !isOtpVerified)}
                    className={cn(
                      "w-full py-4 px-6 rounded-xl font-headline font-bold text-lg flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg",
                      isCodeValid && (user || isOtpVerified)
                        ? "bg-primary text-on-primary shadow-primary/20" 
                        : "bg-surface-container-highest text-on-surface-variant opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isCodeValid 
                      ? (!user && !isOtpVerified ? "Verify Email to Join" : "Enter Quiz Room")
                      : "Enter Room Code Above"}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>

            {liveQuizzes.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-surface-container-low/50 p-6 rounded-xl border border-outline-variant/10"
              >
                <h3 className="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-2">
                  <Hourglass className="w-4 h-4" />
                  Live Recent Quizzes
                </h3>
                <div className="space-y-3">
                  {liveQuizzes.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="w-full flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/5 hover:border-primary/30 transition-all group text-left"
                    >
                      <div className="flex-1">
                        <div className="font-bold text-on-surface group-hover:text-primary transition-colors">{item.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">{item.roomCode}</div>
                          <div className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-md font-bold uppercase tracking-tighter">
                            {item.status === 'waiting' ? 'In Lobby' : item.status === 'starting' ? 'Starting' : 'Active'}
                          </div>
                          {item.name && (
                            <div className="text-[9px] text-on-surface-variant opacity-60 flex items-center gap-1">
                              • <span>{item.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-outline-variant group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          <div className="mt-12 flex items-start gap-4 p-4 rounded-lg bg-surface-container-high/50">
            <Info className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Make sure your internet connection is stable. If you drop out, simply re-enter the code to rejoin the session.
            </p>
          </div>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}


