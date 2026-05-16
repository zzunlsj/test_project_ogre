# Module Interfaces — OGRE Web Game

All TypeScript interfaces below are **authoritative**. Other agents (gameplay, level, UI, QA) MUST import these without redefining.

File location: `src/types/index.ts` (re-exports below).

## 1. Coordinates & Map

```typescript
/** Offset (col, row) hex coordinate. Flat-top, odd-q vertical layout. */
export interface HexCoord {
  col: number; // 0..14
  row: number; // 0..21
}

/** Cube coordinate for math (algorithms convert offset <-> cube internally). */
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

export type TerrainType = 'plain' | 'crater' | 'ridge';

/** Edge index on a flat-top hex.
 *  SE=0, S=1, SW=2, NW=3, N=4, NE=5
 */
export type EdgeIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface Terrain {
  type: TerrainType;
  /** Only present when type === 'ridge'. List of edges that ARE ridge. */
  ridgeEdges?: EdgeIndex[];
}

export type ZoneId = 'northern' | 'central' | 'southern';

export interface HexCell {
  coord: HexCoord;
  terrain: Terrain;
  zone: ZoneId;
}

export interface HexMap {
  width: 15;
  height: 22;
  cells: HexCell[][]; // [col][row]
}
```

## 2. OGRE

```typescript
export type OgreWeaponType = 'main' | 'secondary' | 'missile' | 'ap';

export interface OgreWeapon {
  id: string;            // e.g. "main-1", "ap-3"
  type: OgreWeaponType;
  atk: number;
  def: number;
  range: number;
  count: number;         // total batteries of this kind
  remaining: number;     // remaining undamaged on this instance
  disabled: boolean;     // this specific weapon battery destroyed
}

export interface OgreStats {
  id: string;            // "ogre-mk3"
  mark: 'III';
  treads: number;        // current 0..45
  maxTreads: 45;
  movement: 0 | 1 | 2 | 3;
  weapons: OgreWeapon[]; // 1 main, 2 secondary, 4 missile, 8 AP
  col: number;
  row: number;
  facing: EdgeIndex;     // direction OGRE faces (informational)
  neutralized: boolean;  // computed: all weapons disabled && treads <= 5
}

/** Tread damage table per Pocket Edition. */
export interface OgreMovementBand {
  treadMin: number;
  treadMax: number;
  movement: 0 | 1 | 2 | 3;
}
```

## 3. Defender Units

```typescript
export type DefenderUnitType = 'HVY' | 'MSL' | 'GEV' | 'HOW' | 'INF' | 'CP';

export type UnitState = 'ok' | 'disabled' | 'dead';

export interface DefenderUnit {
  id: string;
  type: DefenderUnitType;
  atk: number;
  def: number;
  move: number;          // primary movement
  range: number;
  col: number;
  row: number;
  state: UnitState;
  /** Only for INF: 1..3 squads stacked. */
  squads?: 1 | 2 | 3;
  /** Only for GEV: secondary post-combat move allowance. */
  secondaryMove?: number;
  /** Only for HOW: indirect-fire flag. */
  indirect?: boolean;
}
```

## 4. Turn / Phase Model

```typescript
export type Side = 'ogre' | 'defender';

export type TurnPhase =
  | 'ogre-move'
  | 'ogre-attack'
  | 'ogre-ram'
  | 'defender-move'
  | 'gev-premove'
  | 'defender-attack'
  | 'gev-postmove'
  | 'game-over';

export interface TurnState {
  turn: number;          // 1-based
  side: Side;
  phase: TurnPhase;
  maxTurns?: number;     // optional scenario turn limit
}
```

## 5. Combat & Dice Hold

```typescript
export type CrtRatioKey =
  | '1:3-' | '1:2' | '1:1' | '2:1' | '3:1' | '4:1+';

export type CrtResult = 'NE' | 'D' | 'X';

/** d6 -> result for one ratio row. Index 0 = die face 1. */
export type CrtRow = [CrtResult, CrtResult, CrtResult, CrtResult, CrtResult, CrtResult];

export interface CombatDeclaration {
  attackerIds: string[]; // can stack defender attacks
  targetId: string;      // OGRE weapon id OR defender unit id
  totalAtk: number;
  totalDef: number;
  ridgeBonus: boolean;   // shifts ratio one column in defender's favor
  ratio: CrtRatioKey;
}

export interface CombatResult {
  declaration: CombatDeclaration;
  ratio: CrtRatioKey;
  roll: number;          // 1..6 raw d6
  bias: number;          // -0.3..+0.3 from dice-hold
  finalRoll: number;     // clamped 1..6 after bias
  result: CrtResult;     // NE | D | X
}

export type WaveSpeed = 'slow' | 'normal' | 'fast'; // 0.8 | 1.0 | 1.2

export interface DiceHoldConfig {
  speed: WaveSpeed;
  amplitude: number;       // 0..1
  frequencyHz: number;     // base * speed multiplier
}

export interface DiceHoldResult {
  holdTime: number;        // ms since gauge start
  waveValue: number;       // -1..+1 sin value at lock
  bias: number;            // mapped -0.3..+0.3
  roll: number;            // raw d6 1..6
}
```

