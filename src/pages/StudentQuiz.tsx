import BottomNavBar from "@/src/components/BottomNavBar";
import { Info, CheckCircle2, Loader2, AlertCircle, X, Bot } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect, useRef } from "react";
import { useQuiz, LOBBY_COUNTDOWN_SECONDS, Question } from "@/src/context/QuizContext";
import { useNavigate, useBlocker } from "react-router-dom";
import { cn } from "@/src/lib/utils";
import { Rocket, Clock } from "lucide-react";
import TopAppBar from "@/src/components/TopAppBar";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

const POST_QUIZ_REDIRECT_URL = import.meta.env.VITE_POST_QUIZ_REDIRECT_URL?.trim();
const DEFAULT_POST_QUIZ_REDIRECT_URL = 'https://www.hackerrank.com/online-assesment-1784568940';

function isQuestionAnswered(question: Question, answer: unknown) {
  if (question.type === "Paragraph") {
    return typeof answer === "string" && answer.trim().length > 0;
  }

  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  return typeof answer === "string" && answer.trim().length > 0;
}

function countAnsweredQuestions(questions: Question[], answers: Record<string, any>) {
  return questions.reduce((count, question) => {
    return count + (isQuestionAnswered(question, answers?.[question.id]) ? 1 : 0);
  }, 0);
}

