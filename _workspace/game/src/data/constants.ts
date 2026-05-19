// ============================================================================
// OGRE Web Game - Game Constants
// Canonical: _workspace/01_architecture/data-schema.md
// ============================================================================

import type {
  OgreStats,
  OgreMovementBand,
  CrtRatioKey,
  CrtRow,
  HexCoord,
  EdgeIndex,
  DefenderUnitType,
} from '@/types';

// ---------------------------------------------------------------------------
// 1. OGRE Mk.III
// ---------------------------------------------------------------------------
export function createOgreMk3(): OgreStats {
  return {
    id: 'ogre-mk3',
    mark: 'III',
    treads: 45,
    maxTreads: 45,
    movement: 3,
    facing: 4,   // 0=SE,1=S,2=SW,3=NW,4=N,5=NE — OGRE is moving NORTH from row 21
    col: 7,
    row: 21,     // 남쪽 마지막 행(R22)에서 시작 → 북쪽 CP를 향해 진격
    neutralized: false,
    weapons: [
      { id: 'main-1',      type: 'main',      atk: 4, def: 3, range: 4, count: 1, remaining: 1, disabled: false },
      { id: 'secondary-1', type: 'secondary', atk: 3, def: 3, range: 3, count: 2, remaining: 2, disabled: false },
      { id: 'secondary-2', type: 'secondary', atk: 3, def: 3, range: 3, count: 2, remaining: 2, disabled: false },
      { id: 'missile-1',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
      { id: 'missile-2',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
      { id: 'missile-3',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
      { id: 'missile-4',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
      { id: 'ap-1',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-2',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-3',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-4',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-5',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-6',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-7',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
      { id: 'ap-8',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    ],
  };
}

export const OGRE_MOVEMENT_TABLE: OgreMovementBand[] = [
  { treadMin: 31, treadMax: 45, movement: 3 },  // M3
  { treadMin: 16, treadMax: 30, movement: 2 },  // M2
  { treadMin:  1, treadMax: 15, movement: 1 },  // M1
  { treadMin:  0, treadMax:  0, movement: 0 },  // M0 (이동 불가)
];

export const OGRE_RAM_RESULT = ['D', 'D', 'D', 'X', 'X', 'X'] as const;
export const OGRE_NEUTRALIZED_TREAD_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// 2. Defender Unit Templates
// ---------------------------------------------------------------------------
export interface DefenderUnitTemplate {
  type: DefenderUnitType;
  label: string;
  atk: number;
  def: number;
  move: number;
  range: number;
  slots: number;
  infPoints: number;
  secondaryMove?: number;
  indirect?: boolean;
  canCrossRidge: boolean;
}

export const DEFENDER_UNITS: Record<DefenderUnitType, DefenderUnitTemplate> = {
  HVY: { type: 'HVY', label: 'Heavy Tank',   atk: 4, def: 3, move: 3, range: 2, slots: 1, infPoints: 0, canCrossRidge: false },
  MSL: { type: 'MSL', label: 'Missile Tank', atk: 6, def: 2, move: 2, range: 4, slots: 1, infPoints: 0, canCrossRidge: false },
  GEV: { type: 'GEV', label: 'GEV',          atk: 3, def: 2, move: 4, range: 2, slots: 1, infPoints: 0, secondaryMove: 3, canCrossRidge: false },
  HOW: { type: 'HOW', label: 'Howitzer',     atk: 6, def: 1, move: 0, range: 8, slots: 1, infPoints: 0, indirect: true, canCrossRidge: false },
  INF: { type: 'INF', label: 'Infantry',     atk: 1, def: 1, move: 2, range: 1, slots: 0, infPoints: 1, canCrossRidge: true  },
  CP:  { type: 'CP',  label: 'Command Post', atk: 0, def: 3, move: 0, range: 0, slots: 0, infPoints: 0, canCrossRidge: false },
};

// ---------------------------------------------------------------------------
// 3. CRT
// ---------------------------------------------------------------------------
export const COMBAT_TABLE: Record<CrtRatioKey, CrtRow> = {
  '1:3-': ['NE', 'NE', 'NE', 'NE', 'NE', 'D'],
  '1:2':  ['NE', 'NE', 'NE', 'NE', 'D',  'D'],
  '1:1':  ['NE', 'NE', 'NE', 'D',  'D',  'X'],
  '2:1':  ['NE', 'NE', 'D',  'D',  'X',  'X'],
  '3:1':  ['NE', 'D',  'D',  'X',  'X',  'X'],
  '4:1+': ['D',  'X',  'X',  'X',  'X',  'X'],
};

export const RATIO_ORDER: CrtRatioKey[] = ['1:3-', '1:2', '1:1', '2:1', '3:1', '4:1+'];

export function ratioFromAtkDef(atk: number, def: number): CrtRatioKey {
  if (def <= 0) return '4:1+';
  const r = atk / def;
  if (r >= 4) return '4:1+';
  if (r >= 3) return '3:1';
  if (r >= 2) return '2:1';
  if (r >= 1) return '1:1';
  if (r >= 0.5) return '1:2';
  return '1:3-';
}

export function applyRidgeBonusToRatio(ratio: CrtRatioKey): CrtRatioKey {
  const idx = RATIO_ORDER.indexOf(ratio);
  return RATIO_ORDER[Math.max(0, idx - 1)];
}

// ---------------------------------------------------------------------------
// 4. Map Crater Coordinates
// ---------------------------------------------------------------------------
export const CRATER_COORDS: HexCoord[] = [
  { col: 2,  row: 2  }, { col: 12, row: 2  }, { col: 13, row: 2  },
  { col: 9,  row: 3  }, { col: 4,  row: 4  }, { col: 13, row: 5  },
  { col: 0,  row: 6  }, { col: 8,  row: 6  }, { col: 14, row: 6  },
  { col: 5,  row: 7  }, { col: 1,  row: 8  }, { col: 12, row: 8  },
  { col: 5,  row: 10 }, { col: 6,  row: 10 }, { col: 2,  row: 11 },
  { col: 8,  row: 12 }, { col: 13, row: 12 },
];

// ---------------------------------------------------------------------------
// 5. Ridge Edges
// ---------------------------------------------------------------------------
export interface RidgeEdge { col: number; row: number; edge: EdgeIndex; }

export const RIDGE_EDGES: RidgeEdge[] = [
  { col: 0,  row: 0,  edge: 0 }, { col: 7,  row: 0,  edge: 0 },
  { col: 0,  row: 1,  edge: 5 }, { col: 4,  row: 1,  edge: 5 },
  { col: 5,  row: 1,  edge: 1 }, { col: 6,  row: 1,  edge: 2 },
  { col: 8,  row: 2,  edge: 5 }, { col: 8,  row: 2,  edge: 1 },
  { col: 2,  row: 3,  edge: 0 }, { col: 3,  row: 3,  edge: 1 },
  { col: 3,  row: 3,  edge: 0 }, { col: 8,  row: 3,  edge: 1 },
  { col: 8,  row: 3,  edge: 0 }, { col: 11, row: 3,  edge: 1 },
  { col: 12, row: 3,  edge: 2 }, { col: 2,  row: 5,  edge: 1 },
  { col: 6,  row: 5,  edge: 2 }, { col: 8,  row: 5,  edge: 0 },
  { col: 10, row: 5,  edge: 0 }, { col: 11, row: 5,  edge: 1 },
  { col: 1,  row: 6,  edge: 0 }, { col: 5,  row: 6,  edge: 0 },
  { col: 6,  row: 6,  edge: 1 }, { col: 10, row: 6,  edge: 1 },
  { col: 10, row: 6,  edge: 0 }, { col: 10, row: 6,  edge: 2 },
  { col: 2,  row: 7,  edge: 0 }, { col: 3,  row: 7,  edge: 0 },
  { col: 7,  row: 7,  edge: 0 }, { col: 13, row: 7,  edge: 1 },
  { col: 2,  row: 8,  edge: 0 }, { col: 1,  row: 9,  edge: 0 },
  { col: 2,  row: 9,  edge: 1 }, { col: 8,  row: 9,  edge: 5 },
  { col: 1,  row: 10, edge: 0 }, { col: 2,  row: 10, edge: 5 },
  { col: 2,  row: 10, edge: 2 }, { col: 10, row: 10, edge: 1 },
  { col: 10, row: 10, edge: 0 }, { col: 10, row: 10, edge: 2 },
  { col: 1,  row: 11, edge: 5 }, { col: 7,  row: 11, edge: 5 },
  { col: 7,  row: 11, edge: 0 }, { col: 9,  row: 11, edge: 1 },
  { col: 9,  row: 11, edge: 0 }, { col: 4,  row: 12, edge: 0 },
  { col: 5,  row: 12, edge: 1 }, { col: 6,  row: 12, edge: 5 },
  { col: 6,  row: 12, edge: 0 }, { col: 4,  row: 13, edge: 5 },
  { col: 2,  row: 14, edge: 1 }, { col: 2,  row: 14, edge: 0 },
  { col: 6,  row: 14, edge: 0 }, { col: 7,  row: 14, edge: 1 },
  { col: 8,  row: 14, edge: 1 }, { col: 8,  row: 14, edge: 2 },
  { col: 9,  row: 14, edge: 0 }, { col: 12, row: 14, edge: 1 },
  { col: 12, row: 14, edge: 0 }, { col: 13, row: 14, edge: 1 },
];

// ---------------------------------------------------------------------------
// 6. Map zones / dimensions
// ---------------------------------------------------------------------------
export const ZONE_ROWS = {
  northern: { rowMin: 0,  rowMax: 6  },
  central:  { rowMin: 7,  rowMax: 14 },
  southern: { rowMin: 15, rowMax: 21 },
} as const;

export const MAP_DIMENSIONS = { width: 15, height: 22 } as const;

// ---------------------------------------------------------------------------
// 7. CRT Style Palette
// ---------------------------------------------------------------------------
export const CRT_PALETTE = {
  bg:       '#070C07',
  fg:       '#33FF33',
  fgDim:    '#00AA00',
  warn:     '#FFAA00',
  danger:   '#FF3333',
  scanline: '#000000',
} as const;

export const CRT_COLORS = {
  NE: '#33FF33',
  D:  '#FFAA00',
  X:  '#FF3300',
} as const;

/** Phaser numeric (0x) form */
export const CRT = {
  GREEN:       0x33FF33,
  GREEN_DIM:   0x00AA00,
  GREEN_DARK:  0x0A2A0A,
  AMBER:       0xFFAA00,
  RED:         0xFF3300,
  BG:          0x070C07,
  BORDER:      0x1A3A1A,
  CRATER:      0x1F3A1F,
  RIDGE:       0xFFAA00,
} as const;

// ---------------------------------------------------------------------------
// 8. Dice Hold
// ---------------------------------------------------------------------------
export const WAVE_SPEEDS = {
  slow:   { multiplier: 0.8, frequencyHz: 1.6 },
  normal: { multiplier: 1.0, frequencyHz: 2.0 },
  fast:   { multiplier: 1.2, frequencyHz: 2.4 },
} as const;

export const DICE_BIAS_RANGE = 0.3;
