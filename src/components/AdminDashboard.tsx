import React, { useState, useEffect, useRef } from 'react';
import { Session, SystemInstructionData } from '../types';
import { MathMarkdown } from './MathMarkdown';
import {
  Users,
  Sliders,
  Download,
  Trash2,
  KeyRound,
  RefreshCw,
  LogOut,
  ChevronRight,
  MessageSquare,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Eye,
  EyeOff,
  X,
  FileSpreadsheet,
  FileJson,
  Lock,
  ShieldCheck,
} from 'lucide-react';

interface AdminDashboardProps {
  adminToken: string;
  onLogout: () => void;
  onUpdateToken?: (newToken: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ adminToken, onLogout, onUpdateToken }) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'prompt' | 'data' | 'settings'>('sessions');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Prompt editor state (Protected from polling overwrites)
  const [serverPrompt, setServerPrompt] = useState<string>('');
  const [promptDraft, setPromptDraft] = useState<string>('');
  const [isPromptDirty, setIsPromptDirty] = useState<boolean>(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptSaveSuccess, setPromptSaveSuccess] = useState(false);

  // Re-authentication modal state (for seamless recovery if server restarted or session timed out)
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [showReauthPassword, setShowReauthPassword] = useState(false);
  const [isReauthing, setIsReauthing] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  // Passcode reissue state
  const [reissuedInfo, setReissuedInfo] = useState<{ id: string; name: string; code: string } | null>(null);
  const [sessionToReissue, setSessionToReissue] = useState<{ id: string; name: string } | null>(null);
  const [isReissuing, setIsReissuing] = useState(false);

  // Session deletion confirmation modal state
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  // In-app notification toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, message });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Settings & Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset confirmation modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  // Handle re-authentication if session expired
  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    setReauthError(null);
    try {
      setIsReauthing(true);
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: reauthPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'パスワードが正しくありません');
      }
      if (onUpdateToken && data.token) {
        onUpdateToken(data.token);
      }
      setReauthPassword('');
      setShowReauthModal(false);
      showToast('管理者として再認証しました', 'success');
      fetchSessions();
      fetchPrompt();
    } catch (err: any) {
      setReauthError(err.message || '認証に失敗しました');
    } finally {
      setIsReauthing(false);
    }
  };

  // Fetch sessions
  const fetchSessions = async () => {
    try {
      setIsLoadingSessions(true);
      const res = await fetch('/api/sessions', {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        setShowReauthModal(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        // Update selectedSession reference if currently viewing
        if (selectedSession) {
          const updated = data.sessions?.find((s: Session) => s.id === selectedSession.id);
          if (updated) setSelectedSession(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Fetch system prompt
  const fetchPrompt = async () => {
    try {
      const res = await fetch('/api/system-instruction');
      if (res.ok) {
        const data: SystemInstructionData = await res.json();
        setServerPrompt(data.instruction);
        // Only update draft if teacher hasn't modified the draft! (Draft protection)
        if (!isPromptDirty) {
          setPromptDraft(data.instruction);
        }
      }
    } catch (err) {
      console.error('Failed to fetch prompt:', err);
    }
  };

  // Manual on-demand sync
  const handleManualSync = async () => {
    await Promise.all([fetchSessions(), fetchPrompt()]);
    setLastSyncedAt(new Date());
  };

  useEffect(() => {
    fetchSessions();
    fetchPrompt();
  }, [adminToken]);

  // Handle saving prompt
  const handleSavePrompt = async () => {
    if (!promptDraft.trim()) return;
    try {
      setIsSavingPrompt(true);
      const res = await fetch('/api/system-instruction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ instruction: promptDraft }),
      });

      if (res.ok) {
        setServerPrompt(promptDraft);
        setIsPromptDirty(false);
        setPromptSaveSuccess(true);
        setTimeout(() => setPromptSaveSuccess(false), 3000);
      } else {
        alert('プロンプトの保存に失敗しました');
      }
    } catch (err) {
      console.error('Error saving prompt:', err);
      alert('通信エラーが発生しました');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Reset prompt to default template
  const handleResetPromptToDefault = () => {
    const defaultTemplate = `# あなたの役割
あなたは数学の授業における振り返りをサポートするAIアシスタントです。
授業終わりの5分間で、生徒が「思いつくままに書いた雑多なメモ（単語、走り書き、感情、間違えた問題など）」を優しく受け止め、生徒自身が「何を考え、どう成長したか（変容や気づき）」を言語化できるよう手助けします。

# 基本スタンス
- 【重要】生徒からの情報をもとに、振り返りを生成し、回答する。どうしても振り返りを作成するのに必要な情報が不足する場合は、一度だけ質問を返すことができる。

# 対話の引き出し手法（状況に応じて使い分ける）
1. 【ソクラテス式問答】（問いかけによる気づき）
   生徒のつぶやきに対して、「もし〜だったらどうなるかな？」「その数字はどこから出てきたのかな？」と問いかけ、自分で法則や理由に気づかせます。
2. 【5Whys（なぜの深掘り）】（プロセスの具体化）
   「計算ミスした」→「どこでミスした？」→「符号を変えるのを忘れた」→「なんで忘れちゃったんだろう？」と、優しくステップを踏んで原因や対策（調整）へ導きます。

# 対話のステップ（ワークフロー）

## ステップ1：雑多なメモの受付
生徒から、単語、走り書き、間違えた問題などの「素材」を投げかけてもらいます。

## ステップ2：生徒からの情報に応じた「振り返り文章」を提案します。

※出力フォーマット例：
【Aパターン：自分の成長・気づき中心】
今日の授業では〜で苦戦しましたが、〇〇ということに気づくことができました。次は〜を意識して解いてみたいです。
【Bパターン：これからの作戦・学びの調整中心】
〜の問題でミスをしてしまいました。原因は〜だとわかったので、次は〜という方法で確かめをします。`;

    setPromptDraft(defaultTemplate);
    setIsPromptDirty(true);
  };

  // Delete single session execution
  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    const { id, name } = sessionToDelete;

    try {
      setIsDeletingSession(true);
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (selectedSession?.id === id) {
          setSelectedSession(null);
        }
        setSessionToDelete(null);
        showToast(`生徒「${name}」のアカウントを削除しました`, 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'セッションの削除に失敗しました', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('削除処理中にエラーが発生しました', 'error');
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Reissue passcode execution
  const handleConfirmReissuePasscode = async () => {
    if (!sessionToReissue) return;
    const { id, name } = sessionToReissue;

    try {
      setIsReissuing(true);
      const res = await fetch(`/api/sessions/${id}/reissue-passcode`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setReissuedInfo({ id, name, code: data.passcode });
        setSessionToReissue(null);
        fetchSessions();
        showToast(`「${name}」の4桁コードを「${data.passcode}」に再発行しました`, 'success');
      } else {
        showToast('パスコードの再発行に失敗しました', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました', 'error');
    } finally {
      setIsReissuing(false);
    }
  };

  // Reset all sessions
  const handleResetAllSessions = async () => {
    try {
      setIsResetting(true);
      const res = await fetch('/api/sessions/reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (res.ok) {
        setSessions([]);
        setSelectedSession(null);
        setShowResetConfirm(false);
        showToast('全生徒のアカウントと対話ログをリセットしました', 'success');
      } else {
        showToast('リセット処理に失敗しました', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('通信エラーが発生しました', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Change admin password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordChangeMessage({ type: 'error', text: '新しいパスワードの確認入力が一致しません' });
      return;
    }

    if (newPassword.length < 3) {
      setPasswordChangeMessage({ type: 'error', text: '新しいパスワードは3文字以上で指定してください' });
      return;
    }

    try {
      setIsChangingPassword(true);
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token && onUpdateToken) {
          onUpdateToken(data.token);
        }
        setPasswordChangeMessage({ type: 'success', text: '管理者パスワードを変更しました。次回ログイン時から新しいパスワードが有効になります。' });
        showToast('管理者パスワードを正常に変更しました', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        if (res.status === 401) {
          setShowReauthModal(true);
        }
        setPasswordChangeMessage({ type: 'error', text: data.error || 'パスワードの変更に失敗しました' });
      }
    } catch (err) {
      console.error(err);
      setPasswordChangeMessage({ type: 'error', text: '通信エラーが発生しました' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Export CSV
  const exportCSV = () => {
    if (sessions.length === 0) {
      showToast('エクスポートする生徒セッションがありません', 'info');
      return;
    }

    const headers = ['生徒名/出席番号', 'パスコード', '発言回数', '作成日時', '最終更新日時', '対話ログ全文'];
    const rows = sessions.map((s) => {
      const chatTranscript = s.messages
        .map((m) => `[${m.role === 'user' ? '生徒' : 'AI'}] ${m.content.replace(/"/g, '""')}`)
        .join('\n---\n');

      return [
        `"${s.studentName.replace(/"/g, '""')}"`,
        `"${s.passcode}"`,
        s.messages.length,
        `"${new Date(s.createdAt).toLocaleString('ja-JP')}"`,
        `"${new Date(s.updatedAt).toLocaleString('ja-JP')}"`,
        `"${chatTranscript}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `振り返りセッション一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSVファイルをダウンロードしました', 'success');
  };

  // Export JSON
  const exportJSON = () => {
    if (sessions.length === 0) {
      showToast('エクスポートする生徒セッションがありません', 'info');
      return;
    }
    const jsonString = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalStudents: sessions.length,
        sessions,
      },
      null,
      2
    );
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `振り返りセッション_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered sessions
  const filteredSessions = sessions.filter(
    (s) =>
      s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.passcode.includes(searchQuery)
  );

  const totalMessages = sessions.reduce((acc, s) => acc + s.messages.length, 0);

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#2A2925] flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-[#E5E4DE] px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#5A5A40] text-white flex items-center justify-center font-bold text-sm shadow-xs">
              教
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg text-[#2A2925]">
                振り返りジェネレーター 教師用ダッシュボード
              </h1>
              <p className="text-xs text-[#686762]">
                公立中学校 数学授業・自習 セッション監視＆プロンプト管理
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shadow-xs cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-[#5A5A40] text-white border-[#5A5A40]'
                  : 'bg-white hover:bg-[#F4F3EE] text-[#2A2925] border-[#E5E4DE]'
              }`}
              title="管理者パスワード変更画面を開く"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>パスワード変更</span>
            </button>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isLoadingSessions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E4DE] text-xs font-semibold text-[#2A2925] bg-white hover:bg-[#F4F3EE] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="最新データに同期"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin text-[#5A5A40]' : 'text-[#5A5A40]'}`} />
              <span>{isLoadingSessions ? '同期中...' : '最新データに同期'}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F3EE] hover:bg-rose-50 hover:text-rose-700 text-xs font-medium text-[#2A2925] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>管理者ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 flex flex-col">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="p-4 rounded-xl bg-white border border-[#E5E4DE] shadow-xs">
            <div className="text-xs text-[#686762] mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#5A5A40]" />
              参加生徒数
            </div>
            <div className="text-2xl font-bold text-[#2A2925]">
              {sessions.length} <span className="text-xs font-normal text-[#686762]">名</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-[#E5E4DE] shadow-xs">
            <div className="text-xs text-[#686762] mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-[#5A5A40]" />
              総メッセージ数
            </div>
            <div className="text-2xl font-bold text-[#2A2925]">
              {totalMessages} <span className="text-xs font-normal text-[#686762]">件</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 p-4 rounded-xl bg-white border border-[#E5E4DE] shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs text-[#686762] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 text-[#5A5A40]" />
                  データ同期（任意更新）
                </span>
                <span className="text-[11px] text-[#686762]">
                  {lastSyncedAt.toLocaleTimeString('ja-JP')}
                </span>
              </div>
              <div className="text-xs text-[#686762] mt-0.5">
                自動同期は停止中。ボタンを押すと手動で最新化されます。
              </div>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isLoadingSessions}
              className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`} />
              <span>{isLoadingSessions ? '同期中...' : '手動で同期する'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#E5E4DE] mb-6 overflow-x-auto gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'sessions'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#686762] hover:text-[#2A2925]'
            }`}
          >
            <Users className="w-4 h-4" />
            生徒セッション監視 ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'prompt'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#686762] hover:text-[#2A2925]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            AI指導方針（プロンプト）設定
            {isPromptDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-500" title="未保存の変更があります" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'data'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#686762] hover:text-[#2A2925]'
            }`}
          >
            <Download className="w-4 h-4" />
            データ出力 & リセット
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#686762] hover:text-[#2A2925]'
            }`}
          >
            <Lock className="w-4 h-4" />
            管理者パスワード変更
          </button>
        </div>

        {/* Tab 1: Live Sessions Monitoring */}
        {activeTab === 'sessions' && (
          <div className="flex-1 flex flex-col">
            {/* Search and filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-4">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#686762]" />
                <input
                  type="text"
                  placeholder="生徒名・出席番号・パスコードで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E4DE] rounded-lg text-sm text-[#2A2925] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                />
              </div>
              <div className="flex items-center gap-3 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isLoadingSessions}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F4F3EE] text-xs font-semibold text-[#2A2925] shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                  title="生徒セッション一覧を最新に更新"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin text-[#5A5A40]' : 'text-[#5A5A40]'}`} />
                  <span>{isLoadingSessions ? '同期中...' : '最新に更新'}</span>
                </button>
                <div className="text-xs text-[#686762]">
                  該当: <span className="font-semibold text-[#2A2925]">{filteredSessions.length}</span> 件
                </div>
              </div>
            </div>

            {/* Passcode reissue notification banner */}
            {reissuedInfo && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <div>
                  <strong>{reissuedInfo.name}</strong> の新しい4桁パスコードは「
                  <span className="font-mono font-bold text-sm bg-white px-2 py-0.5 rounded border border-emerald-300">
                    {reissuedInfo.code}
                  </span>
                  」です。生徒に伝えてください。
                </div>
                <button
                  type="button"
                  onClick={() => setReissuedInfo(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs ml-3 underline"
                >
                  閉じる
                </button>
              </div>
            )}

            {sessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-[#E5E4DE] p-6">
                <Users className="w-12 h-12 text-[#5A5A40]/40 mb-3" />
                <h3 className="font-bold text-base text-[#2A2925] mb-1">生徒セッションはまだありません</h3>
                <p className="text-xs text-[#686762] max-w-md">
                  生徒画面から生徒名（または出席番号）を入力して振り返りチャットを開始すると、ここにリアルタイムでログが表示されます。
                </p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-[#E5E4DE] p-6">
                <p className="text-sm text-[#686762]">検索条件に一致する生徒が見つかりませんでした。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Session list (left 1 column on desktop) */}
                <div className="lg:col-span-1 bg-white rounded-xl border border-[#E5E4DE] shadow-xs overflow-hidden flex flex-col max-h-[640px]">
                  <div className="p-3 bg-[#F4F3EE] border-b border-[#E5E4DE] text-xs font-semibold text-[#686762] flex justify-between items-center">
                    <span>生徒一覧</span>
                    <span>発言数 / パスコード</span>
                  </div>
                  <div className="divide-y divide-[#E5E4DE] overflow-y-auto flex-1">
                    {filteredSessions.map((s) => {
                      const isSelected = selectedSession?.id === s.id;
                      const lastMsg = s.messages[s.messages.length - 1];
                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSession(s)}
                          className={`p-3 transition-colors cursor-pointer text-left ${
                            isSelected
                              ? 'bg-[#5A5A40]/10 border-l-4 border-[#5A5A40]'
                              : 'hover:bg-[#F9F8F3]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-sm text-[#2A2925] truncate">
                              {s.studentName}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#E5E4DE] text-[#2A2925] font-semibold" title="4桁パスコード">
                                #{s.passcode}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#5A5A40]/15 text-[#5A5A40] font-medium">
                                {s.messages.length}件
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-[#686762] truncate mt-1">
                            {lastMsg
                              ? `${lastMsg.role === 'user' ? '生徒: ' : 'AI: '}${lastMsg.content}`
                              : '（対話未開始）'}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-[#686762] mt-2">
                            <span>{new Date(s.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionToDelete({ id: s.id, name: s.studentName });
                                }}
                                className="p-1 rounded text-[#686762] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="この生徒アカウントを削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-[#5A5A40] flex items-center font-medium">
                                ログを見る <ChevronRight className="w-3 h-3 ml-0.5" />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Session details & transcript (right 2 columns) */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-[#E5E4DE] shadow-xs flex flex-col max-h-[640px] overflow-hidden">
                  {selectedSession ? (
                    <>
                      {/* Transcript Header */}
                      <div className="p-4 border-b border-[#E5E4DE] bg-[#F4F3EE] flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="font-bold text-base text-[#2A2925]">
                              {selectedSession.studentName}
                            </h2>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-white rounded border border-[#E5E4DE] text-[#2A2925]">
                              コード: {selectedSession.passcode}
                            </span>
                          </div>
                          <div className="text-xs text-[#686762] mt-0.5">
                            開始: {new Date(selectedSession.createdAt).toLocaleString('ja-JP')} ｜ 対話数: {selectedSession.messages.length}件
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSessionToReissue({ id: selectedSession.id, name: selectedSession.studentName })}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F4F3EE] text-[#2A2925] transition-colors cursor-pointer"
                            title="パスコード再発行"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-[#5A5A40]" />
                            <span>コード再発行</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSessionToDelete({ id: selectedSession.id, name: selectedSession.studentName })}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer"
                            title="セッション削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>削除</span>
                          </button>
                        </div>
                      </div>

                      {/* Messages body */}
                      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#FDFCF8]">
                        {selectedSession.messages.length === 0 ? (
                          <div className="text-center py-12 text-xs text-[#686762]">
                            この生徒はまだ発言していません。
                          </div>
                        ) : (
                          selectedSession.messages.map((m) => {
                            const isUser = m.role === 'user';
                            return (
                              <div
                                key={m.id}
                                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                              >
                                <div className="text-[11px] text-[#686762] mb-1 px-1 flex items-center gap-1.5">
                                  <span>{isUser ? selectedSession.studentName : 'AIアシスタント'}</span>
                                  <span>・</span>
                                  <span>{new Date(m.createdAt).toLocaleTimeString('ja-JP')}</span>
                                </div>
                                <div
                                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                                    isUser
                                      ? 'bg-[#5A5A40] text-white rounded-br-xs'
                                      : 'bg-white text-[#2A2925] border border-[#E5E4DE] rounded-bl-xs'
                                  }`}
                                >
                                  {isUser ? (
                                    <div className="whitespace-pre-wrap leading-relaxed">
                                      {m.content}
                                    </div>
                                  ) : (
                                    <MathMarkdown content={m.content} />
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#686762]">
                      <Eye className="w-10 h-10 text-[#5A5A40]/30 mb-2" />
                      <p className="text-sm font-medium">左の一覧から生徒を選択してください</p>
                      <p className="text-xs text-[#686762] mt-1">過去の対話ログと提案された振り返り文章を閲覧できます。</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: AI System Prompt Editor */}
        {activeTab === 'prompt' && (
          <div className="bg-white rounded-xl border border-[#E5E4DE] p-6 shadow-xs flex-1 flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-[#E5E4DE]">
              <div>
                <h2 className="font-bold text-base text-[#2A2925]">
                  AIシステム指示（指導方針プロンプト）エディタ
                </h2>
                <p className="text-xs text-[#686762] mt-0.5">
                  ここで保存したプロンプトは、次回以降の全生徒の対話へ即座に反映されます。
                  編集中はバックグラウンド更新で勝手に上書きされないよう保護されています。
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetPromptToDefault}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] transition-colors"
                title="初期テンプレートに戻す"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>初期設定に戻す</span>
              </button>
            </div>

            {/* Prompt Guidelines Card */}
            <div className="mb-4 p-3 bg-[#F4F3EE] rounded-lg border border-[#E5E4DE] text-xs text-[#2A2925] space-y-1">
              <div className="font-bold text-[#5A5A40]">💡 公立中学校向け 指導方針のポイント</div>
              <ul className="list-disc ml-4 space-y-0.5 text-[#686762]">
                <li><strong>ソクラテス式問答</strong>: 答えを言わず「もし〜だったらどうなるかな？」と問いかけ、気づきを促します。</li>
                <li><strong>5Whys（なぜの深掘り）</strong>: ミスを否定せず「どこで間違えた？」「どうしてかな？」と対策へ導きます。</li>
                <li><strong>A/Bパターン提示</strong>: 【Aパターン：気づき中心】【Bパターン：作戦中心】の定型形式で提案すると生徒が選びやすくなります。</li>
              </ul>
            </div>

            {/* Prompt Textarea */}
            <div className="flex-1 flex flex-col min-h-[360px]">
              <textarea
                value={promptDraft}
                onChange={(e) => {
                  setPromptDraft(e.target.value);
                  setIsPromptDirty(true);
                }}
                className="flex-1 w-full p-4 font-mono text-xs sm:text-sm bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-[#2A2925] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                placeholder="AIへのシステムプロンプトを入力..."
              />
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 pt-4 border-t border-[#E5E4DE] flex items-center justify-between">
              <div className="text-xs text-[#686762] flex items-center gap-2">
                {isPromptDirty ? (
                  <span className="text-amber-600 font-medium">● 未保存の変更があります</span>
                ) : (
                  <span className="text-emerald-600 font-medium">✓ 最新のプロンプトが保存されています</span>
                )}
                {promptSaveSuccess && (
                  <span className="text-emerald-700 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> 保存完了！クラス全体に適用されました
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPromptDraft(serverPrompt);
                    setIsPromptDirty(false);
                  }}
                  disabled={!isPromptDirty}
                  className="px-4 py-2 rounded-lg border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] disabled:opacity-40 transition-colors"
                >
                  変更を取り消す
                </button>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  disabled={isSavingPrompt || !promptDraft.trim()}
                  className="px-5 py-2 rounded-lg bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingPrompt ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <span>プロンプトを保存して適用</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Data Export & Reset */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* Export Card */}
            <div className="bg-white rounded-xl border border-[#E5E4DE] p-6 shadow-xs">
              <h2 className="font-bold text-base text-[#2A2925] mb-2 flex items-center gap-2">
                <Download className="w-4 h-4 text-[#5A5A40]" />
                生徒の振り返りログ 一括エクスポート
              </h2>
              <p className="text-xs text-[#686762] mb-5">
                クラス全体の対話データ（生徒名、パスコード、発言内容、作成された振り返り文章）を保存・印刷・提出用にダウンロードします。
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[#E5E4DE] bg-[#FDFCF8] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-sm text-[#2A2925] flex items-center gap-2 mb-1">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                      CSV形式でダウンロード
                    </div>
                    <p className="text-xs text-[#686762] mb-4">
                      ExcelやGoogleスプレッドシートで読み込み可能（文字化け防止BOM付きUTF-8）。生徒別の一覧表として評価・確認に最適です。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#5A5A40] text-white text-xs font-semibold hover:bg-[#464632] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    CSVファイルをダウンロード ({sessions.length}名分)
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-[#E5E4DE] bg-[#FDFCF8] flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-sm text-[#2A2925] flex items-center gap-2 mb-1">
                      <FileJson className="w-4 h-4 text-amber-700" />
                      JSON形式でダウンロード
                    </div>
                    <p className="text-xs text-[#686762] mb-4">
                      メタデータやタイムスタンプを含む構造化データ全体のバックアップ用です。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportJSON}
                    className="w-full py-2.5 px-4 rounded-lg border border-[#E5E4DE] bg-white text-[#2A2925] text-xs font-semibold hover:bg-[#F4F3EE] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    JSONファイルをダウンロード
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone: Reset All Sessions */}
            <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-base text-rose-900">
                    セッションの一括リセット（授業終了時・新単元開始時）
                  </h3>
                  <p className="text-xs text-[#686762] mt-1 mb-4">
                    全生徒のセッションと会話履歴を削除して初期状態に戻します。
                    次の授業や新しいクラスで新しく使い始める際に利用してください。
                    （※事前にCSV等のバックアップを推奨します）
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>全セッションを一括リセットする</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Admin Settings (Password change) */}
        {activeTab === 'settings' && (
          <div className="max-w-xl">
            <div className="bg-white rounded-xl border border-[#E5E4DE] p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-[#F4F3EE] text-[#5A5A40]">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-[#2A2925]">
                    管理者パスワードの変更
                  </h2>
                  <p className="text-xs text-[#686762]">
                    教師用ダッシュボードのログイン用パスワードを変更します
                  </p>
                </div>
              </div>

              {/* Security info banner */}
              <div className="p-3.5 my-4 rounded-lg bg-[#FDFCF8] border border-[#E5E4DE] text-xs text-[#686762] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#2A2925]">
                  <ShieldCheck className="w-4 h-4 text-[#5A5A40]" />
                  <span>パスワード設定について</span>
                </div>
                <p>・初期状態のパスワードは「<strong>admin</strong>」です。</p>
                <p>・生徒による誤操作や不正アクセスを防ぐため、3文字以上の強固なパスワードに変更してください。</p>
                <p>・変更完了後、次回ログイン時から新しいパスワードが有効になります。</p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#2A2925] mb-1">
                    現在のパスワード <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full pl-3 pr-10 py-2 text-sm bg-[#FDFCF8] border border-[#E5E4DE] rounded-lg text-[#2A2925] focus:ring-2 focus:ring-[#5A5A40] focus:outline-none"
                      placeholder="現在のパスワード (初期値: admin)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686762] hover:text-[#2A2925] p-1 cursor-pointer"
                      title={showCurrentPassword ? '非表示にする' : '表示する'}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2A2925] mb-1">
                    新しいパスワード <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full pl-3 pr-10 py-2 text-sm bg-[#FDFCF8] border border-[#E5E4DE] rounded-lg text-[#2A2925] focus:ring-2 focus:ring-[#5A5A40] focus:outline-none"
                      placeholder="新しいパスワード（3文字以上）"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686762] hover:text-[#2A2925] p-1 cursor-pointer"
                      title={showNewPassword ? '非表示にする' : '表示する'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2A2925] mb-1">
                    新しいパスワード（確認用） <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-3 pr-10 py-2 text-sm bg-[#FDFCF8] border border-[#E5E4DE] rounded-lg text-[#2A2925] focus:ring-2 focus:ring-[#5A5A40] focus:outline-none"
                      placeholder="もう一度入力してください"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#686762] hover:text-[#2A2925] p-1 cursor-pointer"
                      title={showConfirmPassword ? '非表示にする' : '表示する'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {passwordChangeMessage && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      passwordChangeMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {passwordChangeMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    )}
                    <span>{passwordChangeMessage.text}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isChangingPassword ? '更新中...' : 'パスワードを更新する'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Reset All Sessions */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E4DE]">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-base text-[#2A2925]">全セッションのリセット確認</h3>
            </div>
            <p className="text-xs text-[#686762] leading-relaxed mb-4">
              現在登録されている全 <strong>{sessions.length}</strong> 名の生徒データおよび対話ログが完全に消去されます。
              この操作は取り消せません。本当にリセットを実行しますか？
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleResetAllSessions}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? '処理中...' : 'すべて削除してリセット'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Single Student Deletion */}
      {sessionToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E4DE]">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <Trash2 className="w-6 h-6" />
              <h3 className="font-bold text-base text-[#2A2925]">生徒アカウントの削除確認</h3>
            </div>
            <p className="text-xs text-[#686762] leading-relaxed mb-4">
              生徒 <strong className="text-[#2A2925] font-bold">「{sessionToDelete.name}」</strong> のアカウント情報、およびこれまでの対話履歴（振り返り文章含む）を完全に削除します。
              <br />
              <span className="text-rose-600 mt-1 inline-block">※この操作は取り消せません。</span>
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                disabled={isDeletingSession}
                className="px-4 py-2 rounded-lg border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSession}
                disabled={isDeletingSession}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingSession ? '削除中...' : 'アカウントを削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Passcode Reissue */}
      {sessionToReissue && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5E4DE]">
            <div className="flex items-center gap-3 text-[#5A5A40] mb-3">
              <KeyRound className="w-6 h-6" />
              <h3 className="font-bold text-base text-[#2A2925]">パスコードの再発行確認</h3>
            </div>
            <p className="text-xs text-[#686762] leading-relaxed mb-4">
              生徒 <strong className="text-[#2A2925] font-bold">「{sessionToReissue.name}」</strong> のログイン用4桁パスコードを新しいランダムな番号に上書き再発行します。よろしいですか？
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E4DE]">
              <button
                type="button"
                onClick={() => setSessionToReissue(null)}
                disabled={isReissuing}
                className="px-4 py-2 rounded-lg border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmReissuePasscode}
                disabled={isReissuing}
                className="px-4 py-2 rounded-lg bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isReissuing ? '再発行中...' : 'パスコードを再発行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-authentication Modal when token expires or 401 is received */}
      {showReauthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#E5E4DE] relative">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-[#2A2925]">管理者セッションの再認証</h3>
              <p className="text-xs text-[#686762] mt-1.5 leading-relaxed">
                セッションの有効期限が切れたか、サーバーが再起動されました。現在の管理者パスワードを入力して認証を更新してください。
              </p>
            </div>

            {reauthError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{reauthError}</span>
              </div>
            )}

            <form onSubmit={handleReauth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2A2925] mb-1">
                  管理者パスワード
                </label>
                <div className="relative">
                  <input
                    type={showReauthPassword ? 'text' : 'password'}
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="パスワードを入力（初期: admin）"
                    required
                    autoFocus
                    className="w-full pl-3 pr-10 py-2.5 bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-sm text-[#2A2925] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReauthPassword(!showReauthPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#686762] hover:text-[#2A2925] p-1 cursor-pointer"
                  >
                    {showReauthPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex-1 py-2 rounded-xl border border-[#E5E4DE] text-xs font-medium text-[#686762] hover:bg-[#F4F3EE] transition-colors cursor-pointer"
                >
                  ログアウト
                </button>
                <button
                  type="submit"
                  disabled={isReauthing || !reauthPassword}
                  className="flex-1 py-2 rounded-xl bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                >
                  {isReauthing ? '認証中...' : '再認証する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global In-App Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-200">
          <div
            className={`p-3.5 rounded-xl border shadow-lg flex items-start justify-between gap-2.5 ${
              toastMessage.type === 'success'
                ? 'bg-white border-emerald-300 text-emerald-900'
                : toastMessage.type === 'error'
                ? 'bg-white border-rose-300 text-rose-900'
                : 'bg-white border-[#E5E4DE] text-[#2A2925]'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
              {toastMessage.type === 'info' && <Users className="w-4 h-4 text-[#5A5A40] flex-shrink-0" />}
              <span>{toastMessage.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-[#686762] hover:text-[#2A2925] p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
