// ============================================================================
// CombatSystem - CRT lookup + Dice Hold bias resolution
// ============================================================================

import type {
  CrtRatioKey,
  CrtResult,
  CombatDeclaration,
  CombatResult,
  DiceHoldResult,
} from '@/types';
import { COMBAT_TABLE as CRT, RATIO_ORDER, ratioFromAtkDef, applyRidgeBonusToRatio, DICE_BIAS_RANGE } from '@/data/constants';

export class CombatSystem {
  ratioKey(atk: number, def: number): CrtRatioKey {
    return ratioFromAtkDef(atk, def);
  }

  applyRidgeBonus(ratio: CrtRatioKey): CrtRatioKey {
    return applyRidgeBonusToRatio(ratio);
  }

  ratioFor(atk: number, def: number, ridgeBonus: boolean): CrtRatioKey {
    let r = this.ratioKey(atk, def);
    if (ridgeBonus) r = this.applyRidgeBonus(r);
    return r;
  }

  /** d6 (1..6) -> NE/D/X */
  lookupCRT(ratio: CrtRatioKey, die: number): CrtResult {
    const idx = Math.max(1, Math.min(6, die)) - 1;
    return CRT[ratio][idx];
  }

  /**
   * Apply dice-hold bias.
   *
   * holdValue: -1..+1 (sin wave value at lock).
   * bias is mapped to +/- DICE_BIAS_RANGE then applied to the raw 1..6 roll
   * by shifting the underlying [0,1) random value, clamped to [1..6].
   *
   * Returns full CombatResult (declaration filled in by caller).
   */
  resolveWithBias(ratio: CrtRatioKey, holdResult: DiceHoldResult): {
    rawRoll: number;
    bias: number;
    finalRoll: number;
    result: CrtResult;
  } {
    const rawRoll = holdResult.roll; // already 1..6 from dice hold
    const bias = Math.max(-DICE_BIAS_RANGE, Math.min(DICE_BIAS_RANGE, holdResult.bias));

    // Shift raw roll on a continuous [0..1) scale by bias*scale, then re-bucket to 1..6
    const continuous = (rawRoll - 1) / 6 + 0.5 / 6; // mid-bucket
    const shifted = Math.max(0, Math.min(0.9999, continuous + bias * 0.5));
    const finalRoll = Math.floor(shifted * 6) + 1;
    const result = this.lookupCRT(ratio, finalRoll);
    return { rawRoll, bias, finalRoll, result };
  }

  /** RAM: d6 1-3 = D, 4-6 = X (from spec) */
  resolveRam(): { roll: number; result: 'D' | 'X' } {
    const roll = Math.floor(Math.random() * 6) + 1;
    const result: 'D' | 'X' = roll <= 3 ? 'D' : 'X';
    return { roll, result };
  }

  /**
   * Full resolve: aggregates attackers' atk vs single defender's def,
   * applies ridge bonus, runs CRT with optional dice-hold bias.
   * If holdResult is null, falls back to plain random d6 with bias=0.
   */
  resolve(
    declaration: CombatDeclaration,
    holdResult: DiceHoldResult | null
  ): CombatResult {
    const ratio = declaration.ratio;
    let rawRoll: number;
    let bias = 0;
    let finalRoll: number;

    if (holdResult) {
      const r = this.resolveWithBias(ratio, holdResult);
      rawRoll = r.rawRoll;
      bias = r.bias;
      finalRoll = r.finalRoll;
    } else {
      rawRoll = Math.floor(Math.random() * 6) + 1;
      finalRoll = rawRoll;
    }

    const result = this.lookupCRT(ratio, finalRoll);
    return {
      declaration,
      ratio,
      roll: rawRoll,
      bias,
      finalRoll,
      result,
    };
  }

  /** Builds a CombatDeclaration from raw atk list and a single def value. */
  buildDeclaration(
    attackerIds: string[],
    targetId: string,
    totalAtk: number,
    totalDef: number,
    ridgeBonus: boolean
  ): CombatDeclaration {
    const ratio = this.ratioFor(totalAtk, totalDef, ridgeBonus);
    return {
      attackerIds,
      targetId,
      totalAtk,
      totalDef,
      ridgeBonus,
      ratio,
    };
  }

  /** Static helper: convenient for UI labels */
  static ratioOrder(): CrtRatioKey[] {
    return [...RATIO_ORDER];
  }
}
