import React, { useState, useEffect } from 'react';
import { Session, JoinSessionResponse } from './types';
import { StudentAuth } from './components/StudentAuth';
import { StudentChat } from './components/StudentChat';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';

const STUDENT_STORAGE_KEY = 'furikaeri_student_session';
const ADMIN_TOKEN_KEY = 'furikaeri_admin_token';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isNewSession, setIsNewSession] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Restore saved student session or admin token on initial mount
  useEffect(() => {
    const savedAdminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (savedAdminToken) {
      setAdminToken(savedAdminToken);
    }

    const savedStudent = localStorage.getItem(STUDENT_STORAGE_KEY);
    if (savedStudent) {
      try {
        const parsed = JSON.parse(savedStudent);
        if (parsed.id && parsed.passcode) {
          // Re-fetch latest session data from server
          fetch(`/api/sessions/${parsed.id}?passcode=${parsed.passcode}`)
            .then((res) => {
              if (res.ok) return res.json();
              throw new Error('Session not found');
            })
            .then((data) => {
              if (data.session) {
                setSession(data.session);
              }
            })
            .catch(() => {
              localStorage.removeItem(STUDENT_STORAGE_KEY);
            })
            .finally(() => {
              setIsInitializing(false);
            });
          return;
        }
      } catch (e) {
        localStorage.removeItem(STUDENT_STORAGE_KEY);
      }
    }
    setIsInitializing(false);
  }, []);

  // Handle student join
  const handleJoinSuccess = (res: JoinSessionResponse) => {
    setSession(res.session);
    setIsNewSession(res.isNew);
    setIsAdminMode(false);
    localStorage.setItem(
      STUDENT_STORAGE_KEY,
      JSON.stringify({
        id: res.session.id,
        passcode: res.session.passcode,
        studentName: res.session.studentName,
      })
    );
  };

  // Handle student logout
  const handleStudentLogout = () => {
    setSession(null);
    setIsNewSession(false);
    localStorage.removeItem(STUDENT_STORAGE_KEY);
  };

  // Handle student session message update
  const handleUpdateSession = (updated: Session) => {
    setSession(updated);
  };

  // Handle admin login success
  const handleAdminLoginSuccess = (token: string) => {
    setAdminToken(token);
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    setIsAdminMode(true);
  };

  // Handle admin logout
  const handleAdminLogout = () => {
    setAdminToken(null);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAdminMode(false);
  };

  // Handle admin token refresh
  const handleUpdateAdminToken = (newToken: string) => {
    setAdminToken(newToken);
    sessionStorage.setItem(ADMIN_TOKEN_KEY, newToken);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#5A5A40] text-sm">
          <span className="w-2 h-2 rounded-full bg-[#5A5A40] animate-ping" />
          <span>システム読み込み中...</span>
        </div>
      </div>
    );
  }

  // Admin Dashboard View
  if (isAdminMode && adminToken) {
    return (
      <AdminDashboard
        adminToken={adminToken}
        onLogout={handleAdminLogout}
        onUpdateToken={handleUpdateAdminToken}
      />
    );
  }

  // Student Chat View
  if (session) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex flex-col">
        {/* Floating teacher portal toggle for classroom ease */}
        <div className="fixed bottom-3 right-3 z-20">
          <button
            type="button"
            onClick={() => {
              if (adminToken) {
                setIsAdminMode(true);
              } else {
                setIsAdminModalOpen(true);
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-xs border border-[#E5E4DE] text-[11px] text-[#686762] hover:text-[#2A2925] shadow-xs hover:bg-[#F4F3EE] transition-all cursor-pointer flex items-center gap-1"
          >
            <span>教師画面へ</span>
          </button>
        </div>

        <StudentChat
          session={session}
          onUpdateSession={handleUpdateSession}
          onLogout={handleStudentLogout}
          isNewSession={isNewSession}
        />

        <AdminLoginModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onLoginSuccess={handleAdminLoginSuccess}
        />
      </div>
    );
  }

  // Student Auth View
  return (
    <>
      <StudentAuth
        onJoinSuccess={handleJoinSuccess}
        onOpenAdminLogin={() => {
          if (adminToken) {
            setIsAdminMode(true);
          } else {
            setIsAdminModalOpen(true);
          }
        }}
      />
      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onLoginSuccess={handleAdminLoginSuccess}
      />
    </>
  );
}
