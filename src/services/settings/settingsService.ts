const SETTINGS_KEY = "biology-analysis-app-settings";

export interface AppSettings {
  lastPipelineId: string | null;
  lastOutputFolder: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  lastPipelineId: null,
  lastOutputFolder: null,
};

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      lastPipelineId: parsed.lastPipelineId ?? null,
      lastOutputFolder: parsed.lastOutputFolder ?? null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const updated = { ...getSettings(), ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}
