// ============================================================================
// DefenderUnits - registry & state mutators for defender side
// ============================================================================

import type { DefenderUnit, DefenderUnitType, UnitState } from '@/types';
import { DEFENDER_UNITS } from '@/data/constants';

export class DefenderUnitsRegistry {
  private units: Map<string, DefenderUnit> = new Map();
  private nextId = 1;

  addUnit(type: DefenderUnitType, col: number, row: number, squads?: 1 | 2 | 3): DefenderUnit {
    const tpl = DEFENDER_UNITS[type];
    const id = `${type.toLowerCase()}-${this.nextId++}`;
    const unit: DefenderUnit = {
      id,
      type,
      atk: tpl.atk,
      def: tpl.def,
      move: tpl.move,
      range: tpl.range,
      col,
      row,
      state: 'ok',
      ...(type === 'INF' && { squads: squads ?? 1 }),
      ...(tpl.secondaryMove !== undefined && { secondaryMove: tpl.secondaryMove }),
      ...(tpl.indirect !== undefined && { indirect: tpl.indirect }),
    };
    this.units.set(id, unit);
    return unit;
  }

  getAll(): DefenderUnit[] { return [...this.units.values()]; }
  getAlive(): DefenderUnit[] { return this.getAll().filter((u) => u.state !== 'dead'); }
  getOK(): DefenderUnit[] { return this.getAll().filter((u) => u.state === 'ok'); }
  getById(id: string): DefenderUnit | undefined { return this.units.get(id); }

  getAt(col: number, row: number): DefenderUnit | undefined {
    return this.getAlive().find((u) => u.col === col && u.row === row);
  }

  getCp(): DefenderUnit | undefined {
    return this.getAll().find((u) => u.type === 'CP');
  }

  moveUnit(id: string, col: number, row: number): void {
    const u = this.units.get(id);
    if (u) { u.col = col; u.row = row; }
  }

  setUnitState(id: string, state: UnitState): void {
    const u = this.units.get(id);
    if (u) u.state = state;
  }

  /** Remove a unit entirely from the registry (e.g. INF stack merge). */
  removeUnit(id: string): void {
    this.units.delete(id);
  }

  getAliveGevs(): DefenderUnit[] {
    return this.getAlive().filter((u) => u.type === 'GEV');
  }

  /** End-of-turn refresh: move 'disabled' back to 'ok' (one-turn disable). */
  refreshDisabled(): void {
    for (const u of this.units.values()) {
      if (u.state === 'disabled') u.state = 'ok';
    }
  }
}