## 6. Game Mode & Scenario

```typescript
export type GameMode = 'solo-ogre' | 'solo-defender' | 'versus';

export type AILevel = 'easy';

export interface DefenderBudget {
  infantryPoints: number; // 20 (1 squad = 2 pts)
  armorSlots: number;     // 12 (HVY=3, MSL=2, GEV=2, HOW=2)
}

export interface UnitSlotCost {
  type: DefenderUnitType;
  slots: number;          // armor slots; INF excluded
  infantryPoints?: number;// only INF
}

export interface ScenarioConfig {
  id: 'mk3-standard';
  ogreMark: 'III';
  map: HexMap;
  ogreEntryRow: 0;        // R01 (0-index 0)
  cpAllowedRows: [7, 10]; // R08-R11 inclusive (0-index 7..10)
  defenderZones: ZoneId[];// ['southern', 'central']
  budget: DefenderBudget;
  turnLimit?: number;     // undefined = no limit
}
```

## 7. Game State (Top-Level)

```typescript
export interface GameState {
  mode: GameMode;
  ai?: { level: AILevel; controls: Side };
  scenario: ScenarioConfig;
  ogre: OgreStats;
  defenders: DefenderUnit[];
  turn: TurnState;
  selection?: { unitId: string };
  pendingCombat?: CombatDeclaration;
  history: GameAction[]; // undo stack
}

export type GameAction =
  | { kind: 'move'; unitId: string; from: HexCoord; to: HexCoord }
  | { kind: 'attack'; combat: CombatResult }
  | { kind: 'ram'; from: HexCoord; targetId: string; result: CrtResult }
  | { kind: 'phase'; from: TurnPhase; to: TurnPhase }
  | { kind: 'place'; unitId: string; at: HexCoord };
```

## 8. UI / Layout

```typescript
export type DeviceLayout = 'desktop' | 'tablet' | 'mobile';

export interface LayoutBreakpoints {
  desktop: 1200; // min-width px
  tablet: 768;
}

export interface PanelLayout {
  device: DeviceLayout;
  /** When true (2P versus), one panel is rotated 180deg via CSS transform. */
  rotateOpposite: boolean;
  orientation: 'landscape' | 'portrait';
}
```

## 9. EventEmitter Channel Keys

```typescript
export const EVENTS = {
  TURN_PHASE_CHANGED: 'turn:phase-changed',
  UNIT_SELECTED:      'unit:selected',
  UNIT_MOVED:         'unit:moved',
  UNIT_DESTROYED:     'unit:destroyed',
  UNIT_DISABLED:      'unit:disabled',
  OGRE_WEAPON_DAMAGED:'ogre:weapon-damaged',
  OGRE_TREADS_CHANGED:'ogre:treads-changed',
  COMBAT_DECLARED:    'combat:declared',
  COMBAT_RESOLVED:    'combat:resolved',
  DICE_WAVE_TICK:     'dice:wave-tick',
  DICE_HOLD:          'dice:hold',
  VICTORY:            'victory',

  UI_END_PHASE:       'ui:end-phase',
  UI_DECLARE_ATTACK:  'ui:declare-attack',
  UI_CONFIRM_ATTACK:  'ui:confirm-attack',
  UI_DICE_TAP:        'ui:dice-tap',
  UI_SELECT_UNIT:     'ui:select-unit',
  UI_MOVE_UNIT:       'ui:move-unit',
  UI_DECLARE_RAM:     'ui:declare-ram',
  UI_UNDO:            'ui:undo',
  UI_PAUSE:           'ui:pause',
} as const;

export type EventKey = typeof EVENTS[keyof typeof EVENTS];
```

## 10. System Public API (signatures only)

```typescript
export interface IHexGrid {
  inBounds(c: HexCoord): boolean;
  neighbors(c: HexCoord): HexCoord[];
  distance(a: HexCoord, b: HexCoord): number;
  lineOfSight(a: HexCoord, b: HexCoord, map: HexMap): boolean;
  ridgeBlocks(from: HexCoord, to: HexCoord, map: HexMap): boolean;
}

export interface IPathfinder {
  reachable(from: HexCoord, mp: number, map: HexMap, blockers: HexCoord[]): HexCoord[];
  path(from: HexCoord, to: HexCoord, map: HexMap, blockers: HexCoord[]): HexCoord[] | null;
}

export interface ICombatResolver {
  buildDeclaration(attackerIds: string[], targetId: string, state: GameState): CombatDeclaration;
  ratioFor(atk: number, def: number, ridgeBonus: boolean): CrtRatioKey;
  resolve(decl: CombatDeclaration, hold: DiceHoldResult): CombatResult;
}

export interface IDiceHold {
  start(speed: WaveSpeed): void;
  tick(dt: number): { value: number; color: '#33FF33' | '#FFAA00' | '#FF3333' };
  lock(): DiceHoldResult;
}

export interface ITurnController {
  state: TurnState;
  advance(): TurnPhase; // returns new phase
  canAct(unitId: string): boolean;
}

export interface IAIController {
  takeTurn(side: Side, state: GameState): Promise<GameAction[]>;
}

export interface IVictoryChecker {
  check(state: GameState): { winner: Side; reason: string } | null;
}
```
