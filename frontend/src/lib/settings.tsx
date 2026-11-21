import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MotionConfig, useReducedMotion as useSystemReducedMotion } from 'framer-motion';
import { sound } from './sound';

export type MotionMode = 'full' | 'calm' | 'none';
export type MachineQuality = 'high' | 'light' | 'off';
export interface Settings { motion: MotionMode; machine: MachineQuality; volume: number; ui: boolean; ambient: boolean }

const DEFAULTS: Settings = { motion: 'full', machine: 'high', volume: 0.8, ui: true, ambient: false };
const load = (): Settings => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ff-settings') || '{}') }; } catch { return DEFAULTS; } };

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void }>({ settings: DEFAULTS, update: () => undefined });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  const update = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));
  useEffect(() => {
    localStorage.setItem('ff-settings', JSON.stringify(settings));
    document.documentElement.dataset.motion = settings.motion;
    sound.configure({ master: settings.volume, ui: settings.ui, ambient: settings.ambient });
  }, [settings]);
  const value = useMemo(() => ({ settings, update }), [settings]);
  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={settings.motion === 'full' ? 'user' : 'always'}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

/** True when the system asks for reduced motion OR the in-app motion setting is calm/none. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const { settings } = useSettings();
  return Boolean(system) || settings.motion !== 'full';
}
