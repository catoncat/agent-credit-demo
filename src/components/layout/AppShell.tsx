import { useEffect, useState } from 'react';
import { ControlBar } from './ControlBar';
import { DecisionInspector } from '../panels/DecisionInspector';
import { SettlementPanel } from '../panels/SettlementPanel';
import { EventTimelinePanel } from '../panels/EventTimelinePanel';
import { FlowTopologyPanel } from '../panels/FlowTopologyPanel';
import { DocsShell } from '../docs/DocsShell';

export type AppView = 'simulation' | 'docs';

interface AppShellProps {
  currentView: AppView;
  onOpenDocs: () => void;
  onOpenSimulation: () => void;
}

export function AppShell({ currentView, onOpenDocs, onOpenSimulation }: AppShellProps) {
  const [isEventSidebarOpen, setIsEventSidebarOpen] = useState(false);
  const isDocsView = currentView === 'docs';

  useEffect(() => {
    if (!isEventSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsEventSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEventSidebarOpen]);

  useEffect(() => {
    if (isDocsView && isEventSidebarOpen) {
      setIsEventSidebarOpen(false);
    }
  }, [isDocsView, isEventSidebarOpen]);

  return (
    <div className="relative w-full min-h-dvh lg:h-full flex flex-col bg-[var(--sys-bg-canvas)] overflow-visible lg:overflow-hidden text-[color:var(--sys-text-primary)]">
      <ControlBar
        currentView={currentView}
        isEventSidebarOpen={isEventSidebarOpen}
        onToggleEventSidebar={() => setIsEventSidebarOpen((open) => !open)}
        onOpenDocs={onOpenDocs}
        onOpenSimulation={onOpenSimulation}
      />

      {isDocsView ? (
        <div className="flex-1 min-h-0 overflow-visible lg:overflow-hidden">
          <DocsShell />
        </div>
      ) : (
        <div className="p-2 sm:p-3 flex-1 min-h-0 overflow-visible lg:overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 lg:h-full">
            <div className="lg:col-span-7 min-h-[320px] md:min-h-[380px] lg:min-h-0 lg:h-full">
              <FlowTopologyPanel />
            </div>
            <div className="lg:col-span-5 min-h-0 flex flex-col gap-3 lg:h-full">
              <div className="shrink-0 min-h-[260px] lg:min-h-0 lg:basis-[36%]">
                <DecisionInspector />
              </div>
              <div className="min-h-[320px] lg:min-h-0 lg:flex-1">
                <SettlementPanel />
              </div>
            </div>
          </div>
        </div>
      )}

      {!isDocsView && isEventSidebarOpen && (
        <button
          type="button"
          aria-label="Close events sidebar overlay"
          onClick={() => setIsEventSidebarOpen(false)}
          className="absolute inset-0 z-40 bg-black/25"
        />
      )}

      {!isDocsView && (
        <aside
          className={`absolute inset-y-0 right-0 z-50 w-full max-w-[460px] transform-gpu transition-transform duration-200 ease-out ${
            isEventSidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}
        >
          <div className="h-full p-2 sm:p-3 border-l border-[var(--sys-border-default)] bg-[var(--sys-bg-canvas)] shadow-2xl">
            <EventTimelinePanel forceFullHeight />
          </div>
        </aside>
      )}
    </div>
  );
}
