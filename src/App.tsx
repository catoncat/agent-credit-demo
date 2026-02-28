import { useCallback, useEffect, useState } from 'react';
import { AppShell, type AppView } from './components/layout/AppShell';

const SIMULATION_HASH = '#/';
const DOCS_HASH = '#/docs';

function getViewFromHash(hash: string): AppView {
  return hash === DOCS_HASH ? 'docs' : 'simulation';
}

function navigateToView(view: AppView) {
  const nextHash = view === 'docs' ? DOCS_HASH : SIMULATION_HASH;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(() => getViewFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setCurrentView(getViewFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);

    if (!window.location.hash) {
      window.location.hash = SIMULATION_HASH;
    } else {
      onHashChange();
    }

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const onOpenDocs = useCallback(() => navigateToView('docs'), []);
  const onOpenSimulation = useCallback(() => navigateToView('simulation'), []);

  return (
    <AppShell
      currentView={currentView}
      onOpenDocs={onOpenDocs}
      onOpenSimulation={onOpenSimulation}
    />
  );
}
