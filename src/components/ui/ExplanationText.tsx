import React from 'react';

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
  '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', ' ': ' ',
};

const toSuperscript = (s: string): string =>
  s.split('').map(ch => SUPERSCRIPT[ch] ?? ch).join('');

/**
 * Converts the common LaTeX / markdown-ish math the AI returns into clean,
 * readable plain text (×, ÷, √, ², fractions, etc.). Intentionally lightweight
 * — handles the constructs that actually show up in arithmetic explanations.
 */
const normalizeMath = (input: string): string => {
  let t = input;
  // Strip inline/display math delimiters: \( \) \[ \] and $…$
  t = t.replace(/\\[()[\]]/g, '');
  t = t.replace(/\$\$?/g, '');
  // \sqrt{...} -> √(...)
  t = t.replace(/\\sqrt\s*\{([^}]*)\}/g, (_m, inner) => `√(${inner.trim()})`);
  // \frac{a}{b} -> a/b
  t = t.replace(/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, (_m, a, b) => `${a.trim()}/${b.trim()}`);
  // Operators and relations
  const ops: [RegExp, string][] = [
    [/\\times/g, '×'], [/\\div/g, '÷'], [/\\cdot/g, '·'], [/\\pm/g, '±'],
    [/\\geq/g, '≥'], [/\\leq/g, '≤'], [/\\ge\b/g, '≥'], [/\\le\b/g, '≤'],
    [/\\neq/g, '≠'], [/\\approx/g, '≈'], [/\\Rightarrow/g, '⇒'],
    [/\\rightarrow/g, '→'], [/\\to\b/g, '→'], [/\\infty/g, '∞'],
    [/\\left|\\right/g, ''], [/\\[,;:!]/g, ' '],
  ];
  for (const [re, rep] of ops) t = t.replace(re, rep);
  // Superscripts: ^{...} and ^x
  t = t.replace(/\^\{([^}]*)\}/g, (_m, g) => toSuperscript(g));
  t = t.replace(/\^(-?[0-9A-Za-z])/g, (_m, g) => toSuperscript(g));
  // Drop any remaining LaTeX commands and stray braces
  t = t.replace(/\\[a-zA-Z]+/g, '');
  t = t.replace(/[{}]/g, '');
  // ASCII arrows -> nice arrows
  t = t.replace(/-->|->/g, '→').replace(/=>/g, '⇒');
  // Tidy spacing before punctuation
  t = t.replace(/\s+([.,;:)])/g, '$1').replace(/[ \t]{2,}/g, ' ');
  return t.trim();
};

const renderInline = (text: string, keyBase: string): React.ReactNode[] => {
  const clean = normalizeMath(text);
  // Bold via **...**; odd indices from the capture are bold.
  const parts = clean.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b${i}`} className="font-bold text-slate-900 dark:text-white">
        {part}
      </strong>
    ) : (
      <React.Fragment key={`${keyBase}-t${i}`}>{part.replace(/\*\*/g, '')}</React.Fragment>
    )
  );
};

/**
 * Renders an AI-generated explanation with light formatting: bold headings,
 * bullet lists, readable math symbols, and comfortable line spacing — instead
 * of raw markdown/LaTeX source.
 */
export const ExplanationText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1 space-y-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 text-violet-500 dark:text-violet-400">•</span>
            <span>{renderInline(b, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    const isHeading = /^\*\*[^*]+\*\*:?\s*$/.test(line);
    blocks.push(
      <p
        key={`p-${key++}`}
        className={
          isHeading
            ? 'font-display font-bold text-slate-800 dark:text-white mt-3 first:mt-0'
            : 'leading-relaxed'
        }
      >
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }
  flushBullets();

  return (
    <div className="space-y-1.5 text-sm sm:text-base text-slate-700 dark:text-slate-200">
      {blocks}
    </div>
  );
};
