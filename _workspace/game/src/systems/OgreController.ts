// ============================================================================
// OgreController - OGRE state, weapon damage, tread tracking
// ============================================================================

import type { OgreStats, OgreWeapon } from '@/types';
import { OGRE_MOVEMENT_TABLE, OGRE_NEUTRALIZED_TREAD_THRESHOLD } from '@/data/constants';

export class OgreController {
  private stats: OgreStats;

  constructor(initial: OgreStats) {
    this.stats = initial;
    this.recalcMovement();
    this.recalcNeutralized();
  }

  getStats(): OgreStats { return this.stats; }

  moveTo(col: number, row: number): void {
    this.stats.col = col;
    this.stats.row = row;
  }

  damageTreads(amount: number): void {
    this.stats.treads = Math.max(0, this.stats.treads - amount);
    this.recalcMovement();
    this.recalcNeutralized();
  }

  damageWeapon(weaponId: string): boolean {
    const w = this.stats.weapons.find((x) => x.id === weaponId);
    if (!w || w.disabled) return false;
    w.remaining = Math.max(0, w.remaining - 1);
    if (w.remaining === 0) w.disabled = true;
    this.recalcNeutralized();
    return true;
  }

  /** Disable ALL batteries of given id (e.g. catastrophic kill from CRT 'X'). */
  destroyWeapon(weaponId: string): boolean {
    const w = this.stats.weapons.find((x) => x.id === weaponId);
    if (!w || w.disabled) return false;
    w.remaining = 0;
    w.disabled = true;
    this.recalcNeutralized();
    return true;
  }

  isNeutralized(): boolean {
    return this.stats.neutralized;
  }

  getAvailableWeapons(): OgreWeapon[] {
    return this.stats.weapons.filter((w) => !w.disabled);
  }

  canRam(): boolean {
    return this.stats.movement > 0;
  }

  private recalcMovement(): void {
    const t = this.stats.treads;
    for (const band of OGRE_MOVEMENT_TABLE) {
      if (t >= band.treadMin && t <= band.treadMax) {
        this.stats.movement = band.movement;
        return;
      }
    }
    this.stats.movement = 0;
  }

  private recalcNeutralized(): void {
    const allDisabled = this.stats.weapons.every((w) => w.disabled);
    this.stats.neutralized = allDisabled && this.stats.treads <= OGRE_NEUTRALIZED_TREAD_THRESHOLD;
  }
}
