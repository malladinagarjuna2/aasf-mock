import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  doc, 
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  limit,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isDemoMode } from '../firebase';
import { useAuth, isAdminEmail } from './AuthContext';
import { mockStore } from '../lib/mockStore';

export interface Question {
  id: string;
  type: string;
  timer: number;
  text: string;
  options: Record<string, string>;
  correctOption: string | string[]; // Allow multiple for MSQ
  image?: string; // Base64 or URL
}

export interface Quiz {
  id?: string;
  authorId?: string;
  title: string;
  totalQuestions: number;
  drawCount: number;
  roomCode: string;
  questions: Question[];
  isActive: boolean;
  status: 'waiting' | 'starting' | 'active' | 'finished';
  customTimer?: number;
  startedAt?: any;
  endsAt?: any;
  redirectUrl?: string;
  allowedRollPatterns?: string[]; // e.g. ["ROLL_FORMAT_XXXXABC_XXX"]
  createdAt?: any;
}

export const LOBBY_COUNTDOWN_SECONDS = 10;

export interface Participant {
  id: string;
  quizId?: string;
  studentId?: string | null;
  name: string;
  roll: string;
  email?: string;
  progress: number;
  questionTimers?: Record<string, number>;
  questionExpiries?: Record<string, number>;
  status: 'Appearing' | 'Submitted' | 'Away';
  answers: Record<string, any>;
  manualGrades?: Record<string, number>; // Map of question ID to points (0 to 1)
  questionOrder?: string[];
  optionOrders?: Record<string, string[]>;
  startTime?: number;
  lastSeen?: number;
  timeTaken?: number;
  score?: number;
  isDisqualified?: boolean;
  cheatingAttempts?: number;
  sessionToken?: string;
  query?: string;
  attemptEndsAt?: number;
  createdAt?: any;
}

/**
 * Sanitizes an object for Firestore by removing any fields with 'undefined' values.
 * Firestore does not support 'undefined' and will throw an error if encountered.
 */
const sanitizeForFirestore = (data: any): any => {
  // If not an object, return as is (including null)
  if (!data || typeof data !== 'object') return data;
  
  // Preserve Date objects
  if (data instanceof Date) return data;
  
  // Detect and preserve Firestore FieldValue (serverTimestamp, arrayUnion, etc.)
  // We check for type-specific properties as constructor names can be minified
  if (data.constructor?.name?.includes('FieldValue') || 
      (typeof data._methodName === 'string' && data._delegate)) {
    return data;
  }
  
  const result: any = Array.isArray(data) ? [] : {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  });
  
  return result;
};

interface QuizContextType {
  quiz: Quiz | null;
  quizzes: Quiz[];
  participants: Participant[];
  currentStudentRoll: string | null;
  draftQuiz: Partial<Quiz> | null;
  drafts: Partial<Quiz>[];
  createQuiz: (quiz: Quiz) => Promise<void>;
  resetQuiz: () => void;
  saveDraft: (draft: Partial<Quiz>) => void;
  deleteDraft: (title: string) => void;
  clearCurrentDraft: () => void;
  updateQuiz: (quizId: string, quiz: Quiz) => Promise<void>;
  fetchQuizById: (quizId: string) => Promise<Quiz | null>;
  joinQuiz: (participant: Omit<Participant, 'id' | 'progress' | 'status' | 'answers' | 'questionOrder' | 'optionOrders'>, targetQuiz?: Quiz) => Promise<void>;
  updateParticipant: (roll: string, updates: Partial<Participant>) => Promise<void>;
  leaveLobby: (roll: string) => Promise<void>;
  endQuiz: (quizId: string) => Promise<void>;
  startSession: (quizId: string) => Promise<void>;
  cancelStart: (quizId: string) => Promise<void>;
  findQuizByRoomCode: (code: string) => Promise<Quiz | null>;
  gradeParticipant: (quizId: string, participantId: string, manualGrades: Record<string, number>) => Promise<void>;
  calculateScore: (participant: Participant, quiz: Quiz, overrideQuestions?: Question[], excludeParagraphs?: boolean) => number;
  deleteQuiz: (quizId: string) => Promise<void>;
  isRollAllowed: (roll: string, patterns: string[]) => boolean;
  resetParticipantSession: (quizId: string, roll: string) => Promise<void>;
  quizEnded: boolean;
  closeQuizEndedMessage: () => void;
  selectQuiz: (quizId: string | null) => void;
  loading: boolean;
}

const QuizContext = createContext<QuizContextType | undefined>(undefined);

