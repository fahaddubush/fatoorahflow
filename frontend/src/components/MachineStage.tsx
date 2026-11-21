import { lazy, Suspense } from 'react';
import type { MachinePhase } from './IngestMachine';
import { useReducedMotion, useSettings } from '../lib/settings';

// three.js is heavy: keep it out of the first paint and fetch it when a machine is first shown.
const IngestMachine = lazy(() => import('./IngestMachine'));
export type { MachinePhase };

type Props = React.ComponentProps<typeof IngestMachine>;

/**
 * Wraps the 3D unit: reads the motion/quality settings, remounts when quality changes, and adds a CSS tilt-shift
 * (soft blur on the far and near edges) so the machine and sheet read as the focal plane.
 */
export function MachineStage(props: Props) {
  const { settings } = useSettings();
  const reduced = useReducedMotion();
  const calm = settings.motion !== 'full';
  const quality = props.quality ?? (settings.machine === 'high' && (calm || reduced) ? 'light' : settings.machine);
  return (
    <>
      <Suspense fallback={<div className={`grid place-items-center ${props.className ?? ''}`}><span className="label animate-blink">Warming up</span></div>}>
        <IngestMachine key={quality} {...props} quality={quality} calm={calm} />
      </Suspense>
      {quality === 'high' && !reduced && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[20%] backdrop-blur-[2.5px]" style={{ WebkitMaskImage: 'linear-gradient(to bottom, #000, transparent)', maskImage: 'linear-gradient(to bottom, #000, transparent)' }} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] backdrop-blur-[2.5px]" style={{ WebkitMaskImage: 'linear-gradient(to top, #000, transparent)', maskImage: 'linear-gradient(to top, #000, transparent)' }} />
        </>
      )}
    </>
  );
}
