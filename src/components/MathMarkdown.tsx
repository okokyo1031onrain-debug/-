import React, { useState } from 'react';
import katex from 'katex';
import { Check, Copy } from 'lucide-react';

interface MathMarkdownProps {
  content: string;
  className?: string;
}

// Helper to render KaTeX formula safely
function renderKaTeX(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
    });
  } catch (err) {
    return latex;
  }
}

export const MathMarkdown: React.FC<MathMarkdownProps> = ({ content, className = '' }) => {
  const [copiedPattern, setCopiedPattern] = useState<string | null>(null);

  const handleCopy = (text: string, patternKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPattern(patternKey);
    setTimeout(() => {
      setCopiedPattern((prev) => (prev === patternKey ? null : prev));
    }, 2000);
  };

  // Process text with math replacement
  const renderTextWithMath = (text: string): React.ReactNode[] => {
    // Split by block math $$...$$ first, then inline math $...$
    const tokens: React.ReactNode[] = [];
    const blockRegex = /\$\$([\s\S]*?)\$\$/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Helper to process inline math within text segments
    const processInlineMath = (subText: string, keyPrefix: string): React.ReactNode[] => {
      const inlineTokens: React.ReactNode[] = [];
      const inlineRegex = /\$([^$\n]+?)\$/g;
      let inlineLastIndex = 0;
      let inlineMatch: RegExpExecArray | null;

      while ((inlineMatch = inlineRegex.exec(subText)) !== null) {
        if (inlineMatch.index > inlineLastIndex) {
          inlineTokens.push(
            <span key={`${keyPrefix}-t-${inlineLastIndex}`}>
              {subText.substring(inlineLastIndex, inlineMatch.index)}
            </span>
          );
        }
        const latex = inlineMatch[1];
        const html = renderKaTeX(latex, false);
        inlineTokens.push(
          <span
            key={`${keyPrefix}-m-${inlineMatch.index}`}
            className="inline-math px-1 py-0.5 text-stone-900 font-mono text-sm"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        inlineLastIndex = inlineMatch.index + inlineMatch[0].length;
      }

      if (inlineLastIndex < subText.length) {
        inlineTokens.push(
          <span key={`${keyPrefix}-t-end`}>
            {subText.substring(inlineLastIndex)}
          </span>
        );
      }

      return inlineTokens;
    };

    let blockCounter = 0;
    while ((match = blockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const preceding = text.substring(lastIndex, match.index);
        tokens.push(...processInlineMath(preceding, `pre-${blockCounter}`));
      }

      const latex = match[1];
      const html = renderKaTeX(latex, true);
      tokens.push(
        <div
          key={`block-math-${blockCounter}`}
          className="my-3 py-2 px-3 overflow-x-auto bg-[#F4F3EE] rounded-lg border border-[#E5E4DE] text-center"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );

      lastIndex = match.index + match[0].length;
      blockCounter++;
    }

    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex);
      tokens.push(...processInlineMath(remaining, `post-${blockCounter}`));
    }

    return tokens;
  };

  // Parse lines to detect patterns (e.g., 【Aパターン：...】 or 【Bパターン：...】)
  // and format paragraphs
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let currentPatternTitle: string | null = null;
  let currentPatternLines: string[] = [];
  let patternIdCounter = 0;

  const flushPatternCard = () => {
    if (currentPatternTitle) {
      const patternText = currentPatternLines.join('\n').trim();
      const fullCopyText = `${currentPatternTitle}\n${patternText}`;
      const patternKey = `pattern-${patternIdCounter++}`;
      const isCopied = copiedPattern === patternKey;

      renderedElements.push(
        <div
          key={patternKey}
          className="my-3 p-4 rounded-xl bg-white border-2 border-[#5A5A40]/30 shadow-xs transition-all hover:border-[#5A5A40]"
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#E5E4DE]">
            <span className="font-bold text-sm text-[#5A5A40] flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#5A5A40]" />
              {currentPatternTitle}
            </span>
            <button
              type="button"
              onClick={() => handleCopy(fullCopyText, patternKey)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-[#F4F3EE] text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white transition-colors cursor-pointer font-medium"
              title="振り返り文章をコピー"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>コピーしました</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>文章をコピー</span>
                </>
              )}
            </button>
          </div>
          <div className="text-sm text-[#2A2925] leading-relaxed whitespace-pre-wrap font-sans">
            {renderTextWithMath(patternText)}
          </div>
        </div>
      );
      currentPatternTitle = null;
      currentPatternLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect pattern headers like 【Aパターン：...】 or 【Bパターン：...】
    const patternMatch = line.match(/^【([A-Za-z0-9]+パターン[^】]*)】(.*)$/);
    if (patternMatch) {
      flushPatternCard();
      currentPatternTitle = `【${patternMatch[1]}】`;
      if (patternMatch[2]?.trim()) {
        currentPatternLines.push(patternMatch[2].trim());
      }
      continue;
    }

    if (currentPatternTitle) {
      // Check if this line starts a new section or empty separator
      if (line.startsWith('#') || line.startsWith('※') || line.startsWith('---')) {
        flushPatternCard();
        // continue handling as regular markdown line
      } else {
        currentPatternLines.push(line);
        continue;
      }
    }

    // Markdown Headers
    if (line.startsWith('### ')) {
      renderedElements.push(
        <h4 key={`h4-${i}`} className="font-bold text-[#2A2925] text-sm mt-3 mb-1">
          {renderTextWithMath(line.substring(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      renderedElements.push(
        <h3 key={`h3-${i}`} className="font-bold text-[#2A2925] text-base mt-4 mb-2 pb-1 border-b border-[#E5E4DE]">
          {renderTextWithMath(line.substring(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      renderedElements.push(
        <h2 key={`h2-${i}`} className="font-bold text-[#2A2925] text-lg mt-4 mb-2">
          {renderTextWithMath(line.substring(2))}
        </h2>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      renderedElements.push(
        <li key={`li-${i}`} className="ml-4 list-disc text-sm text-[#2A2925] my-0.5 leading-relaxed">
          {renderTextWithMath(line.substring(2))}
        </li>
      );
    } else if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ')) {
      renderedElements.push(
        <div key={`num-${i}`} className="ml-2 text-sm text-[#2A2925] my-1 leading-relaxed">
          <span className="font-semibold text-[#5A5A40] mr-1.5">{line.substring(0, 3)}</span>
          {renderTextWithMath(line.substring(3))}
        </div>
      );
    } else if (line.trim() === '') {
      renderedElements.push(<div key={`empty-${i}`} className="h-2" />);
    } else {
      renderedElements.push(
        <p key={`p-${i}`} className="text-sm text-[#2A2925] my-1 leading-relaxed">
          {renderTextWithMath(line)}
        </p>
      );
    }
  }

  flushPatternCard();

  return <div className={`math-markdown-content space-y-1 ${className}`}>{renderedElements}</div>;
};
