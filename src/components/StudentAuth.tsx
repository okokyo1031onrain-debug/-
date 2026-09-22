import React, { useState, useEffect } from 'react';
import { JoinSessionResponse, StudentAccount } from '../types';
import {
  Sparkles,
  KeyRound,
  User,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  UserCheck,
  PlusCircle,
  RefreshCw,
  Info,
} from 'lucide-react';

interface StudentAuthProps {
  onJoinSuccess: (res: JoinSessionResponse) => void;
  onOpenAdminLogin: () => void;
}

export const StudentAuth: React.FC<StudentAuthProps> = ({
  onJoinSuccess,
  onOpenAdminLogin,
}) => {
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Selection mode: either an existing studentName, or "__new__" for entering a new name
  const [selectedOption, setSelectedOption] = useState<string>('__new__');
  const [customName, setCustomName] = useState('');
  const [passcode, setPasscode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch list of registered students
  const fetchStudents = async () => {
    try {
      setIsLoadingStudents(true);
      const res = await fetch('/api/students');
      if (res.ok) {
        const data = await res.json();
        const list: StudentAccount[] = data.students || [];
        setStudents(list);
        // If there are registered students, default to first student unless user was already in new mode or selected
        if (list.length > 0) {
          setSelectedOption((prev) => {
            if (prev === '__new__') return list[0].studentName;
            // keep previous selection if it exists in list
            const found = list.some((s) => s.studentName === prev);
            return found ? prev : list[0].studentName;
          });
        } else {
          setSelectedOption('__new__');
        }
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const isNewStudent = selectedOption === '__new__';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const nameToSubmit = isNewStudent ? customName.trim() : selectedOption.trim();

    if (!nameToSubmit) {
      setErrorMessage(
        isNewStudent
          ? 'お名前 または 出席番号を入力してください'
          : 'アカウント一覧からあなたのお名前を選択してください'
      );
      return;
    }

    const code = passcode.trim();
    if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
      setErrorMessage('ご自身で決めた「4桁の数字」のパスコードを入力してください');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: nameToSubmit,
          passcode: code,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'セッションの開始に失敗しました');
      }

      onJoinSuccess(data);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#5A5A40] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            数
          </div>
          <div>
            <h1 className="font-bold text-base text-[#2A2925]">振り返りジェネレーター</h1>
            <p className="text-[11px] text-[#686762]">中学校数学科 授業・自習用AIアシスタント</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAdminLogin}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F4F3EE] text-[#686762] hover:text-[#2A2925] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          title="教師・管理者用画面へ"
        >
          <span>教師用画面</span>
        </button>
      </header>

      {/* Main Form Card */}
      <div className="max-w-md w-full mx-auto my-auto py-8">
        <div className="bg-white rounded-2xl border border-[#E5E4DE] p-6 sm:p-8 shadow-xs">
          {/* Card Title */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#5A5A40]/10 text-[#5A5A40] flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="font-bold text-lg text-[#2A2925]">
              授業の振り返りをはじめよう
            </h2>
            <p className="text-xs text-[#686762] mt-1.5 leading-relaxed">
              一覧から自分の名前を選ぶか、はじめての場合は新しくお名前を入力してください。
              ご自身で決めた4桁のパスコードでいつでも続きから再開できます。
            </p>
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Selection Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[#2A2925] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#5A5A40]" />
                  お名前（アカウントの選択）
                </label>
                {students.length > 0 && (
                  <button
                    type="button"
                    onClick={fetchStudents}
                    className="text-[11px] text-[#686762] hover:text-[#2A2925] flex items-center gap-1 transition-colors"
                    title="アカウント一覧を最新に更新"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingStudents ? 'animate-spin' : ''}`} />
                    <span>一覧更新</span>
                  </button>
                )}
              </div>

              {students.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={selectedOption}
                      onChange={(e) => {
                        setSelectedOption(e.target.value);
                        setErrorMessage(null);
                      }}
                      className="w-full px-3.5 py-2.5 bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-sm font-semibold text-[#2A2925] focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all appearance-none cursor-pointer pr-10"
                    >
                      <optgroup label="登録済みのアカウント（2回目以降の方）">
                        {students.map((student) => (
                          <option key={student.id} value={student.studentName}>
                            {student.studentName}
                            {student.messageCount && student.messageCount > 0
                              ? ` (${student.messageCount}件の対話)`
                              : ''}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="はじめて使う方">
                        <option value="__new__">
                          ＋ はじめて使う（新しく名前を入力する）
                        </option>
                      </optgroup>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#686762]">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {/* If "New Student" is selected in dropdown */}
                  {isNewStudent && (
                    <div className="pt-1 animate-in fade-in duration-150">
                      <label className="block text-[11px] font-bold text-[#5A5A40] mb-1">
                        新規登録するお名前 または 出席番号:
                      </label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="例: 2年1組15番 山田太郎"
                        autoFocus
                        required
                        className="w-full px-3.5 py-2.5 bg-[#FDFCF8] border border-[#5A5A40]/40 rounded-xl text-sm text-[#2A2925] placeholder-[#686762]/60 focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
                      />
                      <p className="text-[11px] text-[#686762] mt-1">
                        ※登録されると、次回から上記の一覧にあなたの名前が表示されます。
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* When no student accounts exist yet in database */
                <div>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="例: 2年1組15番 山田太郎"
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-sm text-[#2A2925] placeholder-[#686762]/60 focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
                  />
                  <p className="text-[11px] text-[#686762] mt-1">
                    ※一番最初の生徒です。名前を登録すると次回から一覧に追加されます。
                  </p>
                </div>
              )}
            </div>

            {/* 4-digit Passcode input (Self-chosen) */}
            <div>
              <label className="block text-xs font-bold text-[#2A2925] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#5A5A40]" />
                  <span>4桁のパスコード（暗証番号）</span>
                </span>
                <span className="text-[11px] font-normal text-[#686762]">
                  {isNewStudent ? '自分で決める数字4桁' : '決めた数字4桁'}
                </span>
              </label>
              <input
                type="text"
                maxLength={4}
                inputMode="numeric"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="例: 1234"
                required
                className="w-full px-3.5 py-2.5 bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-center font-mono font-bold text-lg tracking-widest text-[#2A2925] placeholder-[#686762]/40 focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
              />
              <div className="text-[11px] text-[#686762] mt-1 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 text-[#5A5A40] flex-shrink-0 mt-0.5" />
                <span>
                  {isNewStudent
                    ? '好きな4桁の数字を決めて入力してください（次回ログイン時に必要になります）。'
                    : '初回に設定した4桁のパスコードを入力してください。'}
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                isLoading ||
                (isNewStudent ? !customName.trim() : !selectedOption) ||
                passcode.length !== 4
              }
              className="w-full py-3 px-4 rounded-xl bg-[#5A5A40] hover:bg-[#464632] text-white font-bold text-sm shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <span>読み込み中...</span>
              ) : isNewStudent ? (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>アカウントを作成して開始する</span>
                </>
              ) : (
                <>
                  <span>続きから振り返りを再開する</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Hints & Educational footer notice */}
        <div className="text-center mt-6 text-xs text-[#686762] space-y-1">
          <p>公立中学校の数学の授業・単元末テスト前の振り返り学習に対応</p>
          <p className="text-[11px] text-[#686762]/80">
            ソクラテス式問いかけと5Whysにより、生徒自身の気づきや成長を言語化します。
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-[11px] text-[#686762] py-2">
        振り返りジェネレーター ｜ 数学授業サポートシステム
      </footer>
    </div>
  );
};
