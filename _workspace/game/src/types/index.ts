// ============================================================================
// OGRE Web Game - Type Definitions
// Source of truth: _workspace/01_architecture/module-interfaces.md
// ============================================================================

// 1. Coordinates & Map -------------------------------------------------------
export interface HexCoord {
  col: number;
  row: number;
}

export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

export type TerrainType = 'plain' | 'crater' | 'ridge';

/** SE=0, S=1, SW=2, NW=3, N=4, NE=5 */
export type EdgeIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface Terrain {
  type: TerrainType;
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
  cells: HexCell[][];
}

// 2. OGRE --------------------------------------------------------------------
export type OgreWeaponType = 'main' | 'secondary' | 'missile' | 'ap';

export interface OgreWeapon {
  id: string;
  type: OgreWeaponType;
  atk: number;
  def: number;
  range: number;
  count: number;
  remaining: number;
  disabled: boolean;
}

export interface OgreStats {
  id: string;
  mark: 'III';
  treads: number;
  maxTreads: 45;
  movement: 0 | 1 | 2 | 3;
  weapons: OgreWeapon[];
  col: number;
  row: number;
  facing: EdgeIndex;
  neutralized: boolean;
}

export interface OgreMovementBand {
  treadMin: number;
  treadMax: number;
  movement: 0 | 1 | 2 | 3;
}

// 3. Defender Units ----------------------------------------------------------
export type DefenderUnitType = 'HVY' | 'MSL' | 'GEV' | 'HOW' | 'INF' | 'CP';

export type UnitState = 'ok' | 'disabled' | 'dead';

export interface DefenderUnit {
  id: string;
  type: DefenderUnitType;
  atk: number;
  def: number;
  move: number;
  range: number;
  col: number;
  row: number;
  state: UnitState;
  squads?: 1 | 2 | 3;
  secondaryMove?: number;
  indirect?: boolean;
}

// 4. Turn / Phase ------------------------------------------------------------
export type Side = 'ogre' | 'defender';

export type TurnPhase =
  | 'ogre-move'
  | 'ogre-attack'
  | 'ogre-ram'
  | 'defender-move'     // GEV도 여기서 이동
  | 'defender-attack'
  | 'gev-postmove'      // 공격 후 GEV 2차 이동 (gev-premove 제거)
  | 'game-over';

export interface TurnState {
  turn: number;
  side: Side;
  phase: TurnPhase;
  maxTurns?: number;
}

// 5. Combat & Dice Hold ------------------------------------------------------
export type CrtRatioKey = '1:3-' | '1:2' | '1:1' | '2:1' | '3:1' | '4:1+';

export type CrtResult = 'NE' | 'D' | 'X';

export type CrtRow = [CrtResult, CrtResult, CrtResult, CrtResult, CrtResult, CrtResult];

export type CombatResultType = CrtResult;

export interface CombatDeclaration {
  attackerIds: string[];
  targetId: string;
  totalAtk: number;
  totalDef: number;
  ridgeBonus: boolean;
  ratio: CrtRatioKey;
}

export interface CombatResult {
  declaration: CombatDeclaration;
  ratio: CrtRatioKey;
  roll: number;
  bias: number;
  finalRoll: number;
  result: CrtResult;
}

export type WaveSpeed = 'slow' | 'normal' | 'fast';

export interface DiceHoldConfig {
  speed: WaveSpeed;
  amplitude: number;
  frequencyHz: number;
}

export interface DiceHoldResult {
  holdTime: number;
  waveValue: number;
  bias: number;
  roll: number;
}

// 6. Game Mode & Scenario ----------------------------------------------------
export type GameMode = 'solo-ogre' | 'solo-defender' | 'versus';
export type AILevel = 'easy';

export interface DefenderBudget {
  /** alias: both names accepted */
  infantryPoints?: number;
  infPoints?: number;
  armorSlots: number;
}

export interface UnitSlotCost {
  type: DefenderUnitType;
  slots: number;
  infantryPoints?: number;
}

