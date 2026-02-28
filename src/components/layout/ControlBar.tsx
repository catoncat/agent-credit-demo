import { useEffect } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { AppView } from './AppShell';

const REPO_URL = 'https://github.com/catoncat/agent-credit-demo';

interface ControlBarProps {
  currentView: AppView;
  isEventSidebarOpen: boolean;
  onToggleEventSidebar: () => void;
  onOpenDocs: () => void;
  onOpenSimulation: () => void;
}

export function ControlBar({
  currentView,
  isEventSidebarOpen,
  onToggleEventSidebar,
  onOpenDocs,
  onOpenSimulation,
}: ControlBarProps) {
  const {
    tick,
    isPlaying,
    playSpeed,
    nextStep,
    prevStep,
    reset,
    togglePlay,
    setPlaySpeed,
    addAgent,
  } = useSimulationStore();

  const canPrev = tick > 0;
  const isDocsView = currentView === 'docs';

  useEffect(() => {
    if (currentView !== 'simulation') return;
    if (!isPlaying) return;
    const timer = setTimeout(() => {
      nextStep();
    }, 2200 / playSpeed);
    return () => clearTimeout(timer);
  }, [currentView, isPlaying, playSpeed, nextStep, tick]);

  const iconBtnClass =
    'h-9 min-w-9 px-2 rounded-md border border-[var(--sys-border-default)] text-[color:var(--sys-text-secondary)] hover:text-[color:var(--sys-text-primary)] hover:bg-[var(--sys-bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center shrink-0';
  const viewBtnClass =
    'h-9 px-3 rounded-md border border-[var(--sys-border-default)] text-sm font-medium text-[color:var(--sys-text-secondary)] hover:text-[color:var(--sys-text-primary)] hover:bg-[var(--sys-bg-hover)] transition-colors inline-flex items-center justify-center shrink-0';
  const returnBtnClass =
    'h-9 px-3 rounded-md border border-[var(--sys-border-default)] bg-white text-sm font-medium text-[color:var(--sys-text-primary)] hover:bg-[var(--sys-bg-hover)] transition-colors inline-flex items-center justify-center gap-1.5 shrink-0';
  const githubBtnClass =
    'h-9 min-w-9 px-2 rounded-md border border-[var(--sys-border-default)] text-[color:var(--sys-text-secondary)] hover:text-[color:var(--sys-text-primary)] hover:bg-[var(--sys-bg-hover)] transition-colors inline-flex items-center justify-center shrink-0';

  return (
    <div
      className={`min-h-[56px] px-3 sm:px-4 py-2 border-b border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)] ${
        isDocsView ? 'flex items-center justify-between gap-2' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-[var(--sys-status-executing)]' : 'bg-[var(--sys-status-idle)]'}`} />
        <h1 className="text-base font-semibold text-[color:var(--sys-text-primary)] whitespace-nowrap">自治信用网络</h1>
      </div>

      <div
        className={`flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 ${
          isDocsView ? 'w-auto' : 'w-full sm:w-auto'
        }`}
      >
        {!isDocsView && (
          <>
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] shrink-0">
              <button
                onClick={prevStep}
                disabled={!canPrev}
                title="回退 1 tick"
                aria-label="回退 1 tick"
                className={iconBtnClass}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m10.5 4.5-4 3.5 4 3.5" />
                  <path d="M4.5 4.5v7" />
                </svg>
              </button>

              <button
                onClick={nextStep}
                title="推进 1 tick"
                aria-label="推进 1 tick"
                className="h-9 min-w-9 px-2 rounded-md bg-[var(--sys-action-primary)] text-[color:var(--sys-text-inverse)] hover:bg-[var(--sys-action-primary-hover)] transition-colors inline-flex items-center justify-center shrink-0"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5.5 4.5 4 3.5-4 3.5" />
                  <path d="M11.5 4.5v7" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                title={isPlaying ? '暂停自动' : '开始自动'}
                aria-label={isPlaying ? '暂停自动' : '开始自动'}
                className={`h-9 min-w-9 px-2 rounded-md border transition-colors inline-flex items-center justify-center shrink-0 ${
                  isPlaying
                    ? 'border-[var(--sys-status-executing)] text-[color:var(--sys-status-executing)] bg-[var(--sys-status-executing-soft)]'
                    : 'border-[var(--sys-border-default)] text-[color:var(--sys-text-secondary)] hover:bg-[var(--sys-bg-hover)]'
                }`}
              >
                {isPlaying ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6.2 4.5v7" />
                    <path d="M9.8 4.5v7" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 16 16"
                    className="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 4.5 11 8 6 11.5Z" />
                  </svg>
                )}
              </button>

              <select
                value={playSpeed}
                onChange={(e) => setPlaySpeed(Number(e.target.value))}
                title="自动速度"
                aria-label="自动速度"
                className="h-9 px-2 text-sm bg-[var(--sys-bg-panel)] text-[color:var(--sys-text-secondary)] border border-[var(--sys-border-default)] rounded-md outline-none shrink-0"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={3}>3x</option>
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] shrink-0">
              <button
                onClick={() => addAgent()}
                title="新增节点"
                aria-label="新增节点"
                className={iconBtnClass}
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="6" r="1.7" />
                  <circle cx="12" cy="6.5" r="1.7" />
                  <circle cx="7.5" cy="13" r="1.7" />
                  <path d="M6.6 6.3 10.4 6.4" />
                  <path d="M5.8 7.3 6.8 11.3" />
                  <path d="M10.9 7.8 8.8 11.7" />
                  <path d="M15.5 12.6h3.2" />
                  <path d="M17.1 11v3.2" />
                </svg>
              </button>

              <button
                onClick={reset}
                title="重置实验"
                aria-label="重置实验"
                className={`${iconBtnClass} text-lg leading-none`}
              >
                ↺
              </button>

              <button
                onClick={onToggleEventSidebar}
                title={isEventSidebarOpen ? '收起事件侧栏' : '展开事件侧栏'}
                aria-label={isEventSidebarOpen ? '收起事件侧栏' : '展开事件侧栏'}
                className={`${iconBtnClass} ${isEventSidebarOpen ? 'bg-[var(--sys-bg-hover)] text-[color:var(--sys-text-primary)]' : ''}`}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="3" width="11" height="10" rx="1.6" />
                  <path d="M8 3v10" />
                  <path d="M10.5 6.2h1.4" />
                  <path d="M10.5 8h1.4" />
                  <path d="M10.5 9.8h1.4" />
                </svg>
              </button>
            </div>
          </>
        )}

        <button
          onClick={isDocsView ? onOpenSimulation : onOpenDocs}
          title={isDocsView ? '返回仿真' : '打开文档'}
          aria-label={isDocsView ? '返回仿真' : '打开文档'}
          className={isDocsView ? returnBtnClass : viewBtnClass}
        >
          {isDocsView ? (
            <>
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.5 3.5 5.5 8l5 4.5" />
              </svg>
              <span>返回仿真</span>
            </>
          ) : (
            '文档'
          )}
        </button>

        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          aria-label="GitHub 仓库"
          className={githubBtnClass}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1.3a6.7 6.7 0 0 0-2.12 13.06c.34.06.47-.14.47-.33v-1.2c-1.9.41-2.3-.8-2.3-.8-.3-.75-.73-.95-.73-.95-.6-.4.04-.4.04-.4.67.04 1.02.69 1.02.69.59 1.01 1.55.72 1.93.55.06-.43.23-.72.42-.89-1.52-.17-3.12-.76-3.12-3.4 0-.75.26-1.36.69-1.84-.07-.17-.3-.87.06-1.82 0 0 .56-.18 1.86.7a6.36 6.36 0 0 1 3.39 0c1.3-.88 1.86-.7 1.86-.7.36.95.13 1.65.06 1.82.43.48.69 1.09.69 1.84 0 2.65-1.6 3.22-3.13 3.39.25.22.46.66.46 1.34v1.99c0 .19.12.39.48.33A6.7 6.7 0 0 0 8 1.3Z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
