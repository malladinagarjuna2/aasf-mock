import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile as firebaseUpdateProfile,
  signInWithEmailAndPassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword as firebaseUpdatePassword,
  sendPasswordResetEmail,
  sendEmailVerification as firebaseSendEmailVerification,
  reload
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isDemoMode } from '../firebase';

interface Profile {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string;
  bio: string;
  department: string;
  role: string;
  roll?: string;
  updated_at: any;
}

const rawAdminConfig = [
  import.meta.env.VITE_ADMIN_EMAILS
]
  .filter(Boolean)
  .join(',');

const ADMIN_EMAILS = Array.from(
  new Set(
    rawAdminConfig
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)
  )
);

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized) || normalized.startsWith('admin@');
}

interface AuthContextType {
  user: User | any | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string, username: string, role: string, roll?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  sendOTP: (email: string) => Promise<{ success: boolean; message: string; devMode?: boolean; otp?: string }>;
  verifyOTP: (email: string, otp: string) => Promise<{ success: boolean; message: string }>;
  resendEmailVerification: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | any | null>(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem('demo_user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem('demo_profile');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [loading, setLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return;

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);

      // Cleanup previous profile listener if it exists
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        console.log('User signed in, fetching profile for:', user.uid);
        const profileRef = doc(db, 'users', user.uid);

        unsubscribeProfile = onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as Profile);
          } else {
            console.log('Profile not found, creating initial profile for:', user.uid);
            const initialProfile: Profile = {
              id: user.uid,
              full_name: user.displayName || '',
              username: user.email?.split('@')[0] || '',
              avatar_url: user.photoURL || '',
              bio: '',
              department: '',
              role: isAdminEmail(user.email) ? 'admin' : 'teacher',
              roll: '',
              updated_at: serverTimestamp(),
            };
            setDoc(profileRef, initialProfile).catch(err => {
              console.error('Error creating profile:', err);
            });
            setProfile(initialProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error(`Error fetching profile for ${user.uid}:`, error.message);
          // If permission error, maybe log more auth state
          if (error.message.includes('permission')) {
            console.warn('Authentication token might be stale or rules are too restrictive.');
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signOut = async () => {
    if (isDemoMode) {
      setUser(null);
      setProfile(null);
      localStorage.removeItem('demo_user');
      localStorage.removeItem('demo_profile');
      return;
    }
    await firebaseSignOut(auth);
  };

  const signInWithGoogle = async () => {
    if (isDemoMode) {
      const mockUser = { uid: 'demo-teacher', displayName: 'Demo Teacher', email: 'demo@aasf.edu' };
      const mockProfile: Profile = {
        id: 'demo-teacher',
        full_name: 'Demo Teacher',
        username: 'demoteacher',
        avatar_url: 'https://picsum.photos/seed/teacher/100/100',
        bio: 'Default demo account.',
        department: 'Science',
        role: 'teacher',
        updated_at: new Date().toISOString()
      };
      setUser(mockUser);
      setProfile(mockProfile);
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      localStorage.setItem('demo_profile', JSON.stringify(mockProfile));
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Silence log for user cancellation to avoid console noise
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Error signing in with Google:', error);
      }

      // Friendly error mapping
      if (error.code === 'auth/popup-blocked') {
        throw new Error("The sign-in window was blocked by your browser. Please allow popups for this site or try opening the app in a new tab.");
      }
      if (error.code === 'auth/cancelled-popup-request') {
        throw new Error("Only one sign-in window can be open at a time. Please check for existing windows.");
      }
      if (error.code === 'auth/internal-error' && error.message?.includes('popup')) {
        throw new Error("An internal error occurred with the sign-in window. Try opening the app in a new web tab.");
      }

      // For popup-closed-by-user or others, throw original error so caller can identify by code
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (isDemoMode) {
      const mockUser = { uid: 'demo-teacher', displayName: 'Demo Teacher', email };
      const mockProfile: Profile = {
        id: 'demo-teacher',
        full_name: 'Demo Teacher',
        username: 'demoteacher',
        avatar_url: 'https://picsum.photos/seed/teacher/100/100',
        bio: 'Default demo account.',
        department: 'Science',
        role: 'teacher',
        updated_at: new Date().toISOString()
      };
      setUser(mockUser);
      setProfile(mockProfile);
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      localStorage.setItem('demo_profile', JSON.stringify(mockProfile));
      return;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await reload(userCredential.user);
      await userCredential.user.getIdToken(true);

      if (!userCredential.user.emailVerified) {
        const verificationError = new Error('Please verify your email before signing in.');
        (verificationError as Error & { code: string }).code = 'auth/email-not-verified';
        throw verificationError;
      }
    } catch (error) {
      console.error('Error signing in with email:', error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string, username: string, role: string, roll?: string) => {
    if (isDemoMode) {
      const mockUser = { uid: 'demo-' + Date.now(), displayName: name, email };
      const mockProfile: Profile = {
        id: mockUser.uid,
        full_name: name,
        username,
        avatar_url: '',
        bio: '',
        department: '',
        role,
        roll: roll || '',
        updated_at: new Date().toISOString()
      };
      setUser(mockUser);
      setProfile(mockProfile);
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      localStorage.setItem('demo_profile', JSON.stringify(mockProfile));
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update auth profile
      await firebaseUpdateProfile(user, { displayName: name });

      // Create firestore profile
      const profileRef = doc(db, 'users', user.uid);
      const initialProfile: Profile = {
        id: user.uid,
        full_name: name,
        username: username,
        avatar_url: '',
        bio: '',
        department: '',
        role: isAdminEmail(email) ? 'admin' : role,
        roll: roll || '',
        updated_at: serverTimestamp(),
      };
      await setDoc(profileRef, initialProfile);
      await firebaseSendEmailVerification(user);
    } catch (error) {
      console.error('Error signing up with email:', error);
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user || !user.email) throw new Error("No user logged in");

    try {
      // Check if user has a password provider
      const hasPassword = user.providerData.some((p: any) => p.providerId === 'password');

      if (hasPassword && currentPassword) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      }

      await firebaseUpdatePassword(user, newPassword);
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    // Profile is handled by onSnapshot, so this is mostly for compatibility
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (isDemoMode) {
      const newProfile = { ...profile, ...data } as Profile;
      setProfile(newProfile);
      localStorage.setItem('demo_profile', JSON.stringify(newProfile));
      return;
    }

    if (!user) throw new Error("No user logged in");
    const profileRef = doc(db, 'users', user.uid);
    await setDoc(profileRef, { ...data, updated_at: serverTimestamp() }, { merge: true });
  };

  const sendOTP = async (email: string) => {
    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send OTP');
      return data;
    } catch (error: any) {
      console.error('Error in sendOTP:', error);
      throw error;
    }
  };

  const verifyOTP = async (email: string, otp: string) => {
    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to verify OTP');
      return data;
    } catch (error: any) {
      console.error('Error in verifyOTP:', error);
      throw error;
    }
  };

  const resendEmailVerification = async () => {
    if (isDemoMode) return;
    if (!auth.currentUser) {
      throw new Error('No signed-in user available to verify.');
    }
    await firebaseSendEmailVerification(auth.currentUser);
  };

  const refreshEmailVerification = async () => {
    if (isDemoMode) return true;
    if (!auth.currentUser) {
      throw new Error('No signed-in user available to refresh.');
    }
    await reload(auth.currentUser);
    await auth.currentUser.getIdToken(true);
    setUser({ ...auth.currentUser });
    return auth.currentUser.emailVerified;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, signInWithGoogle, signInWithEmail, signUpWithEmail, changePassword, sendPasswordReset, refreshProfile, updateProfile, sendOTP, verifyOTP, resendEmailVerification, refreshEmailVerification }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

