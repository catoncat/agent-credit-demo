import whitepaperMarkdown from '../../WHITEPAPER.md?raw';
import algorithmMarkdown from '../../ALGORITHM_SPEC.md?raw';
import implementationMarkdown from '../../IMPLEMENTATION_SPEC.md?raw';

export type DocPaperId = 'whitepaper' | 'algorithm' | 'implementation';

export interface DocPaper {
  id: DocPaperId;
  navLabel: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  readingMinutes: number;
  markdown: string;
}

export interface PaperHeading {
  index: number;
  level: 2 | 3;
  title: string;
}

function isLikelyInlineMath(content: string): boolean {
  const normalized = content.trim();
  if (!normalized || normalized.length > 96) return false;
  if (/[\u4e00-\u9fff]/.test(normalized)) return false;

  if (/\\[A-Za-z]+/.test(normalized)) return true;
  if (/(?:->|[=^_<>±·⋅])/u.test(normalized)) return true;
  if (/^[A-Za-z]$/.test(normalized)) return true;
  if (/^[A-Za-z](\s*,\s*[A-Za-z])+$/u.test(normalized)) return true;

  return false;
}

function convertInlineParenMathInLine(line: string): string {
  let output = '';
  let cursor = 0;
  let inInlineMath = false;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '$' && line[cursor - 1] !== '\\') {
      inInlineMath = !inInlineMath;
      output += char;
      cursor += 1;
      continue;
    }

    if (inInlineMath || char !== '(') {
      output += char;
      cursor += 1;
      continue;
    }

    let depth = 0;
    let end = -1;
    for (let idx = cursor; idx < line.length; idx += 1) {
      const nextChar = line[idx];
      if (nextChar === '(') {
        const nextParenClose = line.indexOf(')', idx + 1);
        const nextBracketClose = line.indexOf(']', idx + 1);
        const looksLikeLeftOpenInterval =
          nextBracketClose !== -1 && (nextParenClose === -1 || nextBracketClose < nextParenClose);

        if (!looksLikeLeftOpenInterval) {
          depth += 1;
        }
      }
      if (nextChar === ')') {
        depth -= 1;
        if (depth === 0) {
          end = idx;
          break;
        }
      }
    }

    if (end === -1) {
      output += char;
      cursor += 1;
      continue;
    }

    const content = line.slice(cursor + 1, end);
    if (isLikelyInlineMath(content)) {
      output += `$(${content.trim()})$`;
    } else {
      output += line.slice(cursor, end + 1);
    }
    cursor = end + 1;
  }

  return output;
}

function normalizeInlineParenMath(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let inCodeFence = false;
  let inDisplayMath = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      result.push(line);
      continue;
    }

    if (!inCodeFence && trimmed === '$$') {
      inDisplayMath = !inDisplayMath;
      result.push(line);
      continue;
    }

    if (inCodeFence || inDisplayMath) {
      result.push(line);
      continue;
    }

    result.push(convertInlineParenMathInLine(line));
  }

  return result.join('\n');
}

function normalizeMathMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');

  const escapedInlineNormalized = normalized.replace(/\\\((.+?)\\\)/g, (_full, body: string) => `$${body.trim()}$`);

  const escapedMultilineNormalized = escapedInlineNormalized.replace(
    /(^|\n)[ \t]*\\\[\s*\n([\s\S]*?)\n[ \t]*\\\](?=\n|$)/g,
    (_full, prefix: string, body: string) => `${prefix}$$\n${body.trim()}\n$$`,
  );

  const escapedSinglelineNormalized = escapedMultilineNormalized.replace(
    /(^|\n)[ \t]*\\\[\s*([^\n]+?)\s*\\\](?=\n|$)/g,
    (_full, prefix: string, body: string) => `${prefix}$$\n${body.trim()}\n$$`,
  );

  const multilineNormalized = escapedSinglelineNormalized.replace(
    /(^|\n)[ \t]*\[\s*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g,
    (_full, prefix: string, body: string) => `${prefix}$$\n${body.trim()}\n$$`,
  );

  const bracketNormalized = multilineNormalized.replace(
    /(^|\n)[ \t]*\[\s*([^\n[\]]+?)\s*\](?=\n|$)/g,
    (_full, prefix: string, body: string) => `${prefix}$$\n${body.trim()}\n$$`,
  );

  return normalizeInlineParenMath(bracketNormalized);
}

export const DOC_PAPERS: DocPaper[] = [
  {
    id: 'whitepaper',
    navLabel: '白皮书',
    title: '智能体网络中的自治信用架构',
    subtitle: '控制论白皮书',
    updatedAt: '2026-02-28',
    readingMinutes: 28,
    markdown: normalizeMathMarkdown(whitepaperMarkdown),
  },
  {
    id: 'algorithm',
    navLabel: '算法',
    title: '算法设计说明',
    subtitle: '方法与约束',
    updatedAt: '2026-02-28',
    readingMinutes: 12,
    markdown: normalizeMathMarkdown(algorithmMarkdown),
  },
  {
    id: 'implementation',
    navLabel: '实现',
    title: '实现架构说明',
    subtitle: '语义与闭环',
    updatedAt: '2026-02-28',
    readingMinutes: 10,
    markdown: normalizeMathMarkdown(implementationMarkdown),
  },
];

export function findPaperById(id: DocPaperId): DocPaper {
  return DOC_PAPERS.find((doc) => doc.id === id) ?? DOC_PAPERS[0];
}

export function extractMarkdownHeadings(markdown: string): PaperHeading[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const headings: PaperHeading[] = [];
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    const matched = line.match(/^(#{2,3})\s+(.+)$/);
    if (!matched) continue;

    const level = matched[1].length as 2 | 3;
    const title = matched[2].replace(/[`*_]/g, '').trim();
    if (!title) continue;

    headings.push({
      index: headings.length,
      level,
      title,
    });
  }

  return headings;
}
