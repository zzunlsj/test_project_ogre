// ============================================================================
// AIController - Easy AI for defender side
// ============================================================================

import type { DefenderUnit, DefenderUnitType, OgreStats, HexCoord, OgreWeapon } from '@/types';
import { HexGrid } from './HexGrid';
import { CombatSystem } from './CombatSystem';
import { ZONE_ROWS, DEFENDER_UNITS, CRATER_COORDS } from '@/data/constants';

export interface PlacementPlan {
  type: DefenderUnitType;
  col: number;
  row: number;
  squads?: 1 | 2 | 3;
}

export class AIController {
  constructor(
    private hexGrid: HexGrid,
    private _combatSystem: CombatSystem,
  ) {}

  /**
   * 전략적 자동 배치 (대칭, 계층형):
   *  OGRE는 남쪽(row 21)에서 북쪽으로 이동 → 방어선을 남→북 순으로 배치
   *
   *  계층 구조:
   *   Layer 0: CP (Northern row 2, center)
   *   Layer 1: HOW ×2 (Southern rear, 간접 화력)
   *   Layer 2: MSL ×2 (Southern rear, 대형 미사일)
   *   Layer 3: GEV ×2 (Central 양익, 기동)
   *   Layer 4: HVY ×2 (Central 중앙선, 주력)
   *   Layer 5: MSL/GEV ×2 (Central/Southern 보강)
   *   Layer 6: HVY ×2 (Southern 전선)
   *   Layer INF: 최전선 보병 (Southern rows 16-19)
   *
   *  배치 규칙: 크레이터 금지, OGRE 진입행 금지, Central ATK ≤ 20
   */
  autoPlace(budget: { infantryPoints: number; armorSlots: number }): PlacementPlan[] {
    const CENTRAL_ATK_LIMIT = 20;
    const UNIT_ATK: Record<DefenderUnitType, number> = {
      HVY: 4, MSL: 6, GEV: 3, HOW: 6, INF: 1, CP: 0,
    };

    const placements: PlacementPlan[] = [];
    const occupied    = new Set<string>();
    const craterSet   = new Set(CRATER_COORDS.map(c => `${c.col},${c.row}`));
    const key         = (c: number, r: number) => `${c},${r}`;
    const ogreEntry   = (col: number) => (col % 2 === 1) ? 21 : 20;

    // Central ATK 합산
    const centralAtk = () => placements
      .filter(p => p.row >= ZONE_ROWS.central.rowMin && p.row <= ZONE_ROWS.central.rowMax)
      .reduce((s, p) => s + (p.type === 'INF' ? (p.squads ?? 1) : (UNIT_ATK[p.type] ?? 0)), 0);

    /**
     * 지정 위치에 유닛 배치 시도.
     * 크레이터/점령/OGRE진입행 막히면 주변 대안 시도.
     * 성공 시 true 반환.
     */
    const place = (
      type: DefenderUnitType,
      col: number, row: number,
      squads?: 1 | 2 | 3
    ): boolean => {
      // 시도 순서: 원위치, 좌/우±1, 상/하±1, ±2 확장
      const alts: [number, number][] = [
        [col, row], [col - 1, row], [col + 1, row],
        [col, row - 1], [col, row + 1],
        [col - 2, row], [col + 2, row],
        [col - 1, row - 1], [col + 1, row - 1],
      ];
      for (const [c, r] of alts) {
        if (!this.hexGrid.isValid(c, r)) continue;
        if (r >= ogreEntry(c)) continue;           // OGRE 진입 행 금지
        if (craterSet.has(key(c, r))) continue;    // 크레이터 금지
        if (occupied.has(key(c, r))) continue;     // 이미 점령
        if (type === 'CP' && r > ZONE_ROWS.northern.rowMax) continue;  // CP: Northern only
        if (type !== 'CP' && r <= ZONE_ROWS.northern.rowMax) continue; // 비CP: Northern 배치 불가
        // Central ATK 한도 체크
        if (r >= ZONE_ROWS.central.rowMin && r <= ZONE_ROWS.central.rowMax) {
          const addAtk = type === 'INF' ? (squads ?? 1) : (UNIT_ATK[type] ?? 0);
          if (centralAtk() + addAtk > CENTRAL_ATK_LIMIT) continue;
        }
        placements.push({ type, col: c, row: r, squads });
        occupied.add(key(c, r));
        return true;
      }
      return false;
    };

    let slots = budget.armorSlots;
    let pts   = budget.infantryPoints;

    // ── Layer 0: CP (Northern 중앙, col 7, row 2) ──────────────────
    place('CP', 7, 2);

    // ── Layer 1: HOW ×2 — Southern 후방 포병 (row 15) ─────────────
    if (slots > 0 && place('HOW', 3,  15)) slots--;
    if (slots > 0 && place('HOW', 11, 15)) slots--;

    // ── Layer 2: MSL ×2 — Southern 미사일 (row 16) ─────────────────
    if (slots > 0 && place('MSL', 5,  16)) slots--;
    if (slots > 0 && place('MSL', 9,  16)) slots--;

    // ── Layer 3: GEV ×2 — Central 양익 기동 (row 10) ───────────────
    if (slots > 0 && place('GEV', 3,  10)) slots--;
    if (slots > 0 && place('GEV', 11, 10)) slots--;

    // ── Layer 4: HVY ×2 — Central 중앙 중전차 (row 11) ─────────────
    if (slots > 0 && place('HVY', 5,  11)) slots--;
    if (slots > 0 && place('HVY', 9,  11)) slots--;

    // ── Layer 5: 보강 — Central/Southern (row 12-13) ───────────────
    // MSL 1기 중앙 (Central ATK 여유 있으면 Central, 없으면 Southern)
    if (slots > 0) {
      if (centralAtk() + 6 <= CENTRAL_ATK_LIMIT) { if (place('MSL', 7, 12)) slots--; }
      else                                          { if (place('MSL', 7, 17)) slots--; }
    }
    if (slots > 0) {
      if (centralAtk() + 3 <= CENTRAL_ATK_LIMIT) { if (place('GEV', 7, 11)) slots--; }
      else                                          { if (place('GEV', 7, 16)) slots--; }
    }

    // ── Layer 6: HVY ×2 — Southern 전선 중전차 (row 17) ────────────
    if (slots > 0 && place('HVY', 5,  17)) slots--;
    if (slots > 0 && place('HVY', 9,  17)) slots--;

    // ── 잔여 슬롯: 대칭 후보 목록으로 채우기 ──────────────────────
    const fallback: [DefenderUnitType, number, number][] = [
      ['HVY', 7, 13], ['HVY', 3, 13], ['HVY', 11, 13],
      ['MSL', 4, 14], ['MSL', 10, 14], ['GEV', 2, 12], ['GEV', 12, 12],
      ['HOW', 6, 14], ['HOW', 8, 14],
    ];
    for (const [t, c, r] of fallback) {
      if (slots <= 0) break;
      if (place(t, c, r)) slots--;
    }

    // ── 보병 최전선 (Southern rows 16-19, 대칭 배치) ────────────────
    // 전략: 2스쿼드씩 대칭 배치 → ATK 2/hex, 최전방 스크리닝
    const infGrid: [number, number, 1|2|3][] = [
      [2, 18, 2], [4, 18, 2], [6, 18, 2], [8, 18, 2], [10, 18, 2], [12, 18, 2],
      [3, 17, 1], [11, 17, 1],
      [5, 19, 1], [7, 19, 1], [9, 19, 1],
      [2, 16, 1], [12, 16, 1],
    ];
    for (const [c, r, sq] of infGrid) {
      if (pts < sq) continue;
      if (place('INF', c, r, sq)) pts -= sq;
    }

    return placements;
  }

