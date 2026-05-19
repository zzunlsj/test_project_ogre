import type { ScenarioConfig, DefenderUnitType } from '@/types';

/**
 * STANDARD SCENARIO — Mk.III OGRE vs Standard Defense.
 *
 * Zones (0-index rows):
 *  - Northern: row 0-6   (R01-R07) — OGRE entry zone
 *  - Central:  row 7-14  (R08-R15) — Defender zone (CP allowed in R08-R11 = row 7-10)
 *  - Southern: row 15-21 (R16-R22) — Defender zone
 *
 * Defender budget: 12 armor slots + 20 infantry points.
 *  - HVY = 3 slots, MSL = 2, GEV = 2, HOW = 2
 *  - INF = 2 pts/squad, no slot cost
 */
export const STANDARD_SCENARIO: ScenarioConfig = {
  id: 'standard',
  name: 'STANDARD SCENARIO',
  description: 'OGRE Mk.III vs Standard Defense',
  maxTurns: 15,

  // OGRE 시작 위치: Southern 마지막 행 (row=21, R22) → 북쪽 CP 방향 진격
  ogreStart: { col: 7, row: 21 },

  // CP 허용 위치: Northern 존 (row 0-6 = R01-R07)
  cpAllowedZone: { rowMin: 0, rowMax: 6, colMin: 1, colMax: 13 },

  // 방어군 배치 허용 존: Northern(row 0-6) + Central(row 7-14) — Southern 배치 불가
  defenderPlacementZone: { rowMin: 0, rowMax: 14 },

  // Central 존 ATK 합 제한
  centralZone: { rowMin: 7, rowMax: 14, maxAtk: 20 },

  // 방어군 배치 예산
  budget: {
    infPoints: 20, // 보병: 2점/스쿼드, 최대 10스쿼드, 헥스당 3스쿼드 중첩
    armorSlots: 12, // HVY=3, MSL=2, GEV=2, HOW=2
  },

  // AI 기본 배치 (Easy 난이도)
  // CP → Northern(row 2), 장갑 → Central(ATK 합 ≤20), 후방지원 → Southern
  aiDefaultPlacement: [
    // CP — Northern 존 중앙 (row 2 = R03)
    { type: 'CP' as DefenderUnitType, col: 7, row: 2 },

    // Central 존 장갑: HVY×2(8) + GEV×2(6) = 14 ≤ 20 OK
    { type: 'HVY' as DefenderUnitType, col: 5, row: 10 },
    { type: 'HVY' as DefenderUnitType, col: 9, row: 10 },
    { type: 'GEV' as DefenderUnitType, col: 4, row: 9 },
    { type: 'GEV' as DefenderUnitType, col: 10, row: 9 },

    // Central 후방 (Southern 배치 불가 — HOW는 이동 불가이므로 가장 북쪽)
    { type: 'HOW' as DefenderUnitType, col: 3, row: 12 },
    { type: 'HOW' as DefenderUnitType, col: 11, row: 12 },
    { type: 'MSL' as DefenderUnitType, col: 5, row: 13 },
    { type: 'MSL' as DefenderUnitType, col: 9, row: 13 },

    // 보병 (Central): 4스쿼드 = ATK +4 → 총 18 ≤ 20
    { type: 'INF' as DefenderUnitType, col: 6, row: 11 },
    { type: 'INF' as DefenderUnitType, col: 8, row: 11 },
    { type: 'INF' as DefenderUnitType, col: 5, row: 12 },
    { type: 'INF' as DefenderUnitType, col: 9, row: 12 },
  ],

  // 승리 조건
  victoryConditions: {
    ogre: 'Destroy the Command Post (CP)',
    defender:
      'Neutralize the OGRE (all weapons disabled AND treads <= 5)',
  },
};

/** 장갑 유닛 슬롯 비용 (CP, INF는 슬롯 비용 없음) — 모든 장갑 유닛 1슬롯 */
export const ARMOR_SLOT_COST: Partial<Record<DefenderUnitType, number>> = {
  HVY: 1,
  MSL: 1,
  GEV: 1,
  HOW: 1,
};

/** 보병 1스쿼드 점수 비용 */
export const INF_POINT_COST = 1;

/** 보병 최대 스쿼드 수 (스택당) */
export const INF_MAX_SQUADS_PER_STACK = 3;
