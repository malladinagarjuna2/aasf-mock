import TopAppBar from "@/src/components/TopAppBar";
import BottomNavBar from "@/src/components/BottomNavBar";
import { Copy, Download, Plus, PlusCircle, Radio, Search, ArrowRight, Award, Info, Rocket, QrCode, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from 'qrcode.react';
import { useQuiz, LOBBY_COUNTDOWN_SECONDS } from "@/src/context/QuizContext";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/src/lib/utils";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";

const getAnsweredCount = (answers: Record<string, any> = {}) => Object.values(answers).filter(answer => {
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === "string" ? answer.trim().length > 0 : Boolean(answer);
}).length;

const toMillis = (value: any) => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return mins + ":" + secs.toString().padStart(2, "0");
};

export default function Dashboard() {
  const { quiz, quizzes, participants, loading, endQuiz, startSession, cancelStart, selectQuiz } = useQuiz();
  const { profile } = useAuth();
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showSwitchQuiz, setShowSwitchQuiz] = useState(false);
  const navigate = useNavigate();

  const activeQuizzes = quizzes.filter(q => q.isActive);
  const otherActiveQuizzes = activeQuizzes.filter(q => q.id !== quiz?.id);

  // Lobby countdown state for teacher
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (quiz?.status === 'starting' && quiz.startedAt) {
      const startedAt = typeof quiz.startedAt === 'string' ? new Date(quiz.startedAt).getTime() : 
                        (quiz.startedAt.toMillis ? quiz.startedAt.toMillis() : Date.now());
      
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - startedAt) / 1000;
        const remaining = Math.max(0, Math.ceil(LOBBY_COUNTDOWN_SECONDS - elapsed));
        setLobbyCountdown(remaining);
        
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setLobbyCountdown(null);
    }
  }, [quiz?.status, quiz?.startedAt]);

  useEffect(() => {
    if (quiz?.status !== 'active') {
      setSessionTimeLeft(null);
      return;
    }

    const explicitEndsAt = toMillis(quiz.endsAt);
    const startedAt = toMillis(quiz.startedAt);
    const fallbackEndsAt = startedAt && quiz.customTimer ? startedAt + Number(quiz.customTimer) * 1000 : null;
    const endsAt = explicitEndsAt || fallbackEndsAt;

    if (!endsAt || !Number.isFinite(endsAt)) {
      setSessionTimeLeft(null);
      return;
    }

    const tick = () => setSessionTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [quiz?.status, quiz?.endsAt, quiz?.startedAt, quiz?.customTimer]);
  const handleCopy = () => {
    if (quiz?.roomCode) {
      navigator.clipboard.writeText(quiz.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEndQuiz = async () => {
    if (quiz?.id) {
      await endQuiz(quiz.id);
      navigate("/quiz-editor");
    }
  };

  const handleStartQuiz = async () => {
    if (quiz?.id) {
      // Final safety check: ensure no scorable questions are missing correct answers
      const invalidQuestions = quiz.questions?.filter(q => 
        q.type !== "Paragraph" && 
        (!q.correctOption || (Array.isArray(q.correctOption) && q.correctOption.length === 0))
      );
      
      if (invalidQuestions && invalidQuestions.length > 0) {
        alert(`Cannot start quiz: ${invalidQuestions.length} questions are missing correct answers. Please edit the quiz to fix them.`);
        return;
      }
      
      setShowStartConfirm(true);
    }
  };

  const confirmStartQuiz = async () => {
    if (!quiz?.id) return;
    setShowStartConfirm(false);
    await startSession(quiz.id);
  };

  const handleRevertToLobby = async () => {
    if (quiz?.id) {
      await cancelStart(quiz.id);
      setShowRevertConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface min-h-screen pb-24 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isStudent = profile?.role?.toLowerCase() === 'student';
  const isAuthor = quiz?.authorId === profile?.id;
  const isLobby = quiz?.status === 'waiting' || quiz?.status === 'starting';

  // If the user is a student OR if they are an educator who does not own the currently active global quiz,
  // we show them the student join dashboard. This prevents educators from accidentally seeing 
  // and managing quizzes they didn't create if they joined one via room code.
  if (isStudent || (quiz && !isAuthor)) {
    return (
      <div className="bg-surface min-h-screen pb-24 overflow-x-hidden pt-24 md:pt-28">
        <TopAppBar />
        <main className="max-w-screen-2xl mx-auto px-6 pt-12 flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="font-headline text-5xl font-extrabold tracking-tight mb-4">Welcome, {profile?.full_name}!</h1>
            <p className="text-on-surface-variant text-xl">Ready to test your knowledge? Join a live quiz session.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-surface-container-lowest p-10 md:p-16 rounded-[3rem] shadow-2xl border border-outline-variant/10 max-w-2xl w-full relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[5rem] -z-10"></div>
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-8">
              <Radio className="w-10 h-10 text-primary animate-pulse" />
            </div>
            
            <h2 className="font-headline text-3xl font-bold mb-6">Enter Room Code</h2>
            <div className="space-y-6">
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-outline group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="e.g. 123456"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full pl-14 pr-6 py-6 bg-surface-container-low border-2 border-outline-variant/30 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all font-headline text-2xl font-black tracking-[0.5em] placeholder:tracking-normal placeholder:font-bold"
                />
              </div>
              
              <button 
                onClick={() => navigate(`/join?code=${roomCode}`)}
                disabled={!roomCode}
                className="w-full py-6 bg-primary text-on-primary font-headline font-bold text-xl rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:scale-100"
              >
                Join Quiz Session
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          </motion.div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
            {[
              { label: "Quizzes Joined", value: "0", icon: Radio, color: "text-blue-500" },
              { label: "Avg. Accuracy", value: "0%", icon: Award, color: "text-amber-500" },
              { label: "Points Earned", value: "0", icon: PlusCircle, color: "text-emerald-500" },
            ].map((stat, i) => (
              <div key={stat.label || `stat-${i}`} className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/5 flex flex-col items-center text-center">
                <stat.icon className={cn("w-8 h-8 mb-3", stat.color)} />
                <div className="text-2xl font-black font-headline">{stat.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{stat.label}</div>
              </div>
            ))}
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  if (!quiz) {
    const hasActiveQuizzes = activeQuizzes.length > 0;

    return (
      <div className="bg-surface min-h-screen pb-24 overflow-x-hidden pt-24 md:pt-28">
        <TopAppBar />
        <main className="max-w-screen-2xl mx-auto px-6 pt-20 flex flex-col items-center justify-center text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container-lowest p-12 rounded-3xl shadow-sm border border-surface-container max-w-lg w-full"
          >
            {hasActiveQuizzes ? (
              <>
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Radio className="w-10 h-10 text-primary animate-pulse" />
                </div>
                <h2 className="font-headline text-3xl font-extrabold mb-4">Active Sessions</h2>
                <p className="text-on-surface-variant mb-8 text-sm">You have {activeQuizzes.length} live sessions running. Select one to monitor responses.</p>
                
                <div className="space-y-3 mb-8">
                  {activeQuizzes.map(q => (
                    <button
                      key={q.id}
                      onClick={() => selectQuiz(q.id!)}
                      className="w-full p-5 bg-surface-container-low hover:bg-surface-container border border-outline-variant/10 rounded-2xl flex items-center justify-between group transition-all"
                    >
                      <div className="text-left">
                        <div className="font-bold text-on-surface group-hover:text-primary transition-colors">{q.title}</div>
                        <div className="text-xs font-black font-headline text-primary/60 tracking-widest">{q.roomCode}</div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-outline group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>

                <Link 
                  to="/quiz-editor"
                  className="inline-flex items-center justify-center gap-2 text-primary font-bold hover:underline"
                >
                  <PlusCircle className="w-4 h-4" />
                  Host another quiz
                </Link>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <PlusCircle className="w-10 h-10 text-primary" />
                </div>
                <h2 className="font-headline text-3xl font-extrabold mb-4">No Active Quiz</h2>
                <p className="text-on-surface-variant mb-8">You haven't created any live sessions yet. Start by building a new quiz for your students.</p>
                <Link 
                  to="/quiz-editor"
                  className="inline-flex items-center justify-center px-8 py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Create New Quiz
                </Link>
              </>
            )}
          </motion.div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  const truncateScore = (score: number) => Math.floor(score * 100) / 100;

  // Calculate dynamic stats
  const totalParticipants = participants.length;
  
  let totalCorrect = 0;
  let totalAnswered = 0;
  
  participants.forEach(p => {
    if (p.answers) {
      Object.entries(p.answers).forEach(([qId, selectedOption]) => {
        const question = (quiz.questions || []).find(q => q.id === qId);
        if (question?.type !== 'Paragraph') {
          if (question?.correctOption === selectedOption) totalCorrect++;
          totalAnswered++;
        }
      });
    }
  });

  const participationRate = totalParticipants > 0 ? 100 : 0;

  // Calculate average raw score for the current quiz
  let totalRawScore = 0;
  let submittedCount = 0;
  participants.forEach(p => {
    if (p.status === 'Submitted') {
      totalRawScore += truncateScore(p.score || 0);
      submittedCount++;
    }
  });
  const avgRawScore = submittedCount > 0 ? Math.round((totalRawScore / submittedCount) * 100) / 100 : 0;
  
  const scorableQuestions = quiz.questions?.filter(q => q.type !== 'Paragraph') || [];
  const totalScorable = scorableQuestions.length;
  const avgPercentage = totalScorable > 0 ? (avgRawScore / totalScorable) * 100 : 0;

  return (
    <div className="bg-surface min-h-screen pb-24 overflow-x-hidden pt-24 md:pt-28">
      <TopAppBar />
      
      <main className="max-w-screen-2xl mx-auto px-6 pt-8">
        {/* Live Session Status */}
        <section className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary font-bold tracking-widest text-xs uppercase mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Live Session Active
            </div>
            <h2 className="font-headline text-4xl font-extrabold tracking-tight">Student Responses</h2>
            <p className="text-on-surface-variant mt-1">Quiz: {quiz.title}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Link 
              to="/quiz-editor"
              className="px-6 py-3 bg-primary text-on-primary font-black font-headline text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Host Another Quiz
            </Link>
          </div>
        </section>

        {/* Session Code Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-container-lowest rounded-3xl p-5 sm:p-8 mb-8 flex flex-col lg:flex-row lg:items-center justify-between shadow-sm border border-surface-container gap-6 sm:gap-8"
        >
          <div className="w-full lg:w-auto">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Room Code</span>
            <div className="text-4xl xs:text-5xl font-black font-headline text-primary tracking-tight">{quiz.roomCode}</div>
            
            {otherActiveQuizzes.length > 0 && (
              <div className="mt-4 relative">
                <button 
                  onClick={() => setShowSwitchQuiz(!showSwitchQuiz)}
                  className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-primary/20 transition-colors"
                >
                  <Radio className="w-3.5 h-3.5" />
                  Switch to Another Active Room ({otherActiveQuizzes.length})
                </button>
                
                <AnimatePresence>
                  {showSwitchQuiz && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 mt-2 w-72 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/10 z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-outline-variant/5 bg-surface-container-low">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Active Sessions</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {otherActiveQuizzes.map(q => (
                          <button
                            key={q.id}
                            onClick={() => {
                              selectQuiz(q.id!);
                              setShowSwitchQuiz(false);
                            }}
                            className="w-full p-4 text-left hover:bg-surface-container-low transition-colors flex items-center justify-between border-b border-outline-variant/5 last:border-0"
                          >
                            <div>
                              <div className="font-bold text-sm text-on-surface truncate pr-2">{q.title}</div>
                              <div className="text-[10px] font-black font-headline text-primary tracking-widest">{q.roomCode}</div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                              <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                                <ArrowRight className="w-4 h-4 text-primary" />
                              </div>
                              <span className={cn(
                                "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                                q.status === 'waiting' ? "bg-amber-500/10 text-amber-600" :
                                q.status === 'starting' ? "bg-primary/10 text-primary animate-pulse" :
                                "bg-emerald-500/10 text-emerald-600"
                              )}>
                                {q.status}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-on-surface-variant">
              <span className="font-bold shrink-0">Live Link:</span>
              <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded max-w-[200px] xs:max-w-xs overflow-hidden">
                <span className="truncate">
                  {window.location.origin}/join?code={quiz.roomCode.replace('-', '')}
                </span>
                <button 
                  onClick={() => {
                    let publicOrigin = window.location.origin;
                    if (publicOrigin.includes('ais-dev')) {
                      publicOrigin = publicOrigin.replace('ais-dev', 'ais-pre');
                    }
                    navigator.clipboard.writeText(`${publicOrigin}/join?code=${quiz.roomCode.replace('-', '')}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-1 hover:bg-surface-container-high rounded transition-colors relative shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  {copied && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: -25 }}
                      exit={{ opacity: 0 }}
                      className="absolute whitespace-nowrap bg-on-surface text-surface text-[8px] py-0.5 px-1 rounded font-bold left-1/2 -translate-x-1/2"
                    >
                      Copied
                    </motion.div>
                  )}
                </button>
              </div>
              <button 
                onClick={() => setShowQr(true)}
                className="p-1.5 bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors shrink-0"
                title="Show Join QR Code"
              >
                <QrCode className="w-4 h-4 text-primary" />
              </button>
            </div>
            {window.location.hostname.includes('ais-dev') && (
              <p className="mt-2 text-[9px] text-emerald-600 font-medium flex items-start gap-1 max-w-sm">
                <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                <span>Note: Preview link uses "ais-pre" for students.</span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-6 w-full lg:w-auto">
            <div className="flex flex-col items-center lg:items-end gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Joined Students</div>
              <div className="flex -space-x-3 justify-center overflow-hidden py-2 max-w-full">
                {participants.slice(0, 5).map((p, i) => {
                  const colors = [
                    'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 
                    'bg-orange-500', 'bg-rose-500', 'bg-indigo-500'
                  ];
                  const colorClass = colors[i % colors.length];
                  const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                  
                  return (
                    <motion.div
                      key={p.roll || `avatar-${i}`}
                      initial={{ scale: 0, x: 20 }}
                      animate={{ scale: 1, x: 0 }}
                      className={cn(
                        "inline-flex items-center justify-center h-10 w-10 rounded-full",
                        "ring-4 ring-surface-container-lowest text-white text-base font-bold shadow-lg shrink-0",
                        colorClass
                      )}
                      title={p.name}
                    >
                      {initial}
                    </motion.div>
                  );
                })}
                
                {participants.length > 5 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex items-center justify-center h-10 w-10 rounded-full ring-4 ring-surface-container-lowest bg-surface-container-high text-on-surface text-xs font-bold shadow-lg z-10 shrink-0"
                  >
                    +{participants.length - 5}
                  </motion.div>
                )}
                
                {participants.length === 0 && (
                  <div className="text-xs text-on-surface-variant opacity-50 italic py-2">Waiting for first join...</div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {quiz.status === 'waiting' && (
                <>
                  <button 
                    onClick={() => navigate(`/quiz-editor?edit=${quiz.id}`)}
                    className="flex-1 sm:flex-none px-6 h-14 rounded-2xl bg-surface-container-low text-on-surface font-headline font-bold hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
                  >
                    Edit Quiz
                  </button>
                  <button 
                    onClick={handleStartQuiz}
                    className="flex-1 sm:flex-none px-8 h-14 rounded-2xl bg-primary text-on-primary font-headline font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Rocket className="w-5 h-5 text-on-primary" />
                    Start Quiz
                  </button>
                </>
              )}
              <button 
                onClick={() => setShowEndConfirm(true)}
                className="flex-1 sm:flex-none px-6 h-14 rounded-2xl bg-error/10 text-error font-headline font-bold hover:bg-error/20 transition-colors flex items-center justify-center gap-2"
              >
                End Quiz
              </button>
            </div>
          </div>
        </motion.div>

        {quiz.status === 'starting' && lobbyCountdown !== null && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary border-2 border-primary-dim p-10 rounded-[3rem] mb-8 flex flex-col items-center justify-center text-center gap-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center animate-bounce mb-2 relative">
               <Rocket className="w-12 h-12 text-white" />
               <div className="absolute -top-2 -right-2 bg-error text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-xl shadow-lg border-2 border-white">
                 {lobbyCountdown}
               </div>
            </div>
            <div>
              <h3 className="font-headline text-4xl font-black text-white mb-2 tracking-tight">Quiz Starting for Everyone!</h3>
              <p className="text-white/80 font-bold text-lg">T-minus {lobbyCountdown} seconds until session goes active.</p>
              
              <div className="mt-6 flex flex-col items-center gap-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Students Ready</div>
                <div className="flex -space-x-3 justify-center overflow-hidden py-2">
                  {participants.slice(0, 5).map((p, i) => {
                    const colors = [
                      'bg-blue-400', 'bg-purple-400', 'bg-emerald-400', 
                      'bg-orange-400', 'bg-rose-400', 'bg-indigo-400'
                    ];
                    const colorClass = colors[i % colors.length];
                    const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                    
                    return (
                      <motion.div
                        key={p.roll || `starting-avatar-${i}`}
                        initial={{ scale: 0, x: 20 }}
                        animate={{ scale: 1, x: 0 }}
                        className={cn(
                          "inline-flex items-center justify-center h-12 w-12 rounded-full",
                          "ring-4 ring-primary text-white text-lg font-bold shadow-lg shrink-0",
                          colorClass
                        )}
                        title={p.name}
                      >
                        {initial}
                      </motion.div>
                    );
                  })}
                  
                  {participants.length > 5 && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="inline-flex items-center justify-center h-12 w-12 rounded-full ring-4 ring-primary bg-white/20 text-white text-sm font-bold shadow-lg z-10 shrink-0 backdrop-blur-sm"
                    >
                      +{participants.length - 5}
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="w-full max-w-md h-3 bg-white/10 rounded-full overflow-hidden mt-2">
              <motion.div 
                key="teacher-lobby-progress"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: LOBBY_COUNTDOWN_SECONDS, ease: "linear" }}
                className="h-full bg-white"
              />
            </div>

            <button 
              onClick={() => setShowRevertConfirm(true)}
              className="mt-4 px-6 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors text-sm flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel Start
            </button>
          </motion.div>
        )}

        {/* End Quiz Confirmation Modal */}
        <AnimatePresence>
          {showEndConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-container-lowest p-8 rounded-3xl shadow-2xl border border-surface-container max-w-md w-full"
              >
                <h3 className="font-headline text-2xl font-extrabold mb-4 text-on-surface">End Quiz?</h3>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  Are you sure you want to end this quiz? No more students will be able to join or submit answers. This action cannot be undone.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowEndConfirm(false)}
                    className="flex-1 py-4 bg-surface-container-low text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleEndQuiz}
                    className="flex-1 py-4 bg-error text-on-error font-headline font-bold rounded-xl shadow-lg shadow-error/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    End Quiz
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Revert Quiz Confirmation Modal */}
        <AnimatePresence>
          {showRevertConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm px-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-container-lowest p-8 rounded-3xl shadow-2xl border border-surface-container max-w-md w-full"
              >
                <h3 className="font-headline text-2xl font-extrabold mb-4 text-on-surface">Revert to Lobby?</h3>
                <p className="text-on-surface-variant mb-8 leading-relaxed text-sm">
                  This will cancel the active session and take all students back to the waiting lobby. Their current progress in this attempt will be lost. Use this if you accidentally started the quiz.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowRevertConfirm(false)}
                    className="flex-1 py-4 bg-surface-container text-on-surface font-bold rounded-xl hover:bg-surface-container-high transition-colors"
                  >
                    Stay Active
                  </button>
                  <button 
                    onClick={handleRevertToLobby}
                    className="flex-1 py-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    Revert Now
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Start Session Confirmation Modal */}
        <AnimatePresence>
          {showStartConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-surface-container-lowest rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden relative"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Radio className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                  <h3 className="font-headline text-2xl font-bold mb-2">Ready to Start?</h3>
                  <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
                    This will start the quiz immediately. Students can still join after the start and continue joining until the quiz end time.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={confirmStartQuiz}
                      className="w-full bg-primary text-on-primary font-headline font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Start Session Now
                    </button>
                    <button
                      onClick={() => setShowStartConfirm(false)}
                      className="w-full bg-surface-container-high text-on-surface font-headline font-bold py-4 rounded-2xl hover:bg-surface-container-highest transition-colors"
                    >
                      Wait, Not Yet
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        
        {/* QR Code Modal */}
        <AnimatePresence>
          {showQr && quiz && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-surface-container-lowest p-10 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-sm w-full relative border border-outline-variant/10"
              >
                <button 
                  onClick={() => setShowQr(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-surface-container-low rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-on-surface-variant" />
                </button>
                
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <QrCode className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-headline text-2xl font-black text-on-surface mb-1">Scan to Join</h3>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Room Code: {quiz.roomCode}</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border-4 border-primary/5 shadow-inner mb-8">
                  <QRCodeSVG 
                    value={`${window.location.hostname.includes('ais-dev') 
                      ? window.location.origin.replace('ais-dev', 'ais-pre') 
                      : window.location.origin}/join?code=${quiz.roomCode.replace('-', '')}`}
                    size={200}
                    level="H"
                    includeMargin={false}
                    imageSettings={{
                      src: "https://picsum.photos/seed/quiz/128/128",
                      x: undefined,
                      y: undefined,
                      height: 40,
                      width: 40,
                      excavate: true,
                    }}
                  />
                </div>

                <p className="text-center text-sm font-medium text-gray-600 px-4">
                  Ask students to scan this QR code with their phone camera to instantly join the session.
                </p>
                
                <div className="mt-8 pt-8 border-t border-gray-100 w-full flex justify-center">
                   <div className="bg-primary/5 px-6 py-3 rounded-2xl">
                     <span className="font-headline font-black text-2xl tracking-[0.2em] text-primary">{quiz.roomCode}</span>
                   </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Overviews Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Participation Overview */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-low p-8 rounded-3xl border-b-4 border-primary"
          >
            <span className="font-label text-xs font-bold uppercase text-on-surface-variant">Participation</span>
            <div className="mt-4">
              <div className="text-4xl font-black font-headline mb-2">{totalParticipants} Students</div>
              <div className="w-full bg-surface-container-highest h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-500" 
                  style={{ width: `${participationRate}%` }}
                ></div>
              </div>
              {quiz.status === 'active' && (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-surface-container-highest/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    <Clock className="w-4 h-4 text-primary" />
                    Time Left
                  </div>
                  <span className="font-headline text-2xl font-black text-primary">
                    {sessionTimeLeft !== null ? formatTime(sessionTimeLeft) : '...'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Average Score Overview */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface-container-low p-8 rounded-3xl border-b-4 border-tertiary"
          >
            <span className="font-label text-xs font-bold uppercase text-on-surface-variant">Average Score</span>
            <div className="mt-4">
              <div className="text-4xl font-black font-headline mb-2">
                {avgRawScore}
                <span className="text-sm text-on-surface-variant/50 ml-1">/{totalScorable}</span>
              </div>
              <div className="w-full bg-surface-container-highest h-3 rounded-full overflow-hidden">
                <div 
                  className="bg-tertiary h-full rounded-full transition-all duration-500" 
                  style={{ width: `${avgPercentage}%` }}
                ></div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Class List Table - Visible in all active monitoring states */}
        {(quiz.status === 'waiting' || quiz.status === 'starting' || quiz.status === 'active') && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-lowest rounded-3xl shadow-[0_20px_40px_rgba(42,43,81,0.03)] overflow-hidden"
          >
            <div className="p-8 border-b border-surface-container flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-headline text-2xl font-bold">Class List</h3>
                <p className="text-on-surface-variant text-xs mt-1">
                  {participants.filter(p => (p.lastSeen && Date.now() - p.lastSeen < 30000) || p.status === 'Submitted').length} / {participants.length} Active
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Live Syncing</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              {participants.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Student</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Roll Number</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Email</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-center">Score</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-center">Current Progress</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {participants.map((student, index) => (
                      <tr key={student.roll || `student-row-${index}`} className="group hover:bg-surface-container-low/30 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">{index + 1}</div>
                            <span className="font-headline font-bold">{student.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="font-medium text-sm text-on-surface-variant">{student.roll}</span>
                        </td>
                        <td className="px-8 py-6">
                          <span className="font-mono text-xs text-on-surface-variant">{student.email || '-'}</span>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="font-headline font-black text-primary">
                            {student.score !== undefined ? truncateScore(student.score) : '-'}<span className="text-[10px] text-on-surface-variant/50 ml-0.5">/{totalScorable}</span>
                          </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="bg-surface-container-highest px-3 py-1 rounded-full text-xs font-bold text-on-surface-variant">
                            {getAnsweredCount(student.answers)}/{quiz.totalQuestions} answered
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className={cn(
                            "flex items-center justify-end gap-2 font-bold text-sm",
                            student.status === 'Submitted' ? 'text-emerald-600' : 'text-primary'
                          )}>
                            <span className={cn(
                              "w-2 h-2 rounded-full",
                              student.status === 'Submitted' ? 'bg-emerald-500' : (
                                (student.lastSeen && Date.now() - student.lastSeen < 30000) ? 'bg-emerald-500 animate-pulse' : 'bg-outline-variant'
                              )
                            )}></span>
                            {student.status === 'Submitted' ? 'Submitted' : (
                              (student.lastSeen && Date.now() - student.lastSeen < 30000) ? 'Online' : 'Offline'
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
                    <PlusCircle className="w-8 h-8 text-outline-variant" />
                  </div>
                  <p className="text-on-surface-variant font-medium">No students have joined yet.</p>
                  <p className="text-xs text-outline-variant mt-1">Share the room code to start the session.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      <BottomNavBar />

      {/* Floating Action Button for Teachers */}
      {!isStudent && (
        <div className="fixed bottom-24 right-6 z-40 md:bottom-10 md:right-10 overflow-visible">
          <Link
            to="/quiz-editor"
            className="group relative flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-primary text-on-primary rounded-2xl shadow-xl shadow-primary/30 hover:scale-110 active:scale-95 transition-all"
            title="Create New Quiz"
          >
            <Plus className="w-8 h-8 md:w-10 md:h-10 transition-transform group-hover:rotate-90" />
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileHover={{ opacity: 1, x: -10 }}
              className="absolute right-full mr-4 hidden md:flex items-center px-4 py-2 bg-on-surface text-surface text-xs font-black font-headline uppercase tracking-widest rounded-xl whitespace-nowrap pointer-events-none"
            >
              Host New Session
            </motion.div>
          </Link>
        </div>
      )}
    </div>
  );
}