export interface ScenarioConfig {
  id: string;
  name?: string;
  description?: string;
  ogreStart?: HexCoord;
  cpAllowedZone?: { rowMin: number; rowMax: number; colMin?: number; colMax?: number };
  defenderPlacementZone?: { rowMin: number; rowMax: number };
  budget: DefenderBudget;
  maxTurns?: number;
  turnLimit?: number;
  aiDefaultPlacement?: { type: DefenderUnitType; col: number; row: number; squads?: 1 | 2 | 3 }[];
  victoryConditions?: { ogre: string; defender: string };
}

// 7. Game State --------------------------------------------------------------
export interface GameState {
  mode: GameMode;
  ai?: { level: AILevel; controls: Side };
  scenario: ScenarioConfig;
  ogre: OgreStats;
  defenders: DefenderUnit[];
  turn: TurnState;
  selection?: { unitId: string };
  pendingCombat?: CombatDeclaration;
  history: GameAction[];
}

export type GameAction =
  | { kind: 'move'; unitId: string; from: HexCoord; to: HexCoord }
  | { kind: 'attack'; combat: CombatResult }
  | { kind: 'ram'; from: HexCoord; targetId: string; result: CrtResult }
  | { kind: 'phase'; from: TurnPhase; to: TurnPhase }
  | { kind: 'place'; unitId: string; at: HexCoord };

// 8. UI / Layout -------------------------------------------------------------
export type DeviceLayout = 'desktop' | 'tablet' | 'mobile';

export interface LayoutBreakpoints {
  desktop: 1200;
  tablet: 768;
}

export interface PanelLayout {
  device: DeviceLayout;
  rotateOpposite: boolean;
  orientation: 'landscape' | 'portrait';
}

// 9. Events ------------------------------------------------------------------
export const EVENTS = {
  // From architecture spec (canonical)
  TURN_PHASE_CHANGED:  'turn:phase-changed',
  UNIT_SELECTED:       'unit:selected',
  UNIT_MOVED:          'unit:moved',
  UNIT_DESTROYED:      'unit:destroyed',
  UNIT_DISABLED:       'unit:disabled',
  OGRE_WEAPON_DAMAGED: 'ogre:weapon-damaged',
  OGRE_TREADS_CHANGED: 'ogre:treads-changed',
  COMBAT_DECLARED:     'combat:declared',
  COMBAT_RESOLVED:     'combat:resolved',
  DICE_WAVE_TICK:      'dice:wave-tick',
  DICE_HOLD:           'dice:hold',
  VICTORY:             'victory',

  // UI -> System
  UI_END_PHASE:        'ui:end-phase',
  UI_DECLARE_ATTACK:   'ui:declare-attack',
  UI_CONFIRM_ATTACK:   'ui:confirm-attack',
  UI_DICE_TAP:         'ui:dice-tap',
  UI_SELECT_UNIT:      'ui:select-unit',
  UI_MOVE_UNIT:        'ui:move-unit',
  UI_DECLARE_RAM:      'ui:declare-ram',
  UI_UNDO:             'ui:undo',
  UI_PAUSE:            'ui:pause',

  // Aliases used by gameplay-engineer spec
  PHASE_CHANGED:       'turn:phase-changed',
  COMBAT_START:        'combat:declared',
  DICE_ROLLED:         'combat:resolved',
  OGRE_DAMAGED:        'ogre:weapon-damaged',
  TREAD_CHANGED:       'ogre:treads-changed',
  GAME_OVER:           'victory',
  SETUP_DONE:          'setup-done',
  REQUEST_DICE_HOLD:   'dice:request',
  DICE_HOLD_RESULT:    'dice:hold',

  // Multi-weapon / multi-attacker staging
  OGRE_ATTACK_STAGED:     'ogre:attack-staged',
  DEFENDER_ATTACK_STAGED: 'defender:attack-staged',
  UI_ATTACK_NOW:          'ui:attack-now',
  UI_ADD_WEAPON:          'ui:add-weapon',
  UI_ADD_ATTACKER:        'ui:add-attacker',
  UI_END_MOVE:            'ui:end-move',
} as const;

export type EventKey = typeof EVENTS[keyof typeof EVENTS];

// 10. System Public API ------------------------------------------------------
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
  advance(): TurnPhase;
  canAct(unitId: string): boolean;
}

export interface IAIController {
  takeTurn(side: Side, state: GameState): Promise<GameAction[]>;
}

export interface IVictoryChecker {
  check(state: GameState): { winner: Side; reason: string } | null;
}
