import type { DefenderUnitType } from '@/types';

export interface UnitTemplate {
  type: DefenderUnitType;
  label: string;
  /** Phaser 텍스처 키 (assets/svg에서 로드) */
  svgKey: string;
  atk: number;
  def: number;
  move: number;
  range: number;
  /** 장갑 슬롯 비용 (CP/INF은 0) */
  armorSlots: number;
  /** 보병 1스쿼드당 점수 비용 (비보병은 0) */
  infPointsPerSquad: number;
  /** GEV 전용 2차 이동 (1차 이동 후 사격 후 추가 이동) */
  secondaryMove?: number;
  /** Howitzer 전용 간접 사격 플래그 */
  indirect?: boolean;
}

/**
 * 방어군 + CP 유닛 템플릿.
 * 수치는 OGRE Pocket Edition 표준 시나리오 기준.
 */
export const UNIT_TEMPLATES: Record<DefenderUnitType, UnitTemplate> = {
  HVY: {
    type: 'HVY',
    label: 'Heavy Tank',
    svgKey: 'heavy_tank',
    atk: 4,
    def: 3,
    move: 3,
    range: 2,
    armorSlots: 1,
    infPointsPerSquad: 0,
  },
  MSL: {
    type: 'MSL',
    label: 'Missile Tank',
    svgKey: 'missile_tank',
    atk: 6,
    def: 2,
    move: 2,
    range: 4,
    armorSlots: 1,
    infPointsPerSquad: 0,
  },
  GEV: {
    type: 'GEV',
    label: 'GEV',
    svgKey: 'gev',
    atk: 3,
    def: 2,
    move: 4,
    range: 2,
    armorSlots: 1,
    infPointsPerSquad: 0,
    secondaryMove: 3,
  },
  HOW: {
    type: 'HOW',
    label: 'Howitzer',
    svgKey: 'howitzer',
    atk: 6,
    def: 1,
    move: 0,
    range: 8,
    armorSlots: 1,
    infPointsPerSquad: 0,
    indirect: true,
  },
  INF: {
    type: 'INF',
    label: 'Infantry',
    svgKey: 'infantry_3',
    atk: 1,
    def: 1,
    move: 2,
    range: 1,
    armorSlots: 0,
    infPointsPerSquad: 1,
  },
  CP: {
    type: 'CP',
    label: 'Command Post',
    svgKey: 'cp',
    atk: 0,
    def: 3,
    move: 0,
    range: 0,
    armorSlots: 0,
    infPointsPerSquad: 0,
  },
};

/**
 * 보병 스쿼드 수에 따른 SVG 텍스처 키.
 * 3스쿼드 = 'infantry_3', 2스쿼드 = 'infantry_2', 1스쿼드 = 'infantry_1'
 */
export function infSvgKey(squads: 1 | 2 | 3): string {
  return `infantry_${squads}`;
}

/** OGRE 무기 표시명 (UI 라벨용) */
export const OGRE_WEAPON_LABELS: Record<string, string> = {
  main: 'MAIN BATTERY',
  secondary: 'SECONDARY',
  missile: 'MISSILE',
  ap: 'AP GUN',
};

/** OGRE 무기 정렬 순서 (UI 표시) */
export const OGRE_WEAPON_ORDER: ReadonlyArray<keyof typeof OGRE_WEAPON_LABELS> = [
  'main',
  'secondary',
  'missile',
  'ap',
] as const;
