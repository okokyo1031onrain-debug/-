import React, { useState, useEffect, useRef } from 'react';
import { Session, Message } from '../types';
import { MathMarkdown } from './MathMarkdown';
import {
  Send,
  Sparkles,
  KeyRound,
  LogOut,
  HelpCircle,
  X,
  Check,
  Calculator,
  Compass,
  TrendingUp,
  AlertCircle,
  Copy,
} from 'lucide-react';

interface StudentChatProps {
  session: Session;
  onUpdateSession: (updated: Session) => void;
  onLogout: () => void;
  isNewSession?: boolean;
}

const QUICK_SUGGESTIONS = [
  '正負の数の計算でマイナスの符号をミスしてしまった',
  '一次関数のグラフの傾きと切片の意味がわかった',
  '連立方程式の代入法をマスターできた',
  '文字式の分配法則で計算ミスを減らせた',
  '文章題からxとyの等式を立てるのが難しかった',
  '途中式を省略せずに書いたら最後まで正解できた',
];

export const StudentChat: React.FC<StudentChatProps> = ({
  session,
  onUpdateSession,
  onLogout,
  isNewSession = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>(session.messages);
  const [showPasscodeAlert, setShowPasscodeAlert] = useState(isNewSession);
  const [copiedCode, setCopiedCode] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const lastMessageCountRef = useRef<number>(session.messages.length);

  // Sync state if session messages update externally without clobbering optimistic state
  useEffect(() => {
    // Only update if count changed or assistant message arrived
    if (session.messages.length !== lastMessageCountRef.current) {
      setOptimisticMessages(session.messages);
      lastMessageCountRef.current = session.messages.length;

      // Only smooth scroll if user is near bottom or just sent a message
      scrollToBottomIfAppropriate();
    }
  }, [session.messages]);

  const scrollToBottomIfAppropriate = (force: boolean = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || isNearBottom) {
      setTimeout(() => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    }
  };

  const handleCopyPasscode = () => {
    navigator.clipboard.writeText(session.passcode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setInputText('');

    // Optimistic UI message insertion
    const tempUserMsg: Message = {
      id: 'opt_' + Date.now(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setOptimisticMessages((prev) => [...prev, tempUserMsg]);
    setIsSending(true);
    scrollToBottomIfAppropriate(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          message: text,
          passcode: session.passcode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '通信エラーが発生しました');
      }

      const data = await res.json();
      onUpdateSession(data.session);
      setOptimisticMessages(data.session.messages);
      lastMessageCountRef.current = data.session.messages.length;
      scrollToBottomIfAppropriate(true);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Revert input text so student doesn't lose their thought
      setInputText(text);
      // Append error message
      const errorMsg: Message = {
        id: 'err_' + Date.now(),
        role: 'assistant',
        content: `⚠️ メッセージの送信に失敗しました: ${err.message || 'しばらくしてからもう一度お試しください。'}`,
        createdAt: new Date().toISOString(),
      };
      setOptimisticMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
      scrollToBottomIfAppropriate(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full max-h-screen bg-[#FDFCF8]">
      {/* Session Topbar */}
      <div className="bg-white border-b border-[#E5E4DE] px-4 py-2.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#5A5A40] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {session.studentName.slice(0, 1)}
          </div>
          <div>
            <div className="font-bold text-sm text-[#2A2925] flex items-center gap-1.5">
              <span>{session.studentName}</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-[#F4F3EE] text-[#5A5A40] font-mono border border-[#E5E4DE] font-semibold">
                コード: {session.passcode}
              </span>
            </div>
            <div className="text-[11px] text-[#686762]">
              数学の振り返り対話中 ｜ 次回も4桁コードで再開できます
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPasscode}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F4F3EE] text-[#2A2925] transition-colors"
            title="4桁パスコードをコピー"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">コピー完了</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5 text-[#5A5A40]" />
                <span className="hidden sm:inline">コードコピー</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-[#686762] hover:text-rose-700 hover:bg-rose-50 transition-colors"
            title="セッションを終了してログイン画面へ戻る"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">終了</span>
          </button>
        </div>
      </div>

      {/* Passcode Alert Banner (Shown if newly registered) */}
      {showPasscodeAlert && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-xs text-amber-900 flex items-start justify-between">
          <div className="flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">【登録完了】あなたが設定した4桁パスコード: </span>
              <span className="font-mono text-sm font-bold bg-white px-2 py-0.5 rounded border border-amber-300 mx-1 text-amber-950">
                {session.passcode}
              </span>
              <p className="text-[11px] text-amber-800 mt-0.5">
                次回もこの4桁コードで続きから再開できます。忘れないようにノート等にメモしておきましょう！
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPasscodeAlert(false)}
            className="text-amber-700 hover:text-amber-950 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-4xl mx-auto w-full"
      >
        {/* Welcome greeting card if empty */}
        {optimisticMessages.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E4DE] p-6 shadow-xs my-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#5A5A40]/10 text-[#5A5A40] flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="font-bold text-base text-[#2A2925] mb-1">
              {session.studentName} さん、今日の授業お疲れ様でした！
            </h2>
            <p className="text-xs text-[#686762] max-w-md mx-auto leading-relaxed mb-5">
              今日の数学の授業で「解けた問題」「ミスしたところ」「難しかったところ」「気づいたこと」などを、
              思いつくまま単語や走り書きで入力してみてください。AIが一緒に変容や気づきを言語化して、提出用の振り返り文章を作ります！
            </p>

            {/* Quick Chips */}
            <div className="text-left border-t border-[#E5E4DE] pt-4">
              <div className="text-xs font-semibold text-[#5A5A40] mb-2 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                タップして入力できるメモの例:
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(sug)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#F4F3EE] hover:bg-[#5A5A40] hover:text-white text-[#2A2925] transition-colors border border-[#E5E4DE] text-left cursor-pointer"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {optimisticMessages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="text-[11px] text-[#686762] mb-1 px-1 flex items-center gap-1">
                <span>{isUser ? session.studentName : 'AI振り返りアシスタント'}</span>
                <span>・</span>
                <span>{new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div
                className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-xs text-sm ${
                  isUser
                    ? 'bg-[#5A5A40] text-white rounded-br-xs leading-relaxed whitespace-pre-wrap'
                    : 'bg-white text-[#2A2925] border border-[#E5E4DE] rounded-bl-xs'
                }`}
              >
                {isUser ? (
                  <div>{msg.content}</div>
                ) : (
                  <MathMarkdown content={msg.content} />
                )}
              </div>
            </div>
          );
        })}

        {/* Thinking Indicator */}
        {isSending && (
          <div className="flex flex-col items-start">
            <div className="text-[11px] text-[#686762] mb-1 px-1">
              AI振り返りアシスタントが考え中...
            </div>
            <div className="bg-white border border-[#E5E4DE] rounded-2xl rounded-bl-xs px-4 py-3 shadow-xs flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[#5A5A40] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-[#5A5A40] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-[#5A5A40] animate-bounce" />
              </div>
              <span className="text-xs text-[#686762] ml-1">振り返り文章を生成中...</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Input Area */}
      <div className="bg-white border-t border-[#E5E4DE] p-3 sm:p-4 shadow-sm">
        <div className="max-w-4xl mx-auto">
          {/* Helpful suggestions bar when conversation has started */}
          {optimisticMessages.length > 0 && optimisticMessages.length < 5 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar text-xs">
              <span className="text-[#686762] whitespace-nowrap text-[11px]">ヒント:</span>
              <button
                type="button"
                onClick={() => handleSendMessage('符号のミスをなくすために、次は途中式を1行増やしてみます')}
                className="px-2.5 py-1 rounded-md bg-[#F4F3EE] hover:bg-[#E5E4DE] text-[#2A2925] whitespace-nowrap text-xs transition-colors"
              >
                符号ミスの対策を追加
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('【Aパターン】が自分の考えに一番近いです！')}
                className="px-2.5 py-1 rounded-md bg-[#F4F3EE] hover:bg-[#E5E4DE] text-[#2A2925] whitespace-nowrap text-xs transition-colors"
              >
                Aパターンを採用する
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage('【Bパターン】の作戦で次の単元もやってみます！')}
                className="px-2.5 py-1 rounded-md bg-[#F4F3EE] hover:bg-[#E5E4DE] text-[#2A2925] whitespace-nowrap text-xs transition-colors"
              >
                Bパターンを採用する
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-[#FDFCF8] rounded-xl border border-[#E5E4DE] p-2 focus-within:ring-2 focus-within:ring-[#5A5A40] focus-within:border-transparent transition-all">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder="授業のメモや気づいたことを入力...（Shift+Enterで改行、Enterで送信）"
              rows={2}
              className="flex-1 bg-transparent border-0 resize-none text-sm text-[#2A2925] placeholder-[#686762]/70 focus:outline-none py-1 px-2 leading-relaxed"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isSending || !inputText.trim()}
              className="px-4 py-2 rounded-lg bg-[#5A5A40] hover:bg-[#464632] text-white font-semibold text-xs transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-xs flex-shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>送信</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#686762] mt-2 px-1">
            <span>数式表示: $x^2+y^2=r^2$ や {'$\\frac{a}{b}$'} などのKaTeX数式にも対応しています</span>
            <span className="hidden sm:inline">振り返り文章は「文章をコピー」で1クリック取得可能</span>
          </div>
        </div>
      </div>
    </div>
  );
};
