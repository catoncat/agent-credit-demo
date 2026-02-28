import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  DOC_PAPERS,
  extractMarkdownHeadings,
  findPaperById,
  type DocPaperId,
  type PaperHeading,
} from '../../docs/papers';

function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-2 mb-6 text-[30px] sm:text-[34px] leading-tight font-semibold tracking-tight text-[#111827]">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-10 mb-4 border-b border-[#d7dce3] pb-2 text-[24px] leading-tight font-semibold text-[#111827]">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-8 mb-3 text-[20px] leading-tight font-semibold text-[#111827]">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="my-3 text-[17px] leading-8 tracking-[0.01em] text-[#1f2937] [text-wrap:pretty]">{children}</p>
        ),
        ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6 text-[16px] leading-7 text-[#1f2937]">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6 text-[16px] leading-7 text-[#1f2937]">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-4 border-[#b8c2d0] bg-[#f8fafc] px-4 py-3 text-[16px] leading-7 text-[#334155]">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-7 border-[#e2e8f0]" />,
        code: ({ children, className }) => {
          const isBlockCode = Boolean(className && className.includes('language-'));
          return (
            <code
              className={
                isBlockCode
                  ? `${className ?? ''} text-[13px]`
                  : 'rounded bg-[#eef2f7] px-1.5 py-0.5 font-mono text-[14px] text-[#111827]'
              }
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-4 overflow-x-auto rounded-md border border-[#d7dce3] bg-[#f8fafc] p-4 leading-6 text-[#0f172a]">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[14px] leading-6 text-[#1f2937]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[#f1f5f9]">{children}</thead>,
        th: ({ children }) => <th className="border border-[#d7dce3] px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-[#d7dce3] px-3 py-2 align-top">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} className="text-[#0f766e] underline decoration-[#99f6e4] underline-offset-2 hover:text-[#0d5f59]">
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export function DocsShell() {
  const [activeDocId, setActiveDocId] = useState<DocPaperId>('whitepaper');
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const activeDoc = useMemo(() => findPaperById(activeDocId), [activeDocId]);
  const tocItems = useMemo<PaperHeading[]>(() => extractMarkdownHeadings(activeDoc.markdown), [activeDoc.markdown]);

  useEffect(() => {
    setActiveHeadingIndex(0);
    const container = contentRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeDocId]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3'));
    if (headings.length === 0) return;

    const updateActiveHeading = () => {
      const markerTop = container.getBoundingClientRect().top + 120;
      let nextIndex = 0;

      for (let idx = 0; idx < headings.length; idx += 1) {
        if (headings[idx].getBoundingClientRect().top <= markerTop) {
          nextIndex = idx;
        } else {
          break;
        }
      }

      setActiveHeadingIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    updateActiveHeading();
    container.addEventListener('scroll', updateActiveHeading, { passive: true });
    window.addEventListener('resize', updateActiveHeading);

    return () => {
      container.removeEventListener('scroll', updateActiveHeading);
      window.removeEventListener('resize', updateActiveHeading);
    };
  }, [activeDocId, tocItems.length]);

  const jumpToHeading = useCallback((headingIndex: number) => {
    const container = contentRef.current;
    if (!container) return;

    const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3'));
    const target = headings[headingIndex];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveHeadingIndex(headingIndex);
  }, []);

  const mobileTocItems = useMemo(() => tocItems.filter((item) => item.level === 2), [tocItems]);

  return (
    <div className="w-full min-h-full lg:h-full lg:min-h-0 bg-[#f3f4f2] text-[#111827]">
      <div className="mx-auto min-h-full lg:h-full lg:min-h-0 max-w-[1560px] flex flex-col">
        <header className="sticky top-0 z-20 border-b border-[#d7dce3] bg-[#f8f8f7]/95 backdrop-blur">
          <div className="px-3 py-2.5 sm:px-5 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-2.5">
              <h1 className="text-[19px] font-semibold tracking-tight sm:text-[21px]">文档中心</h1>
              <div className="text-right">
                <p className="text-[12px] leading-5 text-[#374151]">{activeDoc.title}</p>
                <p className="text-[11px] leading-4 text-[#6b7280]">
                  {activeDoc.readingMinutes} 分钟 · 更新 {activeDoc.updatedAt}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)_15rem]">
          <aside className="hidden lg:flex lg:flex-col min-h-0 border-r border-[#d7dce3] bg-[#f8f8f7]">
            <nav className="min-h-0 overflow-y-auto p-3 space-y-2">
              {DOC_PAPERS.map((doc) => {
                const isActive = doc.id === activeDocId;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setActiveDocId(doc.id)}
                    className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'border-[#0f766e] bg-[#ecf7f5] text-[#0f766e]'
                        : 'border-[#d7dce3] bg-white text-[#374151] hover:bg-[#f3f4f6]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className="text-[13px] font-semibold">{doc.navLabel}</div>
                    <div className="mt-0.5 text-[12px] leading-5 text-[#6b7280]">{doc.subtitle}</div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-h-0 flex flex-col">
            <div className="lg:hidden border-b border-[#d7dce3] bg-[#f8f8f7] px-3 py-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {DOC_PAPERS.map((doc) => {
                  const isActive = doc.id === activeDocId;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setActiveDocId(doc.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                        isActive
                          ? 'border-[#0f766e] bg-[#ecf7f5] text-[#0f766e]'
                          : 'border-[#d7dce3] bg-white text-[#4b5563]'
                      }`}
                    >
                      {doc.navLabel}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {mobileTocItems.map((item) => {
                  const isActive = activeHeadingIndex === item.index;
                  return (
                    <button
                      key={`${item.level}-${item.index}-${item.title}`}
                      type="button"
                      onClick={() => jumpToHeading(item.index)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors ${
                        isActive
                          ? 'border-[#0f766e] bg-[#ecf7f5] text-[#0f766e]'
                          : 'border-[#d7dce3] bg-white text-[#6b7280]'
                      }`}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <div ref={contentRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-8 lg:py-6">
              <article
                className="mx-auto w-full max-w-[920px] border border-[#d7dce3] bg-white px-5 py-6 sm:px-9 sm:py-8 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                style={{ fontFamily: 'Times New Roman, Noto Serif SC, Source Han Serif SC, Songti SC, serif' }}
              >
                <MarkdownArticle markdown={activeDoc.markdown} />
              </article>
            </div>
          </main>

          <aside className="hidden lg:block min-h-0 overflow-y-auto border-l border-[#d7dce3] bg-[#f8f8f7]">
            <div className="p-4">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">目录</p>
              <nav className="mt-2.5 space-y-1">
                {tocItems.map((item) => {
                  const isActive = activeHeadingIndex === item.index;
                  return (
                    <button
                      key={`${item.level}-${item.index}-${item.title}`}
                      type="button"
                      onClick={() => jumpToHeading(item.index)}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left transition-colors ${
                        isActive
                          ? 'bg-[#ecf7f5] text-[#0f766e]'
                          : 'text-[#4b5563] hover:bg-[#eef2f7]'
                      } ${item.level === 3 ? 'pl-5 text-[12px]' : 'text-[12px] font-medium'}`}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default DocsShell;
