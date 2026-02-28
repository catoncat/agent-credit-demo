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

function normalizeInlineParenMath(markdown: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < markdown.length) {
    if (markdown[cursor] !== '(') {
      output += markdown[cursor];
      cursor += 1;
      continue;
    }

    let depth = 0;
    let end = -1;

    for (let idx = cursor; idx < markdown.length; idx += 1) {
      const char = markdown[idx];
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          end = idx;
          break;
        }
      }
    }

    if (end === -1) {
      output += markdown[cursor];
      cursor += 1;
      continue;
    }

    const content = markdown.slice(cursor + 1, end);
    const shouldConvert =
      !content.includes('\n') &&
      content.length > 0 &&
      content.length <= 120 &&
      /\\[A-Za-z]+/.test(content) &&
      /[=^_\\]/.test(content);

    output += shouldConvert ? `$${content.trim()}$` : markdown.slice(cursor, end + 1);
    cursor = end + 1;
  }

  return output;
}

function normalizeMathMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');

  const multilineNormalized = normalized.replace(
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
