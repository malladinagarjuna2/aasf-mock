import TopAppBar from "@/src/components/TopAppBar";
import BottomNavBar from "@/src/components/BottomNavBar";
import { BarChart3, Users, Award, ChevronRight, Search, ClipboardList, Trash2, Download, MessageSquare, RefreshCw, Unlock, FileText, Eye, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuiz, Participant, Quiz, Question } from "@/src/context/QuizContext";
import { cn, exportResultsToCSV } from "@/src/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, collectionGroup, getDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, isDemoMode } from "../firebase";
import { useAuth, isAdminEmail } from "../context/AuthContext";
import { mockStore } from "../lib/mockStore";

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

const getAnsweredCount = (answers: Record<string, any> = {}) => Object.values(answers).filter(answer => {
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === 'string' ? answer.trim().length > 0 : Boolean(answer);
}).length;

export default function Reports() {
  const { quizzes: authoredQuizzes, calculateScore: getRawScore, loading: quizLoading, deleteQuiz, resetParticipantSession } = useQuiz();
  const { user, profile } = useAuth();
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [studentQuizzes, setStudentQuizzes] = useState<Quiz[]>([]);
  const [quizQuestionsMap, setQuizQuestionsMap] = useState<Record<string, Question[]>>({});
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [gradingParticipant, setGradingParticipant] = useState<Participant | null>(null);
  const [gradingValues, setGradingValues] = useState<Record<string, number>>({});
  const [viewingSubmission, setViewingSubmission] = useState<Participant | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedQuizIds, setSelectedQuizIds] = useState<string[]>([]);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [showQueriesOnly, setShowQueriesOnly] = useState(false);
  const [viewingQuestionPaper, setViewingQuestionPaper] = useState(false);
  const { gradeParticipant } = useQuiz();

  const isAdmin = profile?.role?.toLowerCase() === 'admin' || isAdminEmail(user?.email);
  const isTeacher = profile?.role?.toLowerCase() === 'educator' || profile?.role?.toLowerCase() === 'teacher' || isAdmin;

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!user) {
        setLoadingParticipants(false);
        return;
      }
      
      setLoadingParticipants(true);
      try {
        if (isDemoMode) {
          if (isTeacher) {
            const participantsList: Participant[] = [];
            authoredQuizzes.forEach(quiz => {
              if (quiz.id) {
                const res = mockStore.getResponsesForQuiz(quiz.id);
                participantsList.push(...res);
              }
            });
            if (isMounted) setAllParticipants(participantsList);
          } else {
            const allRes = mockStore.getAllResponses();
            const myRes = allRes.filter(r => r.studentId === user.uid || r.roll === profile?.roll);
            if (isMounted) setAllParticipants(myRes);
          }
          if (isMounted) setLoadingParticipants(false);
          return;
        }

        if (isTeacher) {
          // TEACHER / ADMIN LOGIC: Fetch responses for all quizzes in authoredQuizzes
          if (authoredQuizzes.length === 0) {
            setAllParticipants([]);
            setLoadingParticipants(false);
            return;
          }

          const results = await Promise.all(authoredQuizzes.map(async (quiz) => {
            if (!quiz.id) return { quizId: '', responses: [] };
            const responsesRef = collection(db, 'quizzes', quiz.id, 'responses');
            const snapshot = await getDocs(responsesRef);
            return { 
              quizId: quiz.id, 
              responses: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Participant))
            };
          }));

          if (!isMounted) return;
          const participantsList: Participant[] = [];
          results.forEach(res => { if (res.quizId) participantsList.push(...res.responses); });
          setAllParticipants(participantsList);
        } else {
          // STUDENT LOGIC: Fetch only THEIR responses across all quizzes
          const responsesQuery = query(
            collectionGroup(db, 'responses'),
            where('studentId', '==', user.uid)
          );
          
          let snapshot;
          try {
            snapshot = await getDocs(responsesQuery);
          } catch (err) {
            handleFirestoreError(err, OperationType.LIST, 'responses_collection_group');
            return;
          }

          if (!isMounted) return;

          const myResponses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Participant));

          setAllParticipants(myResponses);

          // Fetch Quiz details for these responses
          const quizIds = [...new Set(myResponses.map(r => r.quizId).filter(id => !!id) )] as string[];
          const quizResults = await Promise.all(quizIds.map(async (id) => {
            try {
              const quizRef = doc(db, 'quizzes', id);
              const quizSnap = await getDoc(quizRef);
              if (quizSnap.exists()) {
                return { id: quizSnap.id, ...quizSnap.data() } as Quiz;
              }
            } catch (err) {
              console.warn(`Could not fetch quiz ${id}:`, err);
            }
            return null;
          }));

          if (!isMounted) return;
          setStudentQuizzes(quizResults.filter(q => q !== null) as Quiz[]);
        }
      } catch (err) {
        if (isMounted) {
          handleFirestoreError(err, OperationType.LIST, isTeacher ? 'authored_quizzes_responses' : 'student_history_fetch');
        }
      } finally {
        if (isMounted) {
          setLoadingParticipants(false);
        }
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [user, JSON.stringify(authoredQuizzes.map(q => q.id)), refreshTrigger, isTeacher]);

  const effectiveQuizzes = isTeacher ? authoredQuizzes : studentQuizzes;

  // Fetch questions ONLY when a quiz is selected
  useEffect(() => {
    if (!selectedQuiz?.id) return;
    
    // If questions already exist in map, don't re-fetch unless it's a refresh?
    // Actually, simple check is fine.
    const fetchQuestions = async () => {
      if (quizQuestionsMap[selectedQuiz.id!]) return;
      
      try {
        const questionsRef = collection(db, 'quizzes', selectedQuiz.id!, 'questions');
        const questionsSnapshot = await getDocs(questionsRef);
        const questions = questionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Question[];
        
        setQuizQuestionsMap(prev => ({
          ...prev,
          [selectedQuiz.id!]: questions
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'questions');
      }
    };

    fetchQuestions();
  }, [selectedQuiz?.id]);

  const getParticipantPercentage = (participant: Participant, quiz: Quiz) => {
    const questionsCount = quiz.drawCount || quiz.totalQuestions || quiz.questions?.length || 0;
    if (questionsCount === 0) return 0;
    
    // Use saved score if available, otherwise 0
    const rawScore = participant.score || 0;
    return Math.round((rawScore / questionsCount) * 100);
  };

  const stats = useMemo(() => {
    const totalParticipants = allParticipants.length;
    
    let totalScore = 0;
    let scoredParticipants = 0;

    allParticipants.forEach(p => {
      const quiz = (effectiveQuizzes || []).find(q => q.id === p.quizId);
      if (quiz && (p.status === 'Submitted' || p.isDisqualified)) {
        totalScore += getParticipantPercentage(p, quiz);
        scoredParticipants++;
      }
    });

    const avgScore = scoredParticipants > 0 ? Math.round(totalScore / scoredParticipants) : 0;
    
    return {
      totalQuizzes: effectiveQuizzes.length,
      totalParticipants,
      avgScore: `${avgScore}%`
    };
  }, [effectiveQuizzes, allParticipants, quizQuestionsMap]);

  const filteredQuizzes = useMemo(() => {
    return [...effectiveQuizzes]
      .filter(q => q.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [effectiveQuizzes, searchQuery]);

  const getQuizStats = (quiz: Quiz) => {
    const participants = allParticipants.filter(p => p.quizId === quiz.id);
    const submitted = participants.filter(p => p.status === 'Submitted' || p.isDisqualified);
    const denominator = quiz.drawCount || quiz.totalQuestions || 0;
    
    let totalRawScore = 0;
    let maxRawScore = 0;
    let minRawScore = submitted.length > 0 ? denominator : 0;

    submitted.forEach(p => {
      const rawScore = p.score || 0;
      totalRawScore += rawScore;
      if (rawScore > maxRawScore) maxRawScore = rawScore;
      if (rawScore < minRawScore) minRawScore = rawScore;
    });

    const avgRawScore = submitted.length > 0 ? Math.round((totalRawScore / submitted.length) * 100) / 100 : 0;
    const avgPercentage = denominator > 0 ? Math.round((avgRawScore / denominator) * 100) : 0;
    
    return {
      count: participants.length,
      avgRawScore,
      avgPercentage,
      maxRawScore,
      minRawScore: submitted.length > 0 ? minRawScore : 0,
      denominator,
      date: quiz.createdAt ? (quiz.createdAt.toDate ? quiz.createdAt.toDate().toLocaleDateString() : new Date(quiz.createdAt).toLocaleDateString()) : 'N/A'
    };
  };

  const handleDownloadQuestionPaper = (quiz: Quiz) => {
    const questions = quizQuestionsMap[quiz.id!] || quiz.questions || [];
    let content = `QUESTION PAPER: ${quiz.title}\n`;
    content += `Room Code: ${quiz.roomCode}\n`;
    content += `Total Questions: ${questions.length}\n`;
    content += `Date Generated: ${new Date().toLocaleString()}\n`;
    content += `========================================\n\n`;

    questions.forEach((q, idx) => {
      content += `${idx + 1}. ${q.text}\n`;
      if (q.image) content += `   [IMAGE ATTACHED]\n`;
      content += `   Type: ${q.type}\n`;
      if (q.options && Object.keys(q.options).length > 0) {
        content += `   Options:\n`;
        Object.entries(q.options).forEach(([label, text]) => {
          content += `      (${label}) ${text}\n`;
        });
      }
      content += `   Correct Answer: ${
        q.type === 'Paragraph' ? "Manual Grading / Descriptive" : (
          Array.isArray(q.correctOption) 
            ? q.correctOption.map(label => q.options?.[label] ? `${label}: ${q.options[label]}` : label).join(", ") 
            : (q.options?.[q.correctOption as string] ? `${q.correctOption}: ${q.options[q.correctOption as string]}` : q.correctOption)
        )
      }\n`;
      content += `----------------------------------------\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Question_Paper_${quiz.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkDelete = async () => {
    if (selectedQuizIds.length === 0) return;
    
    setLoadingParticipants(true);
    try {
      for (const id of selectedQuizIds) {
        await deleteQuiz(id);
      }
      setRefreshTrigger(prev => prev + 1);
      setSelectedQuizIds([]);
      setIsBulkDelete(false);
      setShowDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'quizzes');
    } finally {
      setLoadingParticipants(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedQuizIds.length === filteredQuizzes.length) {
      setSelectedQuizIds([]);
    } else {
      setSelectedQuizIds(filteredQuizzes.map(q => q.id!));
    }
  };

  const toggleSelectQuiz = (quizId: string) => {
    setSelectedQuizIds(prev => 
      prev.includes(quizId) 
        ? prev.filter(id => id !== quizId) 
        : [...prev, quizId]
    );
  };

  const handleDeleteQuiz = async (quizId: string) => {
    await deleteQuiz(quizId);
    setAllParticipants(prev => prev.filter(p => p.quizId !== quizId));
    setShowDeleteConfirm(null);
    setSelectedQuiz(null);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const isInitialLoading = (quizLoading || loadingParticipants) && allParticipants.length === 0;

  if (isInitialLoading) {
    return (
      <div className="bg-surface min-h-screen pb-24 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-on-surface-variant font-medium animate-pulse">Syncing quiz intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen pb-24 flex flex-col pt-24 md:pt-28">
      <TopAppBar />
      
      <main className="flex-grow p-6 md:p-12 max-w-7xl mx-auto w-full relative">
        {loadingParticipants && allParticipants.length > 0 && (
          <div className="absolute top-4 right-6 z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest border border-primary/20 backdrop-blur-sm shadow-lg">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing...
            </div>
          </div>
        )}
        {selectedQuiz ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <button 
              onClick={() => setSelectedQuiz(null)}
              className="flex items-center gap-2 text-primary font-bold hover:underline mb-4"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to All Reports
            </button>

            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-2">{selectedQuiz.title}</h1>
                <p className="text-on-surface-variant font-body text-lg">Detailed performance analysis for room code <span className="font-mono font-bold text-primary">{selectedQuiz.roomCode}</span></p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button 
                    onClick={() => {
                      const parts = allParticipants.filter(p => p.quizId === selectedQuiz.id);
                      const denom = selectedQuiz.drawCount || selectedQuiz.totalQuestions || 0;
                      exportResultsToCSV(selectedQuiz.title, selectedQuiz.roomCode, parts, denom);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 rounded-xl font-bold text-sm hover:bg-emerald-500/20 transition-all border border-emerald-500/20 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </button>
                  <button 
                    onClick={() => setViewingQuestionPaper(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-500/20 transition-all border border-indigo-500/20"
                  >
                    <FileText className="w-4 h-4" />
                    {isTeacher ? "View Question Paper" : "View Questions"}
                  </button>
                  {isTeacher && (
                    <button 
                      onClick={() => setShowDeleteConfirm(selectedQuiz.id || null)}
                      disabled={selectedQuiz.isActive}
                      className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl font-bold text-sm hover:bg-error/20 transition-all disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Quiz
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                    {isTeacher ? "Average Score" : "Your Final Score"}
                  </p>
                  <p className="text-3xl font-headline font-black text-primary">
                    {isTeacher ? getQuizStats(selectedQuiz).avgRawScore : ((allParticipants || []).find(p => p.quizId === selectedQuiz.id)?.score || 0)}
                    <span className="text-sm text-on-surface-variant/50 ml-1">/{selectedQuiz.drawCount || selectedQuiz.totalQuestions}</span>
                  </p>
                </div>
                <div className="w-px h-12 bg-outline-variant/30 mx-2"></div>
                <div className="text-right">
                  <p className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                    {isTeacher ? "Participants" : "Rank"}
                  </p>
                  <p className="text-3xl font-headline font-black text-on-surface">
                    {isTeacher ? getQuizStats(selectedQuiz).count : "1"}
                  </p>
                </div>
              </div>
            </header>

            <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
                <h2 className="font-headline font-bold text-xl text-on-surface">
                  {isTeacher ? "Student Performance" : "Your Submission"}
                </h2>
                {isTeacher && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowQueriesOnly(!showQueriesOnly)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                        showQueriesOnly ? "bg-error text-white shadow-lg shadow-error/20" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {showQueriesOnly ? "Showing Queries" : "Filter Queries"}
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">
                        {isTeacher ? "Rank" : "#"}
                      </th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">
                        {isTeacher ? "Student" : "Name"}
                      </th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Roll Number</th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Email</th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Progress</th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Score</th>
                      <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {allParticipants
                      .filter(p => p.quizId === selectedQuiz.id)
                      .filter(p => !showQueriesOnly || (p.query && p.query.trim().length > 0))
                      .sort((a, b) => getParticipantPercentage(b, selectedQuiz) - getParticipantPercentage(a, selectedQuiz))
                      .map((p, index) => {
                        const score = getParticipantPercentage(p, selectedQuiz);
                        return (
                          <tr 
                            key={p.id} 
                            onClick={() => setViewingSubmission(p)}
                            className="hover:bg-surface-container-low/30 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-5">
                              <span className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                                index === 0 ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" : 
                                index === 1 ? "bg-slate-300 text-slate-700" : 
                                index === 2 ? "bg-amber-700/20 text-amber-900" : "bg-surface-container-low text-on-surface-variant"
                              )}>
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                <span className="font-headline font-bold text-on-surface">{p.name}</span>
                                {p.isDisqualified && (
                                  <span className="px-2 py-0.5 bg-error/10 text-error text-[8px] font-bold uppercase tracking-widest rounded-md border border-error/20">
                                    Disqualified
                                  </span>
                                )}
                                {p.query && p.query.trim().length > 0 && (
                                  <div className="w-2 h-2 rounded-full bg-error animate-pulse shadow-sm shadow-error/50" title="Student has a query"></div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5 font-body text-on-surface-variant">{p.roll}</td>
                            <td className="px-6 py-5 font-body text-xs text-on-surface-variant">{p.email || "N/A"}</td>
                            <td className="px-6 py-5">
                              <span className="text-sm font-medium text-on-surface-variant">
                                {getAnsweredCount(p.answers)}/{selectedQuiz.drawCount || selectedQuiz.totalQuestions} answered
                              </span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden">
                                  <div className={cn(
                                    "h-full rounded-full",
                                    p.isDisqualified ? "bg-error/40" : (score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-error")
                                  )} style={{ width: `${score}%` }}></div>
                                </div>
                                <div className="flex flex-col">
                                  <span className={cn(
                                    "font-headline font-black leading-none",
                                    p.isDisqualified ? "text-error/60" : (score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-error")
                                  )}>{score}%</span>
                                  <span className="text-[10px] text-on-surface-variant font-bold">
                                    {p.score || 0}/{selectedQuiz.drawCount || selectedQuiz.totalQuestions}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                                  p.isDisqualified ? "bg-error text-white" : (p.status === 'Submitted' ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary")
                                )}>
                                  {p.isDisqualified ? "Disqualified" : p.status}
                                </span>
                                {p.status === 'Appearing' && !p.isDisqualified && p.lastSeen && (Date.now() - p.lastSeen > 30000) && (
                                  <span className="px-2 py-1 bg-surface-container-high text-on-surface-variant text-[8px] font-bold uppercase tracking-widest rounded-md border border-outline-variant/20">
                                    Offline
                                  </span>
                                )}
                                {isTeacher && selectedQuiz.questions?.some(q => q.type === 'Paragraph') && p.status === 'Submitted' && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGradingParticipant(p);
                                      setGradingValues(p.manualGrades || {});
                                    }}
                                    className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                    title="Grade Paragraphs"
                                  >
                                    <ClipboardList className="w-4 h-4" />
                                  </button>
                                )}
                                {isTeacher && (
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm(`Unlock ${p.name} (${p.roll})? This will allow them to rejoin even if they were active or disqualified.`)) {
                                        await resetParticipantSession(selectedQuiz.id!, p.roll);
                                        setRefreshTrigger(prev => prev + 1);
                                      }
                                    }}
                                    className="p-1.5 bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors ml-1"
                                    title="Reset/Unlock Session"
                                  >
                                    <Unlock className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* View Submission Modal */}
            {/* View Submission Modal */}
            <AnimatePresence>
              {viewingQuestionPaper && selectedQuiz && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-sm">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-surface rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                  >
                    <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-indigo-500/5">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-headline font-bold text-2xl">Question Paper</h3>
                          <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mt-0.5">{selectedQuiz.title} • {selectedQuiz.roomCode}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleDownloadQuestionPaper(selectedQuiz)}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Download TXT
                        </button>
                        <button 
                          onClick={() => setViewingQuestionPaper(false)}
                          className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-8 space-y-8 bg-surface-container-lowest/50">
                      {(quizQuestionsMap[selectedQuiz.id!] || selectedQuiz.questions || []).map((q, idx) => (
                        <div key={q.id} className="p-6 bg-surface border border-outline-variant/10 rounded-3xl shadow-sm space-y-4 hover:border-indigo-500/20 transition-colors">
                          <div className="flex items-start gap-4">
                            <span className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                              {idx + 1}
                            </span>
                            <div className="space-y-1">
                              <div className="prose prose-sm max-w-none text-on-surface">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                                  {q.text}
                                </ReactMarkdown>
                              </div>
                              {q.image && (
                                <img src={q.image} alt="Question" className="max-w-sm h-auto rounded-xl border border-outline-variant/10 my-2" />
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-surface-container-high rounded-md text-on-surface-variant">{q.type}</span>
                                {q.timer && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-primary/10 rounded-md text-primary">{q.timer}s</span>}
                              </div>
                            </div>
                          </div>

                          {q.options && Object.keys(q.options).length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-12">
                              {Object.entries(q.options).map(([label, text]) => {
                                const isCorrect = Array.isArray(q.correctOption) 
                                  ? q.correctOption.includes(label) 
                                  : q.correctOption === label;
                                
                                return (
                                  <div 
                                    key={label}
                                    className={cn(
                                      "p-3 rounded-xl border flex items-center gap-3 transition-all",
                                      isCorrect 
                                        ? "bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20" 
                                        : "bg-surface-container-low border-outline-variant/10"
                                    )}
                                  >
                                    <span className={cn(
                                      "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black",
                                      isCorrect ? "bg-emerald-500 text-white" : "bg-surface-container-high text-on-surface-variant"
                                    )}>
                                      {label}
                                    </span>
                                    <span className={cn(
                                      "text-sm font-medium",
                                      isCorrect ? "text-emerald-700" : "text-on-surface"
                                    )}>{text}</span>
                                    {isCorrect && (
                                      <Award className="w-3 h-3 text-emerald-500 ml-auto" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {q.type === 'Paragraph' && (
                            <div className="pl-12">
                              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">Descriptive Question</p>
                                <p className="text-sm text-on-surface-variant leading-relaxed">This question requires manual grading by the educator after submission.</p>
                              </div>
                            </div>
                          )}

                          {q.type !== 'Paragraph' && (!q.options || Object.keys(q.options).length === 0) && (
                             <div className="pl-12">
                               <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                                 <Award className="w-4 h-4 text-emerald-500" />
                                 <span className="text-sm font-bold text-emerald-700">Correct Answer: {String(q.correctOption)}</span>
                               </div>
                             </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-6 border-t border-outline-variant/10 bg-surface-container-low/30 flex justify-end">
                      <button 
                        onClick={() => setViewingQuestionPaper(false)}
                        className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Close Question Paper
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {viewingSubmission && selectedQuiz && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-sm">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-surface rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                  >
                    <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/30">
                      <div>
                        <h3 className="font-headline font-bold text-2xl">Submission Details</h3>
                        <div className="flex flex-wrap gap-4 mt-1">
                          <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">Student: {viewingSubmission.name}</p>
                          <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">Roll: {viewingSubmission.roll}</p>
                          {viewingSubmission.email && (
                            <p className="text-xs text-primary uppercase tracking-widest font-bold font-mono">Email: {viewingSubmission.email}</p>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => setViewingSubmission(null)}
                        className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-8 space-y-8">
                      {viewingSubmission.query && (
                        <div className="p-6 bg-error/5 border border-error/10 rounded-3xl space-y-3">
                          <div className="flex items-center gap-2 text-error">
                            <MessageSquare className="w-5 h-5" />
                            <h4 className="font-headline font-bold">Student Query</h4>
                          </div>
                          <p className="text-on-surface font-body leading-relaxed italic">
                            "{viewingSubmission.query}"
                          </p>
                        </div>
                      )}

                      {(quizQuestionsMap[selectedQuiz.id!] || selectedQuiz.questions).map((q, idx) => {
                        const studentAnswer = viewingSubmission.answers[q.id];
                        const optionOrder = viewingSubmission.optionOrders?.[q.id] || ['A', 'B', 'C', 'D'];
                        const getVisualLabel = (label: string) => {
                          const vIdx = optionOrder.indexOf(label);
                          return vIdx !== -1 ? String.fromCharCode(65 + vIdx) : label;
                        };

                        const isCorrect = q.type === 'Paragraph' ? null : (
                          q.type === 'Multiple Correct' || q.type === 'MSQ'
                            ? (Array.isArray(studentAnswer) && Array.isArray(q.correctOption) && 
                               studentAnswer.length === q.correctOption.length && 
                               studentAnswer.every(val => q.correctOption.includes(val)))
                            : studentAnswer === q.correctOption
                        );

                        return (
                          <div key={q.id} className="space-y-4 pb-8 border-b border-outline-variant/10 last:border-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex gap-3">
                                <span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-sm flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="prose prose-sm max-w-none text-on-surface font-headline font-bold text-lg">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                                    {q.text}
                                  </ReactMarkdown>
                                </div>
                                  {q.image && (
                                    <div className="mt-2 mb-2">
                                      <img src={q.image} alt="Question" className="max-w-xs h-auto rounded-xl border border-outline-variant/10 shadow-sm" />
                                    </div>
                                  )}
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">{q.type}</span>
                                </div>
                              </div>
                              {q.type !== 'Paragraph' && (
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                                  isCorrect ? "bg-emerald-500/10 text-emerald-600" : "bg-error/10 text-error"
                                )}>
                                  {isCorrect ? "Correct" : "Incorrect"}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Student's Answer</p>
                                <div className={cn(
                                  "font-medium leading-relaxed prose prose-sm max-w-none text-on-surface",
                                  q.type === 'Paragraph' ? "whitespace-pre-wrap" : ""
                                )}>
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                                    {q.type === 'Paragraph' 
                                      ? (studentAnswer || "No Answer")
                                      : Array.isArray(studentAnswer) 
                                        ? studentAnswer.map(label => `${getVisualLabel(label)}: ${q.options?.[label] || label}`).join(", ") 
                                        : studentAnswer ? `${getVisualLabel(studentAnswer)}: ${q.options?.[studentAnswer] || studentAnswer}` : "No Answer"
                                    }
                                  </ReactMarkdown>
                                </div>
                              </div>
                              <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Correct Answer</p>
                                <div className="font-medium prose prose-sm max-w-none text-on-surface">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                                    {q.type === 'Paragraph'
                                      ? "Manual Grading Required"
                                      : Array.isArray(q.correctOption) 
                                        ? q.correctOption.map(label => `${getVisualLabel(label)}: ${q.options?.[label] || label}`).join(", ") 
                                        : `${getVisualLabel(q.correctOption)}: ${q.options?.[q.correctOption] || q.correctOption}`
                                    }
                                  </ReactMarkdown>
                                </div>
                              </div>
                            </div>

                            {q.type === 'Paragraph' && viewingSubmission.manualGrades?.[q.id] !== undefined && (
                              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                                <Award className="w-4 h-4" />
                                Graded: {viewingSubmission.manualGrades[q.id] * 100}%
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="p-6 border-t border-outline-variant/10 bg-surface-container-low/30 flex justify-end">
                      <button 
                        onClick={() => setViewingSubmission(null)}
                        className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Grading Modal */}
            {gradingParticipant && selectedQuiz && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-surface rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
                >
                  <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
                    <div>
                      <h3 className="font-headline font-bold text-xl">Grade Responses: {gradingParticipant.name}</h3>
                      <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mt-1">Roll: {gradingParticipant.roll}</p>
                    </div>
                    <button 
                      onClick={() => setGradingParticipant(null)}
                      className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="flex-grow overflow-y-auto p-6 space-y-8">
                    {selectedQuiz.questions?.filter(q => q.type === 'Paragraph').map((q) => (
                      <div key={q.id} className="space-y-4">
                        <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Question</p>
                          <p className="font-medium text-on-surface">{q.text}</p>
                        </div>
                        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-inner">
                          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Student Answer</p>
                          <p className="font-body text-on-surface leading-relaxed whitespace-pre-wrap">
                            {gradingParticipant.answers[q.id] || "No answer provided."}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-sm font-bold text-on-surface-variant">Score (0 to 1):</p>
                          <div className="flex gap-2">
                            {[0, 0.25, 0.5, 0.75, 1].map((val) => (
                              <button
                                key={val}
                                onClick={() => setGradingValues(prev => ({ ...prev, [q.id]: val }))}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  gradingValues[q.id] === val 
                                    ? "bg-primary text-white shadow-lg shadow-primary/20" 
                                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                                )}
                              >
                                {val * 100}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-6 border-t border-outline-variant/10 bg-surface-container-low/30 flex justify-end gap-3">
                    <button 
                      onClick={() => setGradingParticipant(null)}
                      className="px-6 py-2.5 font-bold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={async () => {
                        if (selectedQuiz.id && gradingParticipant.id) {
                          await gradeParticipant(selectedQuiz.id, gradingParticipant.id, gradingValues);
                          // Update local state to reflect changes immediately
                          setAllParticipants(prev => prev.map(p => 
                            p.id === gradingParticipant.id ? { ...p, manualGrades: gradingValues } : p
                          ));
                          setGradingParticipant(null);
                        }
                      }}
                      className="px-8 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Save Grades
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        ) : (
          <>
            <header className="mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-2">
                {isTeacher ? "Quiz Reports" : "Attempt History"}
              </h1>
              <p className="text-on-surface-variant font-body text-lg">
                {isTeacher ? "Analyze student performance and engagement metrics." : "Review your quiz performance and answers."}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleRefresh}
                disabled={loadingParticipants}
                className="p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:bg-surface-container-high transition-colors text-on-surface-variant hover:text-primary disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw className={cn("w-5 h-5", loadingParticipants && "animate-spin")} />
              </button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                <input 
                  type="text" 
                  placeholder="Search quizzes..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-64"
                />
              </div>
            </div>
          </div>
        </header>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            { 
              label: isTeacher ? "Total Quizzes" : "Quizzes Taken", 
              value: stats.totalQuizzes, 
              icon: ClipboardList, 
              color: "bg-blue-500" 
            },
            { 
              label: isTeacher ? "Total Participants" : "Global Rank (Avg)", 
              value: isTeacher ? stats.totalParticipants.toLocaleString() : "N/A", 
              icon: Users, 
              color: "bg-purple-500" 
            },
            { 
              label: "Avg. Score", 
              value: stats.avgScore, 
              icon: Award, 
              color: "bg-amber-500" 
            },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/10 shadow-sm flex items-center gap-5"
            >
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant mb-1">{stat.label}</p>
                <p className="text-2xl font-headline font-black text-on-surface">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Reports Table */}
        <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
            <h2 className="font-headline font-bold text-xl text-on-surface">
              {isTeacher ? "Recent Quiz Performance" : "Your Attempts"}
            </h2>
            <AnimatePresence>
              {isTeacher && selectedQuizIds.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-4"
                >
                  <span className="text-sm font-bold text-primary">{selectedQuizIds.length} Selected</span>
                  <button 
                    onClick={() => {
                      setIsBulkDelete(true);
                      setShowDeleteConfirm("bulk");
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl font-bold text-sm hover:bg-error transition-all hover:text-white"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Selected
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-4 w-12">
                    {isTeacher && (
                      <input 
                        type="checkbox"
                        checked={filteredQuizzes.length > 0 && selectedQuizIds.length === filteredQuizzes.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-outline focus:ring-primary text-primary"
                      />
                    )}
                  </th>
                  <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Quiz Name</th>
                  <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">Room Code</th>
                  <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">
                    {isTeacher ? "Participants" : "Status"}
                  </th>
                  <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">
                    {isTeacher ? "Avg. Score" : "My Score"}
                  </th>
                  <th className="px-6 py-4 font-label font-bold text-xs uppercase tracking-widest text-on-surface-variant">
                    {isTeacher ? "Status" : "Result"}
                  </th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredQuizzes.length > 0 ? filteredQuizzes.map((quiz) => {
                  const qStats = getQuizStats(quiz);
                  const isSelected = selectedQuizIds.includes(quiz.id!);
                  const pCount = qStats.count;
                  const myResponse = (allParticipants || []).find(p => p.quizId === quiz.id);
                  const myScore = myResponse?.score || 0;
                  const myPercentage = (quiz.drawCount || quiz.totalQuestions) > 0 
                    ? (myScore / (quiz.drawCount || quiz.totalQuestions) * 100) 
                    : 0;

                  return (
                    <tr 
                      key={quiz.id} 
                      onClick={() => setSelectedQuiz(quiz)}
                      className={cn(
                        "hover:bg-surface-container-low/30 transition-colors group cursor-pointer",
                        isSelected && "bg-primary/5"
                      )}
                    >
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        {isTeacher && (
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectQuiz(quiz.id!)}
                            className="w-4 h-4 rounded border-outline focus:ring-primary text-primary"
                          />
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                            isSelected ? "bg-primary text-white" : "bg-primary/10 text-primary"
                          )}>
                            <BarChart3 className="w-5 h-5" />
                          </div>
                          <span className="font-headline font-bold text-on-surface line-clamp-1">{quiz.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-on-surface-variant font-body text-sm font-mono">{quiz.roomCode}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          {isTeacher ? (
                            <>
                              <Users className="w-4 h-4 text-outline" />
                              <span className="font-body font-medium text-on-surface">{pCount}</span>
                            </>
                          ) : (
                            <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                myResponse ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                            )}>
                              {myResponse ? myResponse.status : "Pending"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="w-full max-w-[100px] h-2 bg-surface-container-high rounded-full overflow-hidden mb-1">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-1000" 
                            style={{ width: `${isTeacher ? qStats.avgPercentage : myPercentage}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-label font-bold text-primary block">
                          {isTeacher ? qStats.avgRawScore : myScore}/{quiz.drawCount || quiz.totalQuestions}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {isTeacher ? (
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            quiz.isActive ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600"
                          )}>
                            {quiz.isActive ? "Active" : "Archived"}
                          </span>
                        ) : (
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            myResponse?.isDisqualified ? "bg-error text-white" : "bg-emerald-500/10 text-emerald-600"
                          )}>
                            {myResponse?.isDisqualified ? "Disqualified" : "Completed"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const parts = allParticipants.filter(p => p.quizId === quiz.id);
                              const denom = quiz.drawCount || quiz.totalQuestions || 0;
                              exportResultsToCSV(quiz.title, quiz.roomCode, parts, denom);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 font-bold text-xs transition-colors border border-emerald-500/20"
                            title="Download Results CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                          </button>
                          {isTeacher && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteConfirm(quiz.id || null);
                              }}
                              disabled={quiz.isActive}
                              className="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors disabled:opacity-30"
                              title="Delete Quiz"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button className="p-2 rounded-lg hover:bg-surface-container-high transition-colors group-hover:text-primary">
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant font-body italic">
                      {searchQuery ? "No quizzes match your search." : "No quiz reports available yet. Create and share a quiz to see results!"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </main>

      <BottomNavBar />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface-container-lowest p-8 rounded-3xl shadow-2xl border border-surface-container max-w-md w-full"
            >
              <h3 className="font-headline text-2xl font-extrabold mb-4 text-on-surface">
                {isBulkDelete ? `Delete ${selectedQuizIds.length} Quizzes?` : "Delete Quiz?"}
              </h3>
              <p className="text-on-surface-variant mb-8 leading-relaxed">
                {isBulkDelete 
                  ? "Are you sure you want to delete all selected quizzes and their reports? This action is permanent and cannot be undone."
                  : "Are you sure you want to delete this quiz and all its reports? This action is permanent and cannot be undone."}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setShowDeleteConfirm(null);
                    setIsBulkDelete(false);
                  }}
                  className="flex-1 py-4 bg-surface-container-low text-on-surface font-headline font-bold rounded-xl hover:bg-surface-container transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (isBulkDelete) {
                      handleBulkDelete();
                    } else {
                      handleDeleteQuiz(showDeleteConfirm);
                    }
                  }}
                  className="flex-1 py-4 bg-error text-on-error font-headline font-bold rounded-xl shadow-lg shadow-error/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