export function QuizProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentStudentRoll, setCurrentStudentRoll] = useState<string | null>(() => {
    return sessionStorage.getItem('currentStudentRoll');
  });
  const [draftQuiz, setDraftQuiz] = useState<Partial<Quiz> | null>(() => {
    const saved = localStorage.getItem('quizDraft');
    return saved ? JSON.parse(saved) : null;
  });
  const [drafts, setDrafts] = useState<Partial<Quiz>[]>(() => {
    const saved = localStorage.getItem('quizDrafts');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(true);
  const [quizEnded, setQuizEnded] = useState(false);

  // Track the ID of the quiz the teacher currently wants to monitor
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(() => {
    return sessionStorage.getItem('monitoringQuizId');
  });

  const closeQuizEndedMessage = () => setQuizEnded(false);

  const selectQuiz = (quizId: string | null) => {
    setSelectedQuizId(quizId);
    if (quizId) {
      sessionStorage.setItem('monitoringQuizId', quizId);
      const target = quizzes.find(q => q.id === quizId);
      if (target) {
        setQuiz(target);
        localStorage.setItem('activeRoomCode', target.roomCode);
      }
    } else {
      sessionStorage.removeItem('monitoringQuizId');
      setQuiz(null);
      localStorage.removeItem('activeRoomCode');
    }
  };

  const findQuizByRoomCode = async (code: string): Promise<Quiz | null> => {
    if (isDemoMode) {
      const normalizedInput = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const quizzes = mockStore.getQuizzes();
      const found = quizzes.find((q: any) => q.roomCode.replace(/[^A-Z0-9]/gi, '').toUpperCase() === normalizedInput && q.isActive);
      if (found) {
        setQuiz(found);
        localStorage.setItem('activeRoomCode', found.roomCode);
        return found;
      }
      return null;
    }
    try {
      // Normalize input code (remove all non-alphanumeric characters)
      const normalizedInput = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      
      if (normalizedInput.length < 6) return null;

      const quizzesRef = collection(db, 'quizzes');
      // We query for active quizzes first
      const q = query(quizzesRef, where('isActive', '==', true));
      const snapshot = await getDocs(q);
      
      const foundDoc = snapshot.docs.find(doc => {
        const data = doc.data();
        const storedNormalized = (data.roomCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return storedNormalized === normalizedInput;
      });
      
      if (foundDoc) {
        const quizData = foundDoc.data() as Quiz;
        const quizId = foundDoc.id;
        
        // Fetch questions
        const questionsRef = collection(db, 'quizzes', quizId, 'questions');
        const questionsSnapshot = await getDocs(questionsRef);
        const questions = questionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Question[];

        const foundQuiz = {
          id: quizId,
          ...quizData,
          questions,
          totalQuestions: quizData.totalQuestions || questions.length,
          drawCount: quizData.drawCount || questions.length
        };
        
        setQuiz(foundQuiz);
        localStorage.setItem('activeRoomCode', foundQuiz.roomCode);
        return foundQuiz;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'quizzes');
      return null;
    }
  };

  // Fetch all quizzes for the teacher
  useEffect(() => {
    const isAdmin = profile?.role?.toLowerCase() === 'admin' || isAdminEmail(user?.email);

    if (isDemoMode) {
      if (!user) {
        setQuizzes([]);
        setParticipants([]);
        setLoading(false);
        return;
      }
      
      const poll = () => {
        const fetched = isAdmin 
          ? mockStore.getQuizzes() 
          : mockStore.getQuizzes().filter((q: any) => q.authorId === user.uid);
        setQuizzes(fetched);
        const active = fetched.find((q: any) => q.isActive);
        if (active) {
          setQuiz(prev => {
            if (prev?.id === active.id) {
              // Preserve questions if they are already loaded or if active has them
              return { ...active, questions: prev.questions || active.questions || [] };
            }
            return { ...active, questions: active.questions || [] };
          });
          localStorage.setItem('activeRoomCode', active.roomCode);
        } else {
          if (localStorage.getItem('activeRoomCode')) {
            setQuiz(null);
            localStorage.removeItem('activeRoomCode');
          }
        }
        setLoading(false);
      };

      poll();
      const interval = setInterval(poll, 2000);
      return () => clearInterval(interval);
    }

    if (!user) {
      setQuizzes([]);
      // Don't clear 'quiz' here, as students might be using it without being logged in
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const quizzesRef = collection(db, 'quizzes');
    const q = isAdmin 
      ? query(quizzesRef, orderBy('createdAt', 'desc'), limit(100))
      : query(quizzesRef, where('authorId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribeQuizzes = onSnapshot(q, (snapshot) => {
      const fetchedQuizzes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quiz[];
      setQuizzes(fetchedQuizzes);
      setLoading(false);

      // For teachers, automatically sync the 'quiz' state with the active quiz from Firestore
      const activeQuizzes = fetchedQuizzes.filter(q => q.isActive);
      
      // Try to find the exact quiz we are monitoring
      let activeQuiz = activeQuizzes.find(q => q.id === selectedQuizId);
      
      // Fallback: if no quiz is selected but there are active ones, or if the selected one is no longer active
      if (!activeQuiz && activeQuizzes.length > 0) {
        activeQuiz = activeQuizzes[0];
      }

      if (activeQuiz) {
        setQuiz(prev => {
          if (prev?.id === activeQuiz.id) {
            return { ...activeQuiz, questions: prev.questions || activeQuiz.questions || [] };
          }
          return { ...activeQuiz, questions: activeQuiz.questions || [] };
        });
        localStorage.setItem('activeRoomCode', activeQuiz.roomCode);
        if (!selectedQuizId || selectedQuizId !== activeQuiz.id) {
          setSelectedQuizId(activeQuiz.id!);
          sessionStorage.setItem('monitoringQuizId', activeQuiz.id!);
        }
      } else {
        // Only clear if we were previously in a teacher-like state (monitoring a quiz)
        if (localStorage.getItem('activeRoomCode')) {
          setQuiz(null);
          localStorage.removeItem('activeRoomCode');
          setSelectedQuizId(null);
          sessionStorage.removeItem('monitoringQuizId');
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quizzes');
      setLoading(false);
    });

    return () => unsubscribeQuizzes();
  }, [user?.uid, user?.email, profile?.role]);

  // Restore quiz session for students from localStorage
  useEffect(() => {
    const restoreSession = async () => {
      const savedRoomCode = localStorage.getItem('activeRoomCode');
      if (savedRoomCode && !quiz && !user) {
        await findQuizByRoomCode(savedRoomCode);
      }
    };
    restoreSession();
  }, [user, quiz]);

  // Fetch participants for the active quiz
  useEffect(() => {
    if (isDemoMode) {
      if (!quiz?.id) {
        setParticipants([]);
        return;
      }
      const interval = setInterval(() => {
        const fetched = mockStore.getResponsesForQuiz(quiz.id!);
        setParticipants(fetched);
      }, 2000);
      return () => clearInterval(interval);
    }

    if (!quiz?.id) {
      setParticipants([]);
      return;
    }

    let unsubscribeParticipants = () => {};

    const isAuthor = user && quiz?.authorId === user.uid;
    let unsubscribeQuiz = () => {};

    if (!isAuthor && quiz?.id) {
      const quizRef = doc(db, 'quizzes', quiz.id);
      unsubscribeQuiz = onSnapshot(quizRef, (docSnap) => {
        if (docSnap.exists()) {
          const quizData = docSnap.data() as Quiz;
          setQuiz(prev => {
            if (!prev || prev.id !== docSnap.id) {
              return { ...quizData, id: docSnap.id, questions: quizData.questions || [] };
            }
            // Preserve existing questions on update
            return { ...prev, ...quizData, questions: prev.questions || quizData.questions || [] };
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `quizzes/${quiz.id}`);
      });
    }

    if (isAuthor) {
      const participantsRef = collection(db, 'quizzes', quiz.id, 'responses');
      unsubscribeParticipants = onSnapshot(participantsRef, (snapshot) => {
        const fetchedParticipants = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Participant[];
        setParticipants(fetchedParticipants);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `quizzes/${quiz.id}/responses`);
      });
    } else if (currentStudentRoll) {
      const docRef = doc(db, 'quizzes', quiz.id, 'responses', currentStudentRoll);
      unsubscribeParticipants = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const p = { id: docSnap.id, ...docSnap.data() } as Participant;
          setParticipants([p]);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `quizzes/${quiz.id}/responses/${currentStudentRoll}`);
      });
    }

    return () => {
      unsubscribeParticipants();
      unsubscribeQuiz();
    };
  }, [quiz?.id, quiz?.authorId, quiz?.status, user?.uid, currentStudentRoll, quiz?.questions?.length]);

  // Robust Question Recovery for Students/Shared Views
  useEffect(() => {
    if (!quiz?.id) return;
    
    // Only attempt to fetch if we have an ID but questions are missing
    if (!quiz.questions || quiz.questions.length === 0) {
      const fetchQuestions = async () => {
        try {
          if (isDemoMode) {
            const mockQuiz = mockStore.getQuizzes().find((q: any) => q.id === quiz.id);
            if (mockQuiz) {
              setQuiz(prev => prev?.id === quiz.id ? { ...prev, questions: mockQuiz.questions || [] } : prev);
            }
            return;
          }

          const questionsRef = collection(db, 'quizzes', quiz.id!, 'questions');
          const snapshot = await getDocs(questionsRef);
          const questions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Question[];
          
          setQuiz(prev => {
            if (prev?.id === quiz.id) {
              // Ensure we don't accidentally wipe questions if they somehow arrived between start and end of fetch
              return { ...prev, questions: questions.length > 0 ? questions : (prev.questions || []) };
            }
            return prev;
          });
        } catch (err) {
          console.error("Critical: Question recovery failed:", err);
        }
      };
      fetchQuestions();
    }
  }, [quiz?.id, quiz?.questions?.length]);


  const createQuiz = async (newQuiz: Quiz) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    if (isDemoMode) {
      const id = 'quiz-' + Date.now();
      const quizData = {
        ...newQuiz,
        id,
        authorId: user.uid,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      mockStore.saveQuiz(quizData);
      setQuizzes(prev => [quizData, ...prev]);
      setQuiz(quizData);
      localStorage.setItem('activeRoomCode', quizData.roomCode);
      setDraftQuiz(null);
      localStorage.removeItem('quizDraft');
      return;
    }

    // Remove the restriction of only one active quiz to support multiple quiz hosting
    /*
    const activeQuiz = quizzes.find(q => q.isActive);
    if (activeQuiz) {
      throw new Error("You already have an active quiz. Please end it before creating a new one.");
    }
    */

    try {
      const quizzesRef = collection(db, 'quizzes');
      const quizData = {
        authorId: user.uid,
        title: newQuiz.title,
        totalQuestions: newQuiz.totalQuestions,
        drawCount: newQuiz.drawCount,
        roomCode: newQuiz.roomCode,
        isActive: true,
        status: 'waiting' as const,
        customTimer: newQuiz.customTimer,
        redirectUrl: newQuiz.redirectUrl || '',
        startedAt: null,
        endsAt: null,
        allowedRollPatterns: newQuiz.allowedRollPatterns || [],
        createdAt: serverTimestamp(),
      };

      const quizDoc = await addDoc(quizzesRef, quizData);
      
      // Validation check before subcollection addition
      if (!newQuiz.questions || newQuiz.questions.length === 0) {
        throw new Error("Cannot create quiz without questions.");
      }

      // Add questions as subcollection
      const questionsRef = collection(db, 'quizzes', quizDoc.id, 'questions');
      for (const question of newQuiz.questions) {
        // Sanitize question data to remove undefined fields (Firestore doesn't allow undefined)
        const questionData = sanitizeForFirestore({ ...question, quizId: quizDoc.id });
        await addDoc(questionsRef, questionData);
      }

      const createdQuiz = {
        id: quizDoc.id,
        ...quizData,
        questions: newQuiz.questions
      };

      setQuiz(createdQuiz);
      localStorage.setItem('activeRoomCode', createdQuiz.roomCode);
      localStorage.removeItem('quizDraft');
      setDraftQuiz(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quizzes');
    }
  };

  const saveDraft = (draft: Partial<Quiz>) => {
    setDraftQuiz(draft);
    localStorage.setItem('quizDraft', JSON.stringify(draft));
    
    // Also add to multiple drafts list if it has a title
    if (draft.title) {
      setDrafts(prev => {
        const existingIndex = prev.findIndex(d => d.title === draft.title);
        let newDrafts;
        if (existingIndex >= 0) {
          newDrafts = [...prev];
          newDrafts[existingIndex] = draft;
        } else {
          newDrafts = [draft, ...prev];
        }
        localStorage.setItem('quizDrafts', JSON.stringify(newDrafts));
        return newDrafts;
      });
    }
  };

  const deleteDraft = (title: string) => {
    setDrafts(prev => {
      const newDrafts = prev.filter(d => d.title !== title);
      localStorage.setItem('quizDrafts', JSON.stringify(newDrafts));
      return newDrafts;
    });
  };

  const clearCurrentDraft = () => {
    setDraftQuiz(null);
    localStorage.removeItem('quizDraft');
  };

  const updateQuiz = async (quizId: string, updatedQuiz: Quiz) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    if (isDemoMode) {
      const quizData = {
        ...updatedQuiz,
        id: quizId,
        authorId: user.uid,
        updatedAt: new Date().toISOString()
      };
      mockStore.saveQuiz(quizData);
      setQuizzes(prev => prev.map(q => q.id === quizId ? quizData : q));
      if (quiz?.id === quizId) setQuiz(quizData);
      return;
    }

    try {
      const batch = writeBatch(db);
      const quizRef = doc(db, 'quizzes', quizId);
      const quizData = sanitizeForFirestore({
        title: updatedQuiz.title,
        totalQuestions: updatedQuiz.totalQuestions,
        drawCount: updatedQuiz.drawCount,
        customTimer: updatedQuiz.customTimer,
        redirectUrl: updatedQuiz.redirectUrl || '',
        allowedRollPatterns: updatedQuiz.allowedRollPatterns || [],
        updatedAt: serverTimestamp(),
      });

      batch.update(quizRef, quizData);
      
      // Update questions
      // Firestore doesn't support deleting a whole collection in a batch without knowing the IDs
      // So we still need to fetch IDs, but we can delete/add in the same batch
      const questionsRef = collection(db, 'quizzes', quizId, 'questions');
      const oldQuestions = await getDocs(questionsRef);
      
      for (const d of oldQuestions.docs) {
        batch.delete(doc(db, 'quizzes', quizId, 'questions', d.id));
      }

      for (const question of updatedQuiz.questions) {
        const questionData = sanitizeForFirestore({ ...question, quizId });
        delete (questionData as any).id;
        // In a batch, we use doc() with a new ID if we don't have one
        const newQuestionRef = doc(collection(db, 'quizzes', quizId, 'questions'));
        batch.set(newQuestionRef, questionData);
      }

      await batch.commit();

      // Re-fetch questions to have stable IDs if needed, or just rely on merged
      const mergedQuiz = {
        ...(quiz?.id === quizId ? quiz : {}),
        ...updatedQuiz,
        id: quizId,
        authorId: user.uid
      };
      
      // Update local statePlural
      setQuizzes(prev => prev.map(q => q.id === quizId ? mergedQuiz : q));
      if (quiz?.id === quizId) setQuiz(mergedQuiz);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}`);
      throw err;
    }
  };

  const fetchQuizById = async (quizId: string): Promise<Quiz | null> => {
    if (isDemoMode) {
      return mockStore.getQuizzes().find((q: any) => q.id === quizId) || null;
    }
    try {
      const quizRef = doc(db, 'quizzes', quizId);
      const quizSnap = await getDoc(quizRef);
      
      if (!quizSnap.exists()) return null;
      
      const quizData = quizSnap.data() as Quiz;
      
      // Fetch questions subcollection
      const questionsRef = collection(db, 'quizzes', quizId, 'questions');
      const questionsSnap = await getDocs(questionsRef);
      const questions = questionsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Question[];
      
      return {
        ...quizData,
        id: quizSnap.id,
        questions
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `quizzes/${quizId}`);
      return null;
    }
  };

  const resetQuiz = () => {
    setQuiz(null);
    setParticipants([]);
    setCurrentStudentRoll(null);
    localStorage.removeItem('activeRoomCode');
    localStorage.removeItem('currentStudentRoll');
  };

  const joinQuiz = async (p: Omit<Participant, 'id' | 'progress' | 'status' | 'answers' | 'questionOrder' | 'optionOrders'>, targetQuiz?: Quiz) => {
    const activeQuiz = targetQuiz || quiz;
    if (!activeQuiz?.id || !activeQuiz.isActive) return;

    // Always reject joins if quiz is finished
    if (activeQuiz.status === 'finished') {
      throw new Error("This quiz has finished. You can no longer join.");
    }

    if (isDemoMode) {
      const responses = mockStore.getAllResponses();
      const existing = responses.find((r: any) => r.quizId === activeQuiz.id && r.roll === p.roll);
      
      const sessionToken = sessionStorage.getItem('sessionToken') || crypto.randomUUID();
      sessionStorage.setItem('sessionToken', sessionToken);

      if (existing) {
        if (existing.status === 'Submitted' || existing.isDisqualified) {
          throw new Error("already participated");
        }

        const now = Date.now();
        const isCurrentlyActive = existing.lastSeen && (now - existing.lastSeen < 20000);

        if (isCurrentlyActive && existing.sessionToken !== sessionToken) {
          throw new Error("user already joined");
        }

        // Resume
        setCurrentStudentRoll(p.roll);
        localStorage.setItem('currentStudentRoll', p.roll);
        setQuiz(activeQuiz);
        return;
      }

      if (activeQuiz.endsAt) {
        const endsAtMillis = typeof activeQuiz.endsAt === 'string'
          ? new Date(activeQuiz.endsAt).getTime()
          : (activeQuiz.endsAt.toMillis ? activeQuiz.endsAt.toMillis() : new Date(activeQuiz.endsAt).getTime());
        if (Number.isFinite(endsAtMillis) && endsAtMillis <= Date.now()) {
          throw new Error("This quiz has finished. You can no longer join.");
        }
      }
      
      const questions = activeQuiz.questions || [];
      const questionOrder = shuffleArray(questions.map(q => q.id)).slice(0, activeQuiz.drawCount || questions.length);
      const optionOrders: Record<string, string[]> = {};
      questions.forEach(q => {
        optionOrders[q.id] = shuffleArray(['A', 'B', 'C', 'D']);
      });

      const newParticipant = {
        ...p,
        id: p.roll,
        quizId: activeQuiz.id,
        studentId: user?.uid || 'anonymous',
        progress: 0,
        status: 'Appearing' as const,
        answers: {},
        questionOrder,
        optionOrders,
        startTime: Date.now(),
        attemptEndsAt: activeQuiz.endsAt
          ? (typeof activeQuiz.endsAt === 'string'
              ? new Date(activeQuiz.endsAt).getTime()
              : (activeQuiz.endsAt.toMillis ? activeQuiz.endsAt.toMillis() : new Date(activeQuiz.endsAt).getTime()))
          : null,
        lastSeen: Date.now(),
        sessionToken,
        createdAt: new Date().toISOString()
      };
      mockStore.saveResponse(newParticipant);
      setCurrentStudentRoll(p.roll);
      localStorage.setItem('currentStudentRoll', p.roll);
      setQuiz(activeQuiz);
      return;
    }

    // Ensure the quiz state is set in the context
    if (!quiz || quiz.id !== activeQuiz.id) {
      setQuiz(activeQuiz);
    }

    try {
      const docRef = doc(db, 'quizzes', activeQuiz.id, 'responses', p.roll);
      
      let sessionToken = sessionStorage.getItem('sessionToken');
      if (!sessionToken) {
        sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('sessionToken', sessionToken);
      }

      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        const quizRef = doc(db, 'quizzes', activeQuiz.id);
        const quizSnap = await transaction.get(quizRef);
        const latestQuiz = quizSnap.data() as Quiz;
        const now = Date.now();

        if (docSnap.exists()) {
          const data = docSnap.data() as Participant;
          
          if (data.status === 'Submitted' || data.isDisqualified) {
            throw new Error("already participated");
          }

          const lastSeen = data.lastSeen || 0;
          const isCurrentlyActive = (now - lastSeen < 25000); // 25 seconds threshold

          // Session Locking: Allow re-entry only if it's the SAME tab (matching token)
          // OR if the previous session has timed out.
          if (isCurrentlyActive && data.sessionToken && data.sessionToken !== sessionToken) {
            throw new Error("user already joined");
          }

          // Resume/Takeover: Update sessionToken and heartbeat atomically
          const participantEmail = p.email || user?.email;
          transaction.update(docRef, sanitizeForFirestore({ 
            sessionToken, 
            lastSeen: now,
            status: 'Appearing',
            ...(participantEmail ? { email: participantEmail } : {})
          }));
        } else {
          if (latestQuiz.status === 'finished') {
            throw new Error("This quiz has finished. You can no longer join.");
          }

          const latestEndsAt = latestQuiz.endsAt
            ? (typeof latestQuiz.endsAt === 'string'
                ? new Date(latestQuiz.endsAt).getTime()
                : (latestQuiz.endsAt.toMillis ? latestQuiz.endsAt.toMillis() : new Date(latestQuiz.endsAt).getTime()))
            : null;

          if (latestEndsAt && latestEndsAt <= now) {
            throw new Error("This quiz has finished. You can no longer join.");
          }

          // First time joining: Create record atomically
          const questions = activeQuiz.questions || [];
          let questionOrder = shuffleArray(questions.map(q => q.id));
          const drawCount = activeQuiz.drawCount || questions.length;
          if (drawCount > 0 && drawCount < questions.length) {
            questionOrder = questionOrder.slice(0, drawCount);
          }

          const optionOrders: Record<string, string[]> = {};
          questions.forEach(q => {
            optionOrders[q.id] = shuffleArray(['A', 'B', 'C', 'D']);
          });

          const newParticipant = sanitizeForFirestore({
            ...p,
            quizId: activeQuiz.id,
            studentId: user?.uid || null,
            email: p.email || user?.email || undefined,
            progress: 0,
            status: 'Appearing' as const,
            answers: {},
            questionOrder,
            optionOrders,
            startTime: now,
            attemptEndsAt: latestEndsAt,
            lastSeen: now,
            sessionToken,
            createdAt: serverTimestamp()
          });
          transaction.set(docRef, newParticipant);
        }
      });

      setCurrentStudentRoll(p.roll);
      sessionStorage.setItem('currentStudentRoll', p.roll);
      
      // Save to history (outside transaction)
      const history = JSON.parse(localStorage.getItem('quizHistory') || '[]');
      const existingHistoryIndex = history.findIndex((h: any) => h.id === activeQuiz.id);
      
      const historyItem = {
        id: activeQuiz.id,
        title: activeQuiz.title,
        roomCode: activeQuiz.roomCode,
        name: p.name,
        roll: p.roll,
        date: new Date().toISOString()
      };

      if (existingHistoryIndex !== -1) {
        history.splice(existingHistoryIndex, 1);
      }
      history.unshift(historyItem);
      localStorage.setItem('quizHistory', JSON.stringify(history.slice(0, 10)));
    } catch (err: any) {
      if (err.message === "user already joined" || err.message === "already participated") {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `quizzes/${activeQuiz.id}/responses/${p.roll}`);
    }
  };

  const endQuiz = async (quizId: string) => {
    if (isDemoMode) {
      const quizzes = mockStore.getQuizzes();
      const updated = quizzes.map((q: any) => q.id === quizId ? { ...q, isActive: false, status: 'finished' } : q);
      localStorage.setItem('demo_quizzes', JSON.stringify(updated));
      setQuiz(null);
      localStorage.removeItem('activeRoomCode');
      setQuizEnded(true);
      return;
    }
    try {
      const quizRef = doc(db, 'quizzes', quizId);
      await updateDoc(quizRef, { isActive: false, status: 'finished' });
      
      // Clear local state immediately for better UX
      setQuiz(null);
      localStorage.removeItem('activeRoomCode');
      setQuizEnded(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}`);
    }
  };

  const startSession = async (quizId: string) => {
    const targetQuiz = quizzes.find(q => q.id === quizId) || quiz;
    const timerSeconds = Number(targetQuiz?.customTimer || 0);

    if (!Number.isFinite(timerSeconds) || timerSeconds <= 0) {
      throw new Error("Overall quiz timer is required before starting the quiz.");
    }

    const startedAtDate = new Date();
    const endsAtDate = new Date(startedAtDate.getTime() + timerSeconds * 1000);
    const activeUpdate = {
      status: 'active' as const,
      startedAt: startedAtDate,
      endsAt: endsAtDate
    };

    if (isDemoMode) {
      const quizzes = mockStore.getQuizzes();
      const updated = quizzes.map((q: any) => q.id === quizId ? {
        ...q,
        status: 'active',
        startedAt: startedAtDate.toISOString(),
        endsAt: endsAtDate.toISOString()
      } : q);
      localStorage.setItem('demo_quizzes', JSON.stringify(updated));
      const activeQuiz = updated.find((q: any) => q.id === quizId);
      if (activeQuiz) setQuiz(activeQuiz);
      setQuizzes(prev => prev.map(q => q.id === quizId ? { ...q, status: 'active', startedAt: startedAtDate.toISOString(), endsAt: endsAtDate.toISOString() } : q));
      return;
    }

    try {
      const quizRef = doc(db, 'quizzes', quizId);
      await updateDoc(quizRef, activeUpdate);
      setQuiz(prev => prev?.id === quizId ? { ...prev, ...activeUpdate } : prev);
      setQuizzes(prev => prev.map(q => q.id === quizId ? { ...q, ...activeUpdate } : q));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}`);
    }
  };
  const cancelStart = async (quizId: string) => {
    if (isDemoMode) {
      const quizzes = mockStore.getQuizzes();
      const updated = quizzes.map((q: any) => q.id === quizId ? { ...q, status: 'waiting', startedAt: null, endsAt: null } : q);
      localStorage.setItem('demo_quizzes', JSON.stringify(updated));
      const activeQuiz = updated.find((q: any) => q.id === quizId);
      if (activeQuiz) setQuiz(activeQuiz);
      return;
    }
    try {
      const quizRef = doc(db, 'quizzes', quizId);
      await updateDoc(quizRef, { 
        status: 'waiting', 
        startedAt: null,
        endsAt: null 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}`);
    }
  };

  const updateParticipant = async (roll: string, updates: Partial<Participant>) => {
    if (!quiz?.id) return;
    
    if (isDemoMode) {
      const participants = mockStore.getResponsesForQuiz(quiz.id);
      const student = participants.find(p => p.roll === roll);
      if (student) {
        mockStore.saveResponse({ ...student, ...updates });
      }
      return;
    }
    try {
      const docRef = doc(db, 'quizzes', quiz.id, 'responses', roll);
      // Use setDoc with merge: true to avoid "No document to update" errors
      // Sanitize updates to remove undefined fields
      const sanitizedUpdates = sanitizeForFirestore(updates);
      await setDoc(docRef, sanitizedUpdates, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quiz.id}/responses/${roll}`);
    }
  };

  const leaveLobby = async (roll: string) => {
    if (!quiz?.id) return;
    if (isDemoMode) {
      mockStore.deleteResponse(quiz.id, roll);
      setCurrentStudentRoll(null);
      sessionStorage.removeItem('currentStudentRoll');
      localStorage.removeItem('currentStudentRoll');
      return;
    }
    try {
      const docRef = doc(db, 'quizzes', quiz.id, 'responses', roll);
      await deleteDoc(docRef);
      setCurrentStudentRoll(null);
      sessionStorage.removeItem('currentStudentRoll');
      localStorage.removeItem('currentStudentRoll');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `quizzes/${quiz.id}/responses/${roll}`);
      throw err;
    }
  };

  const gradeParticipant = async (quizId: string, participantId: string, manualGrades: Record<string, number>) => {
    if (isDemoMode) {
      const participants = mockStore.getResponsesForQuiz(quizId);
      const student = participants.find(p => p.roll === participantId);
      if (student) {
        mockStore.saveResponse({ ...student, manualGrades });
      }
      return;
    }
    try {
      const docRef = doc(db, 'quizzes', quizId, 'responses', participantId);
      const sanitizedGrades = sanitizeForFirestore({ manualGrades });
      await setDoc(docRef, sanitizedGrades, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}/responses/${participantId}`);
    }
  };

  const deleteQuiz = async (quizId: string) => {
    if (isDemoMode) {
      mockStore.deleteQuiz(quizId);
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
      if (quiz?.id === quizId) {
        setQuiz(null);
        localStorage.removeItem('activeRoomCode');
      }
      return;
    }
    try {
      // 1. Delete responses subcollection
      const responsesRef = collection(db, 'quizzes', quizId, 'responses');
      const responsesSnapshot = await getDocs(responsesRef);
      for (const docSnap of responsesSnapshot.docs) {
        await deleteDoc(doc(db, 'quizzes', quizId, 'responses', docSnap.id));
      }

      // 2. Delete questions subcollection
      const questionsRef = collection(db, 'quizzes', quizId, 'questions');
      const questionsSnapshot = await getDocs(questionsRef);
      for (const docSnap of questionsSnapshot.docs) {
        await deleteDoc(doc(db, 'quizzes', quizId, 'questions', docSnap.id));
      }

      // 3. Delete the quiz document itself
      await deleteDoc(doc(db, 'quizzes', quizId));
      
      // Update local state
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
      if (quiz?.id === quizId) {
        setQuiz(null);
        localStorage.removeItem('activeRoomCode');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `quizzes/${quizId}`);
    }
  };

  const isRollAllowed = (roll: string, patterns: string[]): boolean => {
    if (!patterns || patterns.length === 0) return true;

    const normalizedRoll = roll
      .trim()
      .toUpperCase()
      .replace(/[??????]/g, '-');

    return /^\d{4}[A-Z]{3}-\d{3}$/.test(normalizedRoll);
  };

  const calculateScore = (participant: Participant, quiz: Quiz, overrideQuestions?: Question[], excludeParagraphs: boolean = false): number => {
    let score = 0;
    const questions = overrideQuestions || quiz.questions || [];
    const answers = participant.answers || {};

    questions.forEach(q => {
      const studentAnswer = answers[q.id];
      if (!studentAnswer) return;

      if (q.type === 'Multiple Choice' || q.type === 'MCQ' || q.type === 'True/False') {
        if (studentAnswer === q.correctOption) {
          score += 1;
        }
      } else if (q.type === 'Multiple Correct' || q.type === 'MSQ') {
        const correctOptions = Array.isArray(q.correctOption) ? q.correctOption : [q.correctOption];
        const studentOptions = Array.isArray(studentAnswer) ? studentAnswer : [studentAnswer];
        
        if (correctOptions.length > 0) {
          const correctSelected = studentOptions.filter(opt => correctOptions.includes(opt)).length;
          const incorrectSelected = studentOptions.filter(opt => !correctOptions.includes(opt)).length;
          
          // Only give marks if NO incorrect options were selected
          if (incorrectSelected === 0 && correctSelected > 0) {
            score += (correctSelected / correctOptions.length);
          }
        }
      } else if (q.type === 'Paragraph') {
        if (!excludeParagraphs && participant.manualGrades?.[q.id]) {
          score += participant.manualGrades[q.id];
        }
      }
    });

    // Truncate to 2 decimal places
    return Math.floor(score * 100) / 100;
  };

  const resetParticipantSession = async (quizId: string, roll: string) => {
    if (isDemoMode) {
      mockStore.updateResponse(roll, { lastSeen: 0, isDisqualified: false, status: 'Appearing', sessionToken: null });
      return;
    }
    try {
      const docRef = doc(db, 'quizzes', quizId, 'responses', roll);
      await setDoc(docRef, {
        lastSeen: 0,
        isDisqualified: false,
        status: 'Appearing',
        cheatingAttempts: 0,
        sessionToken: null,
        attemptEndsAt: null,
        startTime: null,
        timeTaken: null
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizzes/${quizId}/responses/${roll}`);
    }
  };

  return (
    <QuizContext.Provider value={{ quiz, quizzes, participants, currentStudentRoll, draftQuiz, drafts, createQuiz, resetQuiz, saveDraft, deleteDraft, clearCurrentDraft, updateQuiz, fetchQuizById, joinQuiz, updateParticipant, leaveLobby, endQuiz, startSession, cancelStart, findQuizByRoomCode, gradeParticipant, calculateScore, deleteQuiz, isRollAllowed, resetParticipantSession, quizEnded, closeQuizEndedMessage, selectQuiz, loading }}>
      {children}
    </QuizContext.Provider>
  );
}

function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function useQuiz() {
  const context = useContext(QuizContext);
  if (context === undefined) {
    throw new Error('useQuiz must be used within a QuizProvider');
  }
  return context;
}