function toMillis(value: any) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export default function StudentQuiz() {
  const {
    quiz,
    currentStudentRoll,
    updateParticipant,
    leaveLobby,
    participants,
    calculateScore,
    loading: quizLoading,
    resetQuiz,
  } = useQuiz();
  const navigate = useNavigate();

  const participant = (participants || []).find(p => p.roll === currentStudentRoll);
  const orderedQuestions = participant?.questionOrder?.length
    ? participant.questionOrder
        .map(id => quiz?.questions?.find(q => q.id === id))
        .filter((q): q is Question => Boolean(q))
    : (quiz?.questions || []);
  const totalQuestions = orderedQuestions.length;

  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [quizEnded, setQuizEnded] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [overallTimeLeft, setOverallTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cheatAttempts, setCheatAttempts] = useState(0);
  const [showCheatWarning, setShowCheatWarning] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [paragraphResponses, setParagraphResponses] = useState<Record<string, string>>({});

  const cheatAttemptsRef = useRef(0);
  const isTrappedRef = useRef(false);
  const finalizingRef = useRef(false);

  const buildCurrentAnswers = () => {
    const currentAnswers = { ...(participant?.answers || {}) };

    orderedQuestions.forEach(question => {
      if (question.type === "Paragraph") {
        currentAnswers[question.id] = paragraphResponses[question.id] ?? currentAnswers[question.id] ?? "";
      }
    });

    return currentAnswers;
  };

  const redirectAfterCompletion = () => {
    const targetUrl = quiz?.redirectUrl?.trim() || POST_QUIZ_REDIRECT_URL || DEFAULT_POST_QUIZ_REDIRECT_URL;

    if (targetUrl) {
      resetQuiz();
      const normalizedUrl = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`;
      window.location.assign(normalizedUrl);
      return;
    }

    navigate("/score");
  };

  const finalizeSubmission = async (reason: "manual" | "expired" | "leave" | "ended" | "disqualified") => {
    if (!currentStudentRoll || !participant || !quiz || finalizingRef.current) return;

    finalizingRef.current = true;
    setSubmitting(true);

    try {
      const finalAnswers = buildCurrentAnswers();
      const answeredCount = countAnsweredQuestions(orderedQuestions, finalAnswers);
      const timeTaken = participant.startTime ? Math.floor((Date.now() - participant.startTime) / 1000) : 0;
      const finalParticipant = { ...participant, answers: finalAnswers };
      const score = calculateScore(finalParticipant, quiz, undefined, true);

      await updateParticipant(currentStudentRoll, {
        status: 'Submitted',
        answers: finalAnswers,
        progress: answeredCount,
        timeTaken,
        score,
        ...(reason === "disqualified"
          ? {
              isDisqualified: true,
              cheatingAttempts: Math.max(cheatAttemptsRef.current, 3),
            }
          : {}),
      });

      setIsFinished(true);

      if (reason === "disqualified") {
        navigate("/score?disqualified=true");
      } else {
        redirectAfterCompletion();
      }
    } catch (err) {
      console.error("Submission failed:", err);
      finalizingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const persistAnswers = async (answers: Record<string, any>) => {
    if (!currentStudentRoll || !participant || finalizingRef.current) return;

    try {
      await updateParticipant(currentStudentRoll, {
        status: 'Appearing',
        answers,
        progress: countAnsweredQuestions(orderedQuestions, answers),
      });
    } catch (err) {
      console.error("Failed to save answer:", err);
    }
  };

  useEffect(() => {
    if (quiz?.status === 'starting' && quiz.startedAt) {
      const startedAt = typeof quiz.startedAt === 'string'
        ? new Date(quiz.startedAt).getTime()
        : (quiz.startedAt.toMillis ? quiz.startedAt.toMillis() : Date.now());

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
    }

    setLobbyCountdown(null);
  }, [quiz?.status, quiz?.startedAt]);

  useEffect(() => {
    cheatAttemptsRef.current = cheatAttempts;
  }, [cheatAttempts]);

  useEffect(() => {
    if (!participant) return;

    if (participant.cheatingAttempts !== undefined && participant.cheatingAttempts > cheatAttempts) {
      const incomingAttempts = participant.cheatingAttempts;
      setCheatAttempts(incomingAttempts);

      if ((incomingAttempts === 1 || incomingAttempts === 2) && quiz?.status === 'active' && !showCheatWarning && !isFinished && !isDisqualified) {
        setShowCheatWarning(true);
      }
    }

    if (participant.isDisqualified && !isDisqualified) {
      setIsDisqualified(true);
    }
  }, [participant?.cheatingAttempts, participant?.isDisqualified, quiz?.status, showCheatWarning, isFinished, isDisqualified, cheatAttempts]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !isFinished &&
      !isDisqualified &&
      quiz?.status === 'active' &&
      totalQuestions > 0 &&
      currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;

    const triggerNavStrike = async () => {
      if (blocker.state !== "blocked") return;

      const newAttempts = cheatAttemptsRef.current + 1;
      setCheatAttempts(newAttempts);

      if (newAttempts <= 2) {
        setShowCheatWarning(true);
        if (currentStudentRoll) {
          await updateParticipant(currentStudentRoll, { cheatingAttempts: newAttempts });
        }
        if (blocker.state === "blocked") {
          blocker.proceed();
        }
      } else {
        await finalizeSubmission("disqualified");
        if (blocker.state === "blocked") {
          blocker.reset();
        }
      }
    };

    triggerNavStrike();
  }, [blocker.state, currentStudentRoll]);

  useEffect(() => {
    if (!currentStudentRoll || isFinished || quizEnded) return;

    const channelName = `quiz_session_${currentStudentRoll}`;
    const channel = new BroadcastChannel(channelName);
    const tabId = Math.random().toString(36).substring(2);

    const handleMessage = (msg: MessageEvent) => {
      if (msg.data.type === 'ALIVE_CHECK' && msg.data.id !== tabId) {
        channel.postMessage({ type: 'I_AM_ALIVE', id: tabId });
      } else if (msg.data.type === 'I_AM_ALIVE' && msg.data.id !== tabId && !isFinished && !quizEnded) {
        console.warn("Multiple tabs detected for roll:", currentStudentRoll);
        navigate("/join?error=user already joined");
      }
    };

    channel.addEventListener('message', handleMessage);

    const checkTimeout = setTimeout(() => {
      channel.postMessage({ type: 'ALIVE_CHECK', id: tabId });
    }, Math.random() * 200 + 50);

    return () => {
      clearTimeout(checkTimeout);
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [currentStudentRoll, isFinished, quizEnded, navigate]);

  useEffect(() => {
    if (!currentStudentRoll || isFinished || quizEnded || isDisqualified || !participant) return;

    const heartbeat = setInterval(async () => {
      try {
        const localSessionToken = sessionStorage.getItem('sessionToken');

        if (participant.sessionToken && localSessionToken && participant.sessionToken !== localSessionToken) {
          console.warn("Session takeover detected or invalid session. Ending current tab session.");
          navigate("/join?error=user already joined");
          return;
        }

        await updateParticipant(currentStudentRoll, { lastSeen: Date.now() });
      } catch (err: any) {
        console.error("Heartbeat failed:", err);
      }
    }, 5000);

    return () => clearInterval(heartbeat);
  }, [currentStudentRoll, isFinished, quizEnded, isDisqualified, participant?.sessionToken, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isFinished && !isDisqualified) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFinished, isDisqualified]);

  useEffect(() => {
    if (!currentStudentRoll || isFinished || quizEnded || isDisqualified || quiz?.status !== 'active' || totalQuestions === 0) return;

    if (!isTrappedRef.current) {
      window.history.pushState(null, "", window.location.href);
      isTrappedRef.current = true;
    }

    const handleCheatAttempt = async () => {
      if (isFinished || quizEnded || isDisqualified || showCheatWarning) return;

      const newAttempts = cheatAttemptsRef.current + 1;
      setCheatAttempts(newAttempts);

      if (newAttempts <= 2) {
        setShowCheatWarning(true);
        await updateParticipant(currentStudentRoll, { cheatingAttempts: newAttempts });
      } else {
        await finalizeSubmission("disqualified");
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleCheatAttempt();
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (!document.hasFocus() && !showCheatWarning) {
          handleCheatAttempt();
        }
      }, 200);
    };

    const handlePopState = () => {
      if (!isFinished && !isDisqualified && quiz?.status) {
        window.history.pushState(null, "", window.location.href);
        handleCheatAttempt();
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentStudentRoll, isFinished, quizEnded, isDisqualified, quiz?.status, showCheatWarning, totalQuestions]);

  useEffect(() => {
    if (quiz?.status !== 'active' || isFinished || quizEnded) {
      setOverallTimeLeft(null);
      return;
    }

    const explicitEndsAt = toMillis(quiz.endsAt);
    const startedAt = toMillis(quiz.startedAt);
    const fallbackEndsAt = startedAt && quiz.customTimer ? startedAt + Number(quiz.customTimer) * 1000 : null;
    const endsAt = explicitEndsAt || fallbackEndsAt;

    if (!endsAt || !Number.isFinite(endsAt)) {
      setOverallTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const remaining = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setOverallTimeLeft(remaining);
      return remaining;
    };

    calculateTimeLeft();
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [quiz?.endsAt, quiz?.startedAt, quiz?.customTimer, quiz?.status, isFinished, quizEnded]);

  useEffect(() => {
    if (overallTimeLeft === 0 && !isFinished && !quizEnded && !submitting) {
      finalizeSubmission("expired");
    }
  }, [overallTimeLeft, isFinished, quizEnded, submitting]);

  useEffect(() => {
    if (!quizLoading) {
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [quizLoading]);

  useEffect(() => {
    if (quizLoading || isInitializing) return;

    if (!quiz || !currentStudentRoll) {
      navigate("/join");
      return;
    }

    if (!participant) {
      console.warn("Participant record missing after sync period. Redirecting to join.");
      navigate("/join");
      return;
    }

    const explicitEndsAt = toMillis(quiz?.endsAt);
    const startedAt = toMillis(quiz?.startedAt);
    const quizEndsAt = explicitEndsAt || (startedAt && quiz?.customTimer ? startedAt + Number(quiz.customTimer) * 1000 : null);

    if ((quiz.status === 'finished' || (quizEndsAt && quizEndsAt <= Date.now())) && !isFinished && !finalizingRef.current) {
      setQuizEnded(true);
      finalizeSubmission("ended");
    }
  }, [quiz, currentStudentRoll, navigate, quizLoading, isFinished, participant, isInitializing]);

  useEffect(() => {
    if (!participant || orderedQuestions.length === 0) return;

    setParagraphResponses(prev => {
      const next = { ...prev };
      let changed = false;

      orderedQuestions.forEach(question => {
        if (question.type !== "Paragraph") return;
        if (!(question.id in next)) {
          next[question.id] = typeof participant.answers?.[question.id] === "string" ? participant.answers[question.id] : "";
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [participant?.answers, orderedQuestions.length]);

  useEffect(() => {
    if (!participant || !currentStudentRoll || isFinished || quizEnded || quiz?.status !== 'active') return;

    const paragraphQuestions = orderedQuestions.filter(question => question.type === "Paragraph");
    if (paragraphQuestions.length === 0) return;

    const timer = setTimeout(async () => {
      const currentAnswers = participant.answers || {};
      let nextAnswers: Record<string, any> | null = null;

      paragraphQuestions.forEach(question => {
        const draft = paragraphResponses[question.id] ?? "";
        const existing = typeof currentAnswers[question.id] === "string" ? currentAnswers[question.id] : "";

        if (draft !== existing) {
          if (!nextAnswers) {
            nextAnswers = { ...currentAnswers };
          }
          nextAnswers[question.id] = draft;
        }
      });

      if (nextAnswers) {
        await persistAnswers(nextAnswers);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [paragraphResponses, participant?.answers, currentStudentRoll, isFinished, quizEnded, quiz?.status, orderedQuestions]);

  const handleOptionSelect = async (question: Question, optionId: string) => {
    if (!participant || submitting || overallTimeLeft === 0) return;

    const currentAnswers = participant.answers || {};
    const currentValue = currentAnswers[question.id];

    let nextAnswer: string | string[] = optionId;
    if (question.type === "Multiple Correct" || question.type === "MSQ") {
      const selected = Array.isArray(currentValue) ? currentValue : [];
      nextAnswer = selected.includes(optionId)
        ? selected.filter(id => id !== optionId)
        : [...selected, optionId];
    }

    await persistAnswers({ ...currentAnswers, [question.id]: nextAnswer });
  };

  const handleParagraphChange = (questionId: string, value: string) => {
    setParagraphResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleLeaveLobby = async () => {
    if (!currentStudentRoll) return;
    try {
      await leaveLobby(currentStudentRoll);
      navigate("/join");
    } catch (err) {
      console.error("Failed to leave lobby:", err);
    }
  };

  const handleLeaveQuiz = async () => {
    setShowLeaveWarning(false);
    await finalizeSubmission("leave");
  };

  if (quizLoading || (currentStudentRoll && !participant && isInitializing)) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-on-surface-variant font-bold animate-pulse text-lg tracking-tight">Syncing session...</p>
        <p className="text-on-surface-variant/60 text-xs font-medium">Please wait while we connect you to the quiz.</p>
      </div>
    );
  }

  if (!quiz || !currentStudentRoll || !participant) {
    if (isInitializing) return null;
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-3xl flex items-center justify-center mx-auto shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <div className="space-y-2">
          <p className="text-on-surface font-black text-2xl tracking-tight">Waiting for session sync...</p>
          <p className="text-on-surface-variant font-medium text-sm max-w-xs mx-auto">This usually takes a few seconds. If you're stuck, please try to rejoin.</p>
        </div>
        <button
          onClick={() => navigate("/join")}
          className="px-8 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg shadow-primary/20"
        >
          Back to Join Page
        </button>
      </div>
    );
  }

  if (quiz.status === 'waiting' || (quiz.status === 'starting' && lobbyCountdown !== null && lobbyCountdown > 0)) {
    return (
      <div className="bg-surface min-h-screen flex flex-col">
        <TopAppBar />
        <main className="flex-grow flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-[50rem] h-[50rem] rounded-full bg-primary/5 blur-[120px] -z-10 animate-pulse"></div>

          <div className="w-full max-w-xl text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-surface-container-lowest p-12 rounded-[4rem] shadow-2xl border border-outline-variant/10 relative"
            >
              <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8 relative">
                {quiz.status === 'starting' ? (
                  <Rocket className="w-12 h-12 text-primary animate-bounce" />
                ) : (
                  <Clock className="w-12 h-12 text-primary animate-pulse" />
                )}
                {quiz.status === 'starting' && (
                  <div className="absolute -top-2 -right-2 bg-error text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
                    {lobbyCountdown}
                  </div>
                )}
              </div>

              <h2 className="font-headline text-4xl font-extrabold mb-4 tracking-tight">
                {quiz.status === 'starting' ? "Get Ready!" : "Welcome to the Lobby"}
              </h2>
              <p className="text-on-surface-variant text-xl mb-12 font-medium">
                {quiz.status === 'starting'
                  ? "The quiz is about to begin. Entry is now locked."
                  : "Waiting for the session to start..."}
              </p>

              <div className="space-y-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Joined Students</div>
                  <div className="flex -space-x-3 justify-center overflow-hidden py-2">
                    {(participants || []).slice(0, 5).map((p, i) => {
                      const colors = [
                        'bg-blue-500', 'bg-purple-500', 'bg-emerald-500',
                        'bg-orange-500', 'bg-rose-500', 'bg-indigo-500',
                        'bg-amber-500', 'bg-cyan-500'
                      ];
                      const colorClass = colors[i % colors.length];
                      const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';

                      return (
                        <motion.div
                          key={p.roll || `lobby-avatar-${i}`}
                          initial={{ scale: 0, x: 20 }}
                          animate={{ scale: 1, x: 0 }}
                          className={cn(
                            "inline-flex items-center justify-center h-12 w-12 rounded-full",
                            "ring-4 ring-surface-container-lowest text-white text-lg font-bold shadow-lg shrink-0",
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
                        className="inline-flex items-center justify-center h-12 w-12 rounded-full ring-4 ring-surface-container-lowest bg-surface-container-high text-on-surface text-sm font-bold shadow-lg z-10 shrink-0"
                      >
                        +{participants.length - 5}
                      </motion.div>
                    )}
                  </div>
                  <div className="text-center mt-1 w-full max-w-sm">
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest leading-none mb-6">
                      {participants.length} {participants.length === 1 ? 'student' : 'students'} joined
                    </p>

                    <div className="bg-surface-container-low/30 rounded-2xl overflow-hidden border border-outline-variant/10 text-left">
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-surface-container-low shadow-sm z-20">
                            <tr>
                              <th className="px-4 py-2 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant">Name</th>
                              <th className="px-4 py-2 text-[8px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/10">
                            {(participants || []).map((p, i) => (
                              <tr key={p.roll || i} className="bg-transparent border-b border-outline-variant/5 last:border-0">
                                <td className="px-4 py-3 text-xs font-bold text-on-surface truncate max-w-[120px]">{p.name}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      (p.lastSeen && Date.now() - p.lastSeen < 30000) ? "bg-emerald-500 animate-pulse" : "bg-outline-variant"
                                    )}></span>
                                    <span className="text-[10px] font-medium text-on-surface-variant">
                                      {(p.lastSeen && Date.now() - p.lastSeen < 30000) ? "Joined" : "Offline"}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {quiz.status === 'starting' && (
                  <div className="w-full h-3 bg-surface-container-low rounded-full overflow-hidden mt-8">
                    <motion.div
                      key="lobby-progress"
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: LOBBY_COUNTDOWN_SECONDS, ease: "linear" }}
                      className="h-full bg-primary"
                    />
                  </div>
                )}
              </div>

              {quiz.status === 'waiting' && (
                <button
                  onClick={handleLeaveLobby}
                  className="mt-12 text-on-surface-variant font-headline font-bold hover:text-error transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                  <X className="w-4 h-4" />
                  Leave Quiz Room
                </button>
              )}
            </motion.div>

            <p className="mt-12 text-on-surface-variant font-medium flex items-center justify-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              Quiz: <span className="font-bold text-on-surface">{quiz.title}</span>
            </p>
          </div>
        </main>
        <BottomNavBar />
      </div>
    );
  }

  if (quiz.status === 'active' && totalQuestions === 0) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Bot className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <div className="space-y-2">
          <p className="text-on-surface font-black text-2xl tracking-tight">Loading Questions...</p>
          <p className="text-on-surface-variant font-medium text-sm">We're retrieving your quiz content.</p>
        </div>
      </div>
    );
  }

  const answeredCount = countAnsweredQuestions(orderedQuestions, buildCurrentAnswers());
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const timerProgress = overallTimeLeft !== null && quiz.customTimer ? (overallTimeLeft / quiz.customTimer) * 100 : undefined;
  const isTimeLow = overallTimeLeft !== null && quiz.customTimer !== undefined && overallTimeLeft <= Math.min(60, Math.max(15, Math.floor(quiz.customTimer * 0.1)));
  const isExpired = overallTimeLeft === 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-surface min-h-screen pb-24 flex flex-col pt-24 md:pt-28">
      <TopAppBar
        variant="quiz"
        progress={progressPercent}
        currentTask={`Answered ${answeredCount} of ${totalQuestions}`}
        timeLeft={overallTimeLeft !== null ? formatTime(overallTimeLeft) : "..."}
        timerProgress={timerProgress}
        isLowTime={isTimeLow}
        onLogoClick={() => setShowLeaveWarning(true)}
      />

      <AnimatePresence>
        {showCheatWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface rounded-[2.5rem] p-10 shadow-2xl border border-error/20 max-w-lg w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-error animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="font-headline text-3xl font-black text-on-surface">Cheating Warning!</h3>
                <p className="text-on-surface-variant font-medium text-lg leading-relaxed">
                  You switched tabs or minimized the window. This is strictly prohibited.
                </p>
              </div>
              <div className="bg-error/5 p-6 rounded-2xl border border-error/10">
                <p className="text-error font-bold">
                  {cheatAttempts === 1
                    ? "Warning 1 of 2: Please stay on this screen to ensure your responses are recorded correctly."
                    : cheatAttempts === 2
                    ? "LAST warning: This is your second attempt. Repeating this one more time will result in immediate disqualification."
                    : "You are being disqualified for repeated violations."}
                </p>
              </div>
              <button
                onClick={() => setShowCheatWarning(false)}
                className="w-full py-4 bg-error text-white font-headline font-bold rounded-xl shadow-lg shadow-error/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                I Understand
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="flex-grow flex flex-col items-center justify-start p-6 md:p-12 max-w-5xl mx-auto w-full gap-8">
        <section className="w-full bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 font-headline">Quiz Summary</p>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">{quiz.title}</h1>
              <p className="text-on-surface-variant font-medium">
                Answer the questions in any order. Students can join until the shared quiz end time, and the quiz will submit automatically when that time is reached.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 min-w-[260px]">
              <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Questions</p>
                <p className="font-headline font-black text-3xl text-on-surface mt-2">{totalQuestions}</p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Answered</p>
                <p className="font-headline font-black text-3xl text-primary mt-2">{answeredCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full space-y-6">
          {orderedQuestions.map((question, index) => {
            const selectedOption = participant.answers?.[question.id];
            const paragraphValue = paragraphResponses[question.id] ?? (typeof participant.answers?.[question.id] === "string" ? participant.answers[question.id] : "");
            const wordCount = paragraphValue.trim().split(/\s+/).filter(word => word.length > 0).length;
            const optionLabels = participant.optionOrders?.[question.id]
              || (question.type === "True/False" ? ['A', 'B'] : ['A', 'B', 'C', 'D']);

            return (
              <motion.section
                key={question.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-surface-container-lowest p-6 sm:p-8 rounded-3xl border border-outline-variant/10 shadow-sm space-y-6",
                  isExpired && "opacity-70"
                )}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 font-headline mb-2">Question {index + 1}</p>
                    <div className="inline-flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/10 text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                      {question.type}
                    </div>
                  </div>
                  {isQuestionAnswered(question, participant.answers?.[question.id] ?? paragraphValue) && (
                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-700 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                      Answered
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {question.image && (
                    <div className="w-full">
                      <img src={question.image} alt="Question" className="max-w-full h-auto rounded-2xl mx-auto shadow-sm border border-outline-variant/10" />
                    </div>
                  )}
                  <div className="prose prose-invert max-w-none prose-sm md:prose-base text-on-surface">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                      {question.text || `Question ${index + 1}`}
                    </ReactMarkdown>
                  </div>
                </div>

                {question.type === "Paragraph" ? (
                  <div className="group relative bg-surface-container-low rounded-2xl p-1 transition-all duration-300">
                    <div className="absolute -inset-0.5 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl blur-sm opacity-50 group-focus-within:opacity-100 transition-opacity"></div>
                    <div className="relative bg-surface-container-lowest rounded-[14px] overflow-hidden">
                      <textarea
                        value={paragraphValue}
                        onChange={(e) => handleParagraphChange(question.id, e.target.value)}
                        disabled={isExpired || submitting}
                        className="w-full h-56 p-8 bg-transparent border-none focus:ring-0 font-body text-lg leading-relaxed text-on-surface placeholder:text-outline-variant resize-none"
                        placeholder={isExpired ? "The quiz timer has ended." : "Type your explanation here..."}
                      />
                      <div className="px-8 py-4 bg-surface-container-low/50 flex justify-between items-center border-t border-outline-variant/10">
                        <span className="text-xs font-label text-on-surface-variant flex items-center gap-2">
                          <Info className="w-4 h-4" />
                          Maximum 50 words
                        </span>
                        <span className={cn(
                          "text-xs font-label",
                          wordCount > 50 ? "text-error font-bold" : "text-on-surface-variant"
                        )}>{wordCount}/50 words</span>
                      </div>
                    </div>
                    {wordCount > 50 && !isExpired && (
                      <p className="text-error text-xs font-bold mt-2 px-2">Please reduce your answer to 50 words or less.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {optionLabels
                      .filter(label => question.type !== "True/False" || label === 'A' || label === 'B')
                      .map((label, optionIndex) => {
                        const isSelected = Array.isArray(selectedOption)
                          ? selectedOption.includes(label)
                          : selectedOption === label;

                        return (
                          <button
                            key={label}
                            onClick={() => !isExpired && !submitting && handleOptionSelect(question, label)}
                            disabled={isExpired || submitting}
                            className={cn(
                              "w-full p-4 rounded-2xl text-left font-headline font-bold text-lg transition-all border-2 flex items-center justify-between group",
                              isSelected
                                ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm"
                                : "bg-surface-container-lowest border-outline-variant/10 text-on-surface hover:border-primary/30",
                              (isExpired || submitting) && "cursor-not-allowed"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors",
                                isSelected ? "bg-emerald-500 text-white" : "bg-surface-container-low text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary"
                              )}>
                                {String.fromCharCode(65 + optionIndex)}
                              </div>
                              <span className="text-base">{question.options[label] || `Option ${label}`}</span>
                            </div>
                            <div className={cn(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                              isSelected ? "bg-emerald-500 border-emerald-500" : "border-outline-variant/30"
                            )}>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </motion.section>
            );
          })}
        </section>

        <section className="w-full bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 shadow-sm space-y-4 text-center">
          <p className="text-on-surface font-headline font-bold">
            {isExpired ? "The quiz timer has ended." : "You can review every question before submitting."}
          </p>
          <p className="text-xs text-on-surface-variant font-medium">
            {isExpired ? "Your responses are being submitted automatically." : "Unanswered questions will be treated as skipped when you submit."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => finalizeSubmission("manual")}
              disabled={submitting || isExpired}
              className="px-8 py-4 bg-primary text-on-primary font-headline font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? "Submitting..." : "Submit Quiz"}
            </button>
            <button
              onClick={() => setShowLeaveWarning(true)}
              className="px-8 py-4 text-on-surface-variant font-headline font-bold hover:text-error transition-colors"
            >
              Leave Quiz
            </button>
          </div>
        </section>

        <AnimatePresence>
          {showLeaveWarning && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-container-lowest p-8 rounded-3xl shadow-2xl border border-surface-container max-w-md w-full"
              >
                <h3 className="font-headline text-2xl font-extrabold mb-4 text-on-surface">Leave Quiz?</h3>
                <p className="text-on-surface-variant mb-8">
                  If you leave now, your quiz will be submitted with your current answers. Any unanswered questions will be marked as skipped.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowLeaveWarning(false)}
                    className="flex-1 py-4 bg-surface-container-low text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container transition-all"
                  >
                    Stay
                  </button>
                  <button
                    onClick={handleLeaveQuiz}
                    className="flex-1 py-4 bg-error text-on-error font-headline font-bold rounded-xl shadow-lg shadow-error/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Submit & Leave
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <div className="fixed bottom-0 left-0 -z-10 w-full h-1/2 overflow-hidden opacity-30 pointer-events-none">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1440 320">
          <path d="M0,160L48,176C96,192,192,224,288,213.3C384,203,480,149,576,149.3C672,149,768,203,864,213.3C960,224,1056,192,1152,176C1248,160,1344,160,1392,160L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="#809bff" fillOpacity="0.1"></path>
        </svg>
      </div>
    </div>
  );
}