  /**
   * Easy AI movement: stay put if in range; otherwise advance toward OGRE.
   * GEV/MSL kite (keep at max range). Returns map<unitId, target hex>.
   */
  planMoves(
    units: DefenderUnit[],
    ogre: OgreStats,
    craterSet: Set<string> = new Set(),
    blockerSet: Set<string> = new Set()
  ): Map<string, HexCoord> {
    const plans = new Map<string, HexCoord>();
    const ogrePos: HexCoord = { col: ogre.col, row: ogre.row };

    for (const u of units) {
      if (u.state !== 'ok' || u.type === 'CP' || u.type === 'HOW' || u.move === 0) continue;

      const reach = this.hexGrid.reachable(
        { col: u.col, row: u.row },
        u.move,
        craterSet,
        blockerSet
      );
      const candidates = [{ col: u.col, row: u.row }, ...reach];

      // score: distance to OGRE; prefer being in own range; INF prefer adjacent
      let best = candidates[0];
      let bestScore = -Infinity;
      for (const c of candidates) {
        const d = this.hexGrid.distance(c, ogrePos);
        let s = 0;
        if (u.type === 'INF') {
          s = -Math.abs(d - 1);
        } else if (u.type === 'GEV' || u.type === 'MSL') {
          s = -Math.abs(d - u.range); // kite
        } else {
          s = -Math.abs(d - Math.min(u.range, 2));
        }
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (best.col !== u.col || best.row !== u.row) {
        plans.set(u.id, best);
      }
    }
    return plans;
  }

  /**
   * Easy AI attacks: each unit attacks lowest-DEF reachable OGRE weapon.
   * Returns list of {unitId, target weaponId | 'treads'}.
   */
  planAttacks(
    units: DefenderUnit[],
    ogre: OgreStats
  ): { unitId: string; targetWeaponId: string }[] {
    const plans: { unitId: string; targetWeaponId: string }[] = [];
    const ogrePos: HexCoord = { col: ogre.col, row: ogre.row };
    const livingWeapons: OgreWeapon[] = ogre.weapons.filter((w) => !w.disabled);
    if (livingWeapons.length === 0) return plans;

    // Sort weapons by DEF asc (easiest target first)
    const targets = [...livingWeapons].sort((a, b) => a.def - b.def);

    for (const u of units) {
      if (u.state !== 'ok' || u.atk === 0 || u.range === 0) continue;
      const d = this.hexGrid.distance({ col: u.col, row: u.row }, ogrePos);
      if (d > u.range) continue;
      // pick target with lowest DEF this unit can hurt
      const target = targets[0];
      plans.push({ unitId: u.id, targetWeaponId: target.id });
    }
    return plans;
  }
}
