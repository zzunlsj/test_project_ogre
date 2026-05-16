// ============================================================================
// VictoryChecker - victory conditions
// ============================================================================

import type { OgreStats, DefenderUnit, Side } from '@/types';

export interface VictoryReport {
  winner: Side | null;
  condition: string;
}

export class VictoryChecker {
  check(
    ogre: OgreStats,
    defenders: DefenderUnit[],
    turn: number,
    maxTurns?: number
  ): VictoryReport {
    const cp = defenders.find((u) => u.type === 'CP');

    // OGRE wins when CP destroyed
    if (!cp || cp.state === 'dead') {
      return { winner: 'ogre', condition: 'CP destroyed' };
    }

    // Defender wins when OGRE neutralized
    if (ogre.neutralized) {
      return { winner: 'defender', condition: 'OGRE neutralized' };
    }

    // Optional: turn limit defender win
    if (maxTurns !== undefined && turn > maxTurns) {
      return { winner: 'defender', condition: 'Turn limit reached, CP survives' };
    }

    return { winner: null, condition: 'Game in progress' };
  }
}
