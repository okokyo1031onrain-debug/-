import React, { useState } from 'react';
import { Lock, X, ArrowRight, ShieldAlert } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'パスワードが正しくありません');
      }

      onLoginSuccess(data.token);
      setPassword('');
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'ログインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-[#E5E4DE] relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#686762] hover:text-[#2A2925] p-1 rounded-lg hover:bg-[#F4F3EE] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#5A5A40]/10 text-[#5A5A40] flex items-center justify-center mx-auto mb-2">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-base text-[#2A2925]">教師・管理者ログイン</h3>
          <p className="text-xs text-[#686762] mt-1">
            生徒の対話監視・プロンプト変更・データ出力を行うための管理者画面です。
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#2A2925] mb-1">
              管理者パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="初期パスワード: admin"
              required
              autoFocus
              className="w-full px-3 py-2 bg-[#FDFCF8] border border-[#E5E4DE] rounded-xl text-sm text-[#2A2925] focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
            />
            <p className="text-[11px] text-[#686762] mt-1">
              ※初期パスワードは <code className="bg-[#F4F3EE] px-1 py-0.5 rounded text-[#2A2925]">admin</code> です（ダッシュボード内で変更可能）。
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-[#E5E4DE] text-xs font-medium text-[#2A2925] hover:bg-[#F4F3EE] transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 rounded-xl bg-[#5A5A40] hover:bg-[#464632] text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span>照合中...</span>
              ) : (
                <>
                  <span>ロック解除</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
