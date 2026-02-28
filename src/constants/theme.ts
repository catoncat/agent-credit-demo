export const COLORS = {
  bg: {
    primary: '#EEF1F4',
    panel: '#FFFFFF',
    card: '#F8F9FB',
    hover: '#EDF2F7',
  },
  agent: {
    idle: '#355070',
    success: '#2E7D32',
    fail: '#B42318',
    executing: '#9A6700',
    overflow: '#B54708',
    glow: '#0F766E',
  },
  state: {
    idleSoft: '#E8EEF5',
    successSoft: '#EAF7EF',
    failSoft: '#FDECEB',
    executingSoft: '#FFF6E5',
    overflowSoft: '#FFF1E7',
    neutralSoft: '#F3F5F8',
  },
  text: {
    primary: '#1F2933',
    secondary: '#4B5563',
    muted: '#6B7280',
  },
  accent: '#0F766E',
  border: '#D7DDE5',
  chart: {
    line: '#355070',
    area: 'rgba(53, 80, 112, 0.08)',
    dot: '#0F766E',
    grid: '#DBE3EC',
  },
} as const;

export const LAYOUT = {
  sidebarWidth: 240,
  controlBarHeight: 64,
  narrativeBarHeight: 80,
  metricsWidth: 380,
  padding: 16,
} as const;
