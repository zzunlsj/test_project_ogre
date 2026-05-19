// ============================================================================
// GameScene - hex map rendering (preview/index.html parity) + game loop + input
// ============================================================================

import Phaser from 'phaser';
import { HexGrid } from '@/systems/HexGrid';
import { CombatSystem } from '@/systems/CombatSystem';
import { TurnManager } from '@/systems/TurnManager';
import { OgreController } from '@/systems/OgreController';
import { DefenderUnitsRegistry } from '@/systems/DefenderUnits';
import { AIController } from '@/systems/AIController';
import { VictoryChecker } from '@/systems/VictoryChecker';
import { CombatEffects } from '@/ui/CombatEffects';
import {
  CRATER_COORDS,
  RIDGE_EDGES,
  CRT,
  createOgreMk3,
} from '@/data/constants';
import { EVENTS } from '@/types';
import type {
  HexCoord,
  DefenderUnit,
  CombatDeclaration,
  CombatResult,
  DiceHoldResult,
  GameMode,
  Side,
} from '@/types';

const SQRT3 = Math.sqrt(3);

interface GameSceneData {
  mode?: GameMode;
  playerSide?: Side;
  defenderPlacements?: { type: string; col: number; row: number; squads?: 1 | 2 | 3 }[];
  ogrePlacement?: { col: number; row: number } | null;
}

type InteractionMode =
  | 'idle'
  | 'unit-selected'
  | 'targeting-attack'
  | 'awaiting-dice'
  | 'ai-thinking';

// SVG key map for unit tokens
const SVG_KEY: Record<string, string> = {
  HVY: 'heavy_tank',
  MSL: 'missile_tank',
  GEV: 'gev',
  HOW: 'howitzer',
  INF1: 'infantry_1',
  INF2: 'infantry_2',
  INF3: 'infantry_3',
  CP: 'cp',
  OGRE: 'ogre_mk3',
};

export class GameScene extends Phaser.Scene {
  // Systems
  private hexGrid!: HexGrid;
  private combat!: CombatSystem;
  private turnMgr!: TurnManager;
  private ogreCtrl!: OgreController;
  private defenders!: DefenderUnitsRegistry;
  private ai!: AIController;
  private victory!: VictoryChecker;
  private combatEffects!: CombatEffects;

  // Event bus (shared with UIScene)
  private bus!: Phaser.Events.EventEmitter;

  // Map data
  private craterSet = new Set<string>();
  private ridgeMap = new Map<string, Set<number>>();

  // Rendering layers
  private gMap!: Phaser.GameObjects.Graphics;
  private gHighlight!: Phaser.GameObjects.Graphics;
  private gRidges!: Phaser.GameObjects.Graphics;
  private gZones!: Phaser.GameObjects.Graphics;
  private gOverlay!: Phaser.GameObjects.Graphics;
  private gUnits!: Phaser.GameObjects.Container;
  private gOgre!: Phaser.GameObjects.Container;
  private mapTexts: Phaser.GameObjects.Text[] = [];
  private mapLabels: Phaser.GameObjects.Text[] = [];

  // Layout
  private R = 23;
  private OX = 100;
  private OY = 60;
  private panX = 0;
  private panY = 0;
  private userR: number | null = null;
  private minR  = 8;   // 맵 전체가 화면에 들어오는 최소 R (computeLayout에서 계산)

  // RAF guard
  private rafPending = false;

  // Reserved panel sizes (UIScene) — LayoutManager와 동기화
  private LEFT_PANEL = 270;   // 180 × 1.5
  private RIGHT_PANEL = 390;  // 260 × 1.5
  private BOTTOM_BAR = 56;
  private PAD = 8;

  // Camera/pan state
  private isPanning = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Interaction state
  private mode: InteractionMode = 'idle';
  private selectedUnitId: string | null = null;
  private moveRange: HexCoord[] = [];
  private attackRange: HexCoord[] = [];
  private hoverHex: HexCoord | null = null;
  private pendingCombat: CombatDeclaration | null = null;

  // Game config
  private gameMode: GameMode = 'solo-ogre';
  private playerSide: Side = 'ogre';

  // OGRE placement override from SetupScene (versus / solo-ogre)
  private _ogrePlacementOverride: { col: number; row: number } | null = null;

  // ── RAM 동거 상태 (D 결과 시 OGRE와 유닛이 같은 헥스에 겹침 표시) ──
  private ramColocatedUnitId: string | null = null;

  // ── OGRE turn state (multi-weapon staged attack) ──
  private weaponsFired = new Set<string>();      // weapon ids consumed this OGRE turn
  private ogreMoveUsed = 0;                      // hexes moved this turn (for END MOVE)
  private pendingTargetId: string | null = null; // current staged target
  private pendingWeaponIds: string[] = [];       // weapons staged on pendingTargetId

  // ── Defender turn state (multi-attacker staged attack) ──
  private defendersMoved = new Set<string>();          // moved this defender-move phase
  private defenderAttacked = new Set<string>();        // attacked this defender-attack phase
  private pendingDefenderAttackers: string[] = [];     // staged attackers vs OGRE
  private pendingDefenderTarget: string | null = null; // OGRE weapon id (or 'treads')

  constructor() {
    super({ key: 'game' });
  }

  init(data: GameSceneData): void {
    this.gameMode = data.mode ?? 'solo-ogre';
    this.playerSide = data.playerSide ?? 'ogre';
    this._ogrePlacementOverride = data.ogrePlacement ?? null;
  }

  create(data: GameSceneData): void {
    this.bus = this.game.events;

    // Init systems
    this.hexGrid = new HexGrid();
    this.combat = new CombatSystem();
    this.turnMgr = new TurnManager(this.bus);
    const ogreStats = createOgreMk3();
    if (this._ogrePlacementOverride) {
      ogreStats.col = this._ogrePlacementOverride.col;
      ogreStats.row = this._ogrePlacementOverride.row;
    }
    this.ogreCtrl = new OgreController(ogreStats);
    this.defenders = new DefenderUnitsRegistry();
    this.ai = new AIController(this.hexGrid, this.combat);
    this.victory = new VictoryChecker();

    this.craterSet = HexGrid.buildCraterSet(CRATER_COORDS);
    this.ridgeMap = HexGrid.buildRidgeMap(RIDGE_EDGES);

    if (data.defenderPlacements && data.defenderPlacements.length > 0) {
      for (const p of data.defenderPlacements) {
        this.defenders.addUnit(p.type as any, p.col, p.row, p.squads);
      }
    } else {
      const plan = this.ai.autoPlace({ infantryPoints: 20, armorSlots: 12 });
      for (const p of plan) {
        this.defenders.addUnit(p.type, p.col, p.row, p.squads);
      }
    }
    // SETUP_DONE는 UIScene이 시작된 후 emit해야 리스너가 받을 수 있음
    // → UIScene launch 이후 한 프레임 지연으로 처리

    this.computeLayout();

    // Graphics layers (z-order: map → ridges → zones → highlights → units → ogre → overlay)
    this.gMap = this.add.graphics().setDepth(10);
    this.gRidges = this.add.graphics().setDepth(20);
    this.gZones = this.add.graphics().setDepth(30);
    this.gHighlight = this.add.graphics().setDepth(40);
    this.gUnits = this.add.container(0, 0).setDepth(50);
    this.gOgre = this.add.container(0, 0).setDepth(60);
    this.gOverlay = this.add.graphics().setDepth(70);

    // Combat effects layer (depth 500)
    this.combatEffects = new CombatEffects(this);

    this.redrawAll();

    this.setupInput();

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui');
    }

    // UIScene이 create()를 완료할 시간을 주고 SETUP_DONE emit
    // 모든 플레이 모드(1P-OGRE, 1P-DEFENDER, 2P)에서 방어군 리스트를 표시
    this.time.delayedCall(100, () => {
      this.bus.emit(EVENTS.SETUP_DONE, { defenderUnits: this.defenders.getAll() });
    });

    this.bus.on(EVENTS.UI_END_PHASE, this.onEndPhase, this);
    this.bus.on(EVENTS.UI_END_MOVE, this.onEndPhase, this);
    this.bus.on(EVENTS.UI_DECLARE_RAM, this.onDeclareRam, this);
    this.bus.on(EVENTS.DICE_HOLD_RESULT, this.onDiceLocked, this);
    this.bus.on(EVENTS.UI_DECLARE_ATTACK, (payload: { weaponType?: string }) => {
      if (this.turnMgr.getPhase() !== 'ogre-attack') return;
      this.handleOgreAttackByWeaponType(payload.weaponType ?? 'all');
    });

    // Multi-weapon / multi-attacker staging
    this.bus.on(EVENTS.UI_ATTACK_NOW, this.onAttackNow, this);
    this.bus.on(EVENTS.UI_ADD_WEAPON, this.onAddWeapon, this);
    this.bus.on(EVENTS.UI_ADD_ATTACKER, this.onAddAttacker, this);

    // Track phase transitions to reset per-turn state
    this.bus.on(EVENTS.TURN_PHASE_CHANGED, this.onPhaseChanged, this);

    // UI roster click → scroll map to unit
    this.bus.on(EVENTS.UI_SELECT_UNIT, (payload: { unitId: string }) => {
      if (payload && payload.unitId) this.scrollToUnit(payload.unitId);
    }, this);

    const hasGev = this.defenders.getAliveGevs().length > 0;
    this.turnMgr.setHasGev(hasGev);

    this.bus.emit(EVENTS.TURN_PHASE_CHANGED, {
      turn: this.turnMgr.getTurn(),
      phase: this.turnMgr.getPhase(),
      side: this.turnMgr.getSide(),
      activePlayer: this.turnMgr.getSide(),
    });

    this.scale.on('resize', () => {
      this.computeLayout();
      this.scheduleDraw();
    });

    this.maybeRunAI();
  }

  update(_time: number, delta: number): void {
    if (this.combatEffects) this.combatEffects.update(delta);
    // RAM active: re-draw OGRE / target with offset each frame
    if (this.combatEffects && this.combatEffects.ramActive) {
      this.drawOgre();
      this.drawAllUnits();
    }
  }

  // -------------------------------------------------------------------------
  // Layout (preview/index.html parity)
  // -------------------------------------------------------------------------
  private computeLayout(): void {
    const containerW = this.scale.width;
    const containerH = this.scale.height;
    const pad = this.PAD;
    const usableW = Math.max(300, containerW - this.LEFT_PANEL - this.RIGHT_PANEL);

    const usableH = this.scale.height - this.BOTTOM_BAR;
    // 최소 R: 맵 전체가 화면에 들어오는 크기 (위/아래 여분 포함)
    const vMargin = 24;  // 상하 여분 px
    const minRw = (usableW - pad * 2) / ((this.hexGrid.cols - 1) * 1.5 + 2);
    const minRh = (usableH - vMargin * 2) / ((this.hexGrid.rows + 0.5) * SQRT3);
    this.minR = Math.max(6, Math.min(minRw, minRh));

    if (this.userR === null) {
      // 기본: 맵 전체가 화면에 들어오는 크기 (최소값 사용)
      this.R = this.minR;
    } else {
      this.R = this.userR;
    }
    this.OX = this.LEFT_PANEL
      + (usableW - ((this.hexGrid.cols - 1) * this.R * 1.5 + 2 * this.R)) / 2
      + this.R;
    this.OY = pad + this.R * SQRT3;

    this.clampPan();
  }

  private clampPan(): void {
    const pad = this.PAD;
    const fullH = (this.hexGrid.rows + 0.5) * this.R * SQRT3 + pad * 2;
    const fullW = (this.hexGrid.cols - 1) * this.R * 1.5 + 2 * this.R + pad * 2;
    const usableH = this.scale.height - this.BOTTOM_BAR;
    const usableW = this.scale.width - this.LEFT_PANEL - this.RIGHT_PANEL;

    // ── 세로 팬 ─────────────────────────────────────────────────────────────
    // 위: 첫 행 상단이 보이는 곳까지, 아래: 마지막 행 하단이 보이는 곳까지
    const maxPanY = Math.max(0, fullH - usableH);
    this.panY = Math.max(-maxPanY, Math.min(0, this.panY));

    // ── 가로 팬 ─────────────────────────────────────────────────────────────
    // 맵이 표시 영역보다 클 때만 이동 허용
    if (fullW > usableW) {
      const excess = (fullW - usableW) / 2 + pad;
      // 왼쪽: R## 레이블(~R*2.2 폭) + 여분까지 이동 가능
      // 오른쪽: 마지막 헥사 + 소량 여분(pad)까지 이동 가능
      const leftExtra  = Math.max(28, this.R * 2.2);  // R## 레이블 폭
      const rightExtra = pad * 2;
      this.panX = Math.max(-(excess + leftExtra), Math.min(excess + rightExtra, this.panX));
    } else {
      this.panX = 0;  // 맵이 영역에 들어오면 중앙 고정
    }
  }

  private scheduleDraw(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.redrawAll();
    });
  }

  private redrawAll(): void {
    this.drawMap();
    this.drawMapLabels();
    this.drawHighlights();
    this.drawAllUnits();
    this.drawOgre();
    this.drawOverlay();
  }

  // Helper that returns hex center already including pan offsets
  private hc(col: number, row: number): [number, number] {
    return this.hexGrid.hexCenter(col, row, this.R, this.OX + this.panX, this.OY + this.panY);
  }

  private isValidHex(col: number, row: number): boolean {
    if (!this.hexGrid.isValid(col, row)) return false;
    if (row < this.hexGrid.rows - 1) return true;
    return col % 2 === 1; // last row only odd cols
  }

  // -------------------------------------------------------------------------
  // Map rendering (preview parity)
  // -------------------------------------------------------------------------
  private drawMap(): void {
    const g = this.gMap;
    g.clear();
    this.gRidges.clear();
    this.gZones.clear();

    // Clear map texts
    for (const t of this.mapTexts) t.destroy();
    this.mapTexts = [];

    const sel = this.getSelectedCoord();

    for (let col = 0; col < this.hexGrid.cols; col++) {
      for (let row = 0; row < this.hexGrid.rows; row++) {
        if (!this.isValidHex(col, row)) continue;
        const [cx, cy] = this.hc(col, row);
        const key = `${col},${row}`;

        // Fill — zone color + state override
        let fillHex = 0x001200; // ~rgba(0,18,0,0.55)
        let fillAlpha = 0.55;
        if (row >= 7 && row < 15) { fillHex = 0x000A18; fillAlpha = 0.5; }
        if (row >= 15)            { fillHex = 0x100400; fillAlpha = 0.5; }

        const isMove = this.moveRange.some(h => h.col === col && h.row === row);
        const isAtk = this.attackRange.some(h => h.col === col && h.row === row);
        const isSel = sel && sel.col === col && sel.row === row;
        const isCrtr = this.craterSet.has(key);

        if (isMove)  { fillHex = 0x003200; fillAlpha = 0.6; }
        if (isAtk)   { fillHex = 0x321C00; fillAlpha = 0.6; }
        if (isSel)   { fillHex = 0x00410A; fillAlpha = 0.55; }
        if (isCrtr)  { fillHex = 0x120500; fillAlpha = 0.92; }

        const pts = this.hexGrid.hexPoints(cx, cy, this.R - 0.8);
        g.fillStyle(fillHex, fillAlpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 6; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fillPath();

        // Border
        g.lineStyle(0.9, 0x1E3A1E, 1);
        g.strokePoints(pts, true);

        if (isCrtr) this.drawCrater(g, cx, cy, this.R);

        // Move highlight outline
        if (isMove) {
          const pts2 = this.hexGrid.hexPoints(cx, cy, this.R - 1.5);
          g.lineStyle(1.3, 0x00C800, 0.55);
          g.strokePoints(pts2, true);
        }
        if (isAtk) {
          const pts2 = this.hexGrid.hexPoints(cx, cy, this.R - 1.5);
          g.lineStyle(1.3, 0xC86E00, 0.55);
          g.strokePoints(pts2, true);
        }

        // Coordinate labels (high zoom only)
        if (this.R > 22) {
          const t = this.add.text(cx, cy, `${col + 1}/${row + 1}`, {
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: `${Math.max(6, this.R * 0.22)}px`,
            color: '#145014',
          }).setOrigin(0.5, 0.5).setAlpha(0.55).setDepth(15);
          this.mapTexts.push(t);
        }
      }
    }

    // Ridges
    for (const [k, edges] of this.ridgeMap) {
      const [cs, rs] = k.split(',').map(Number);
      if (!this.isValidHex(cs, rs)) continue;
      const [cx, cy] = this.hc(cs, rs);
      for (const e of edges) {
        this.drawRidgeline(this.gRidges, cx, cy, this.R, e);
      }
    }

    // Zone divider lines + labels
    this.drawZoneOverlay();
  }

  private drawCrater(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    // Outer hex outline (amber) — retains preview parity
    const ptsOuter = this.hexGrid.hexPoints(x, y, r - 2);
    g.lineStyle(Math.max(1, r * 0.07), 0xFFAA00, 0.7);
    g.strokePoints(ptsOuter, true);

    // 1. Large amber translucent disc — fills most of the hex
    g.fillStyle(0xFFAA00, 0.15);
    g.fillCircle(x, y, r * 0.85);

    // 2. Medium amber disc — crater rim
    g.fillStyle(0xFFAA00, 0.22);
    g.fillCircle(x, y, r * 0.65);

    // 3. Dark center — crater floor
    g.fillStyle(0x1A0800, 0.60);
    g.fillCircle(x, y, r * 0.40);

    // 4. Outer amber ring
    g.lineStyle(Math.max(1.5, r * 0.09), 0xFFAA00, 0.85);
    g.strokeCircle(x, y, r * 0.82);

    // 5. Inner amber ring
    g.lineStyle(Math.max(1, r * 0.06), 0xFFAA00, 0.55);
    g.strokeCircle(x, y, r * 0.42);
  }

  private drawMapLabels(): void {
    // Tear down previous labels (called on every redraw → pan/zoom/resize safe)
    for (const t of this.mapLabels) t.destroy();
    this.mapLabels = [];

    const R = this.R;
    const OX = this.OX + this.panX;
    const OY = this.OY + this.panY;
    const fontSize = `${Math.max(7, R * 0.55)}px`;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Share Tech Mono", monospace',
      fontSize,
      color: '#007700',
    };

    // Column labels C01..C15 — above the map
    for (let col = 0; col < this.hexGrid.cols; col++) {
      const cx = OX + col * R * 1.5;
      const cy = OY - R * SQRT3 * 1.1;
      const t = this.add.text(cx, cy, `C${String(col + 1).padStart(2, '0')}`, style)
        .setOrigin(0.5, 1)
        .setAlpha(0.65)
        .setDepth(10);
      this.mapLabels.push(t);
    }

    // Row labels R01..R22 — left of the map
    const xLabel = OX - R * 1.4;
    for (let row = 0; row < this.hexGrid.rows; row++) {
      // Last row (R22) only exists at odd cols → use col=1 baseline (offset down by R*SQRT3/2)
      const isLastRow = row === this.hexGrid.rows - 1;
      const cy = isLastRow
        ? OY + row * R * SQRT3 - R * SQRT3 * 0.5
        : OY + row * R * SQRT3;
      const t = this.add.text(xLabel, cy, `R${String(row + 1).padStart(2, '0')}`, style)
        .setOrigin(1, 0.5)
        .setAlpha(0.65)
        .setDepth(10);
      this.mapLabels.push(t);
    }
  }

  private drawRidgeline(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, edgeIdx: number): void {
    const R88 = r * 0.88;
    const a1 = (Math.PI / 3) * edgeIdx;
    const a2 = (Math.PI / 3) * ((edgeIdx + 1) % 6);
    const v1x = R88 * Math.cos(a1), v1y = R88 * Math.sin(a1);
    const v2x = R88 * Math.cos(a2), v2y = R88 * Math.sin(a2);
    const dx = v2x - v1x, dy = v2y - v1y;
    const el = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / el, py = dx / el;
    const tickLen = r * 0.10;
    const lw = Math.max(1, r * 0.07);

    g.lineStyle(lw, 0x00CC00, 1);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const cx = x + v1x + dx * t;
      const cy = y + v1y + dy * t;
      g.lineBetween(cx - px * tickLen, cy - py * tickLen, cx + px * tickLen, cy + py * tickLen);
    }
  }

  private drawZoneOverlay(): void {
    const g = this.gZones;

    // Compute approx Y positions of dividers
    const [, y7] = this.hc(0, 7);
    const [, y8] = this.hc(0, 8);
    const [, y15] = this.hc(0, 15);
    const [, y16] = this.hc(0, 16);
    const divY1 = (y7 + y8) / 2;
    const divY2 = (y15 + y16) / 2;
    const xL = this.OX + this.panX - this.R * 0.5;
    const xR = this.OX + this.panX + (this.hexGrid.cols - 1) * this.R * 1.5 + this.R * 0.5;

    // Approximate dashed line
    g.lineStyle(1.5, 0x008C00, 0.45);
    [divY1, divY2].forEach(yy => {
      if (yy < 0 || yy > this.scale.height) return;
      const dashLen = 6, gapLen = 4;
      let x = xL;
      while (x < xR) {
        const x2 = Math.min(x + dashLen, xR);
        g.lineBetween(x, yy, x2, yy);
        x = x2 + gapLen;
      }
    });

    // Zone labels
    const mapCx = (xL + xR) / 2;
    const zFs = Math.max(10, this.R * 0.75);
    const [, yN] = this.hc(7, 3);
    const [, yC] = this.hc(7, 11);
    const [, yS] = this.hc(7, 18);
    this.mapTexts.push(
      this.add.text(mapCx, yN, 'NORTHERN', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${zFs}px`, color: '#33FF33',
      }).setOrigin(0.5, 0.5).setAlpha(0.30).setDepth(35),
    );
    this.mapTexts.push(
      this.add.text(mapCx, yC, 'CENTRAL', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${zFs}px`, color: '#33FF33',
      }).setOrigin(0.5, 0.5).setAlpha(0.30).setDepth(35),
    );
    this.mapTexts.push(
      this.add.text(mapCx, yS, 'SOUTHERN', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${zFs}px`, color: '#FF3300',
      }).setOrigin(0.5, 0.5).setAlpha(0.28).setDepth(35),
    );
  }

  private drawOverlay(): void {
    const g = this.gOverlay;
    g.clear();

    const w = this.scale.width;
    const h = this.scale.height;

    // Zoom indicator (bottom right)
    const zoomPct = Math.round((this.R / 23) * 100);
    const t = this.add.text(w - 8, h - this.BOTTOM_BAR - 8, `ZOOM ${zoomPct}%`, {
      fontFamily: '"Share Tech Mono", monospace',
      fontSize: '10px',
      color: '#00B400',
    }).setOrigin(1, 1).setAlpha(0.6).setDepth(75);
    this.mapTexts.push(t);

    const fullH = (this.hexGrid.rows + 0.5) * this.R * SQRT3;
    if (fullH > (h - this.BOTTOM_BAR) + 2) {
      const t2 = this.add.text(w - 8, h - this.BOTTOM_BAR - 22,
        '↕ DRAG TO PAN  ⊕ SCROLL TO ZOOM', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '9px',
        color: '#008C00',
      }).setOrigin(1, 1).setAlpha(0.45).setDepth(75);
      this.mapTexts.push(t2);
    }
  }

  private drawHighlights(): void {
    this.gHighlight.clear();
    if (this.hoverHex && this.isValidHex(this.hoverHex.col, this.hoverHex.row)) {
      const [cx, cy] = this.hc(this.hoverHex.col, this.hoverHex.row);
      const pts = this.hexGrid.hexPoints(cx, cy, this.R);
      this.gHighlight.lineStyle(1, CRT.GREEN_DIM, 0.8);
      this.gHighlight.strokePoints(pts, true);
    }
  }

  // -------------------------------------------------------------------------
  // Unit / OGRE token rendering (SVG-based, preview parity)
  // -------------------------------------------------------------------------
  private drawAllUnits(): void {
    this.gUnits.removeAll(true);
    for (const u of this.defenders.getAll()) {
      this.drawUnitToken(u);
    }
  }

  private drawUnitToken(u: DefenderUnit): void {
    if (u.state === 'dead') {
      // still draw as destroyed (faded with X)
    }
    const [cx0, cy0] = this.hc(u.col, u.row);

    // RAM 오프셋 처리
    let cx = cx0, cy = cy0;
    if (this.combatEffects && this.combatEffects.ramActive) {
      // 애니메이션 중: tgtOffset 적용
      const tx = this.combatEffects.ramTgtBase.x;
      const ty = this.combatEffects.ramTgtBase.y;
      if (Math.abs(cx0 - tx) < this.R && Math.abs(cy0 - ty) < this.R) {
        cx = cx0 + this.combatEffects.tgtOffset.x;
        cy = cy0 + this.combatEffects.tgtOffset.y;
      }
    } else if (this.ramColocatedUnitId === u.id) {
      // RAM 결과 D: OGRE와 동일 헥스에 유닛이 남아있음 → 우상단으로 오프셋해서 겹침 표현
      cx = cx0 + this.R * 0.45;
      cy = cy0 - this.R * 0.45;
    }

    const r = this.R;
    const tw = r * 1.25, th = r * 1.25;

    // Decide SVG key
    let svgKey = SVG_KEY[u.type] || '';
    if (u.type === 'INF') {
      const sq = u.squads ?? 1;
      svgKey = SVG_KEY[`INF${sq}`] || 'infantry_1';
    }

    // Color by state
    const color = u.state === 'disabled' ? CRT.AMBER
      : u.state === 'dead' ? 0x555555
      : u.type === 'CP' ? CRT.AMBER
      : CRT.GREEN;

    // Background
    const g = this.add.graphics();
    g.fillStyle(0x030803, 1);
    this.fillRoundedRect(g, cx - tw/2, cy - th/2, tw, th, r * 0.1);

    // Border (with glow approx via outer thin stroke)
    const bw = u.state === 'disabled' ? Math.max(2, r * 0.12) : Math.max(1.5, r * 0.09);
    g.lineStyle(bw, color, 1);
    this.strokeRoundedRect(g, cx - tw/2, cy - th/2, tw, th, r * 0.1);
    this.gUnits.add(g);

    // SVG image (CRT-colored texture)
    const crtKey = `${svgKey}_crt`;
    if (this.textures.exists(crtKey)) {
      const img = this.add.image(cx, cy, crtKey);
      const iw = tw * 0.92;
      img.setDisplaySize(iw, iw);
      img.setOrigin(0.5, 0.5);
      // Tint to match state color
      img.setTint(color);
      this.gUnits.add(img);
    } else {
      // Fallback text
      const txt = this.add.text(cx, cy, u.type, {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${Math.max(7, r * 0.38)}px`,
        color: '#' + color.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);
      this.gUnits.add(txt);
    }

    // INF squad badge (if SVG variant didn't include count)
    // (already represented in svgKey infantry_1/2/3)

    // DISABLED 'D' badge
    if (u.state === 'disabled') {
      const bx = cx + tw/2 - r * 0.46;
      const by = cy - th/2 - r * 0.04;
      const bg = this.add.graphics();
      bg.fillStyle(0x1A0800, 1);
      bg.fillRect(bx, by, r * 0.44, r * 0.32);
      bg.lineStyle(0.8, CRT.AMBER, 1);
      bg.strokeRect(bx, by, r * 0.44, r * 0.32);
      this.gUnits.add(bg);
      const dt = this.add.text(bx + r * 0.22, by + r * 0.16, 'D', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${Math.max(7, r * 0.26)}px`,
        color: '#FFAA00',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);
      this.gUnits.add(dt);
    }

    // DESTROYED X overlay
    if (u.state === 'dead') {
      const xg = this.add.graphics();
      xg.lineStyle(Math.max(3, r * 0.20), CRT.RED, 0.9);
      xg.lineBetween(cx - tw/2 + r * 0.14, cy - th/2 + r * 0.14, cx + tw/2 - r * 0.14, cy + th/2 - r * 0.14);
      xg.lineBetween(cx + tw/2 - r * 0.14, cy - th/2 + r * 0.14, cx - tw/2 + r * 0.14, cy + th/2 - r * 0.14);
      this.gUnits.add(xg);
    }
  }

  private drawOgre(): void {
    this.gOgre.removeAll(true);
    const o = this.ogreCtrl.getStats();
    const [cx0, cy0] = this.hc(o.col, o.row);

    // RAM 오프셋 처리
    let cx = cx0, cy = cy0;
    if (this.combatEffects && this.combatEffects.ramActive) {
      // 애니메이션 중: srcOffset 적용
      cx = cx0 + this.combatEffects.srcOffset.x;
      cy = cy0 + this.combatEffects.srcOffset.y;
    } else if (this.ramColocatedUnitId) {
      // RAM 결과 D: 유닛과 동일 헥스 → 좌하단으로 오프셋해서 겹침 표현
      cx = cx0 - this.R * 0.35;
      cy = cy0 + this.R * 0.35;
    }

    const r = this.R * 1.15; // OGRE bigger
    const tw = r * 1.20, th = r * 1.20;

    // OGRE glow halo
    const halo = this.add.graphics();
    for (let i = 5; i >= 0; i--) {
      const f = i / 5;
      halo.fillStyle(0x00FF00, 0.25 * (1 - f) * 0.6);
      halo.fillCircle(cx, cy, this.R * 1.8 * (0.3 + f * 0.7));
    }
    this.gOgre.add(halo);

    // Background
    const g = this.add.graphics();
    g.fillStyle(0x030803, 1);
    this.fillRoundedRect(g, cx - tw/2, cy - th/2, tw, th, r * 0.1);
    const color = o.neutralized ? CRT.RED : CRT.GREEN;
    g.lineStyle(Math.max(1.5, r * 0.09), color, 1);
    this.strokeRoundedRect(g, cx - tw/2, cy - th/2, tw, th, r * 0.1);
    this.gOgre.add(g);

    if (this.textures.exists('ogre_mk3_crt')) {
      const img = this.add.image(cx, cy, 'ogre_mk3_crt');
      const iw = tw * 0.92;
      img.setDisplaySize(iw, iw);
      img.setOrigin(0.5, 0.5);
      img.setTint(color);
      this.gOgre.add(img);
    } else {
      const txt = this.add.text(cx, cy, 'OGRE', {
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: `${Math.max(8, r * 0.38)}px`,
        color: '#33FF33',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5);
      this.gOgre.add(txt);
    }
  }

  // Rounded rect helpers
  private fillRoundedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number): void {
    g.fillRoundedRect(x, y, w, h, r);
  }
  private strokeRoundedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number): void {
    g.strokeRoundedRect(x, y, w, h, r);
  }

  // -------------------------------------------------------------------------
  // Input (preview parity: drag pan, wheel zoom)
  // -------------------------------------------------------------------------
  private setupInput(): void {
    // ── Disable browser context menu entirely on canvas ──
    this.game.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });

    // ── pointerdown: right → start pan; left → hex select ──
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown() || ptr.middleButtonDown()) {
        this.isPanning = true;
        this.lastDragX = ptr.x;
        this.lastDragY = ptr.y;
        return;
      }
      if (ptr.leftButtonDown()) {
        // Ignore panel zones
        const w = this.scale.width;
        if (ptr.x < this.LEFT_PANEL || ptr.x > w - this.RIGHT_PANEL) return;
        if (ptr.y > this.scale.height - this.BOTTOM_BAR) return;
        this.handleClick(ptr.worldX, ptr.worldY);
      }
    });

    // ── pointermove: hover update + right-button drag pan ──
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      // Right-button drag → pan
      if (this.isPanning && (ptr.rightButtonDown() || ptr.middleButtonDown())) {
        this.panX += ptr.x - this.lastDragX;
        this.panY += ptr.y - this.lastDragY;
        this.lastDragX = ptr.x;
        this.lastDragY = ptr.y;
        this.clampPan();
        this.scheduleDraw();
        return;
      }

      // Hover hex highlight
      const hex = this.hexGrid.pixelToHex(ptr.worldX, ptr.worldY, this.R, this.OX + this.panX, this.OY + this.panY);
      if (this.isValidHex(hex.col, hex.row)) {
        if (!this.hoverHex || this.hoverHex.col !== hex.col || this.hoverHex.row !== hex.row) {
          this.hoverHex = hex;
          this.drawHighlights();
        }
      } else if (this.hoverHex) {
        this.hoverHex = null;
        this.drawHighlights();
      }
    });

    this.input.on('pointerup', () => {
      this.isPanning = false;
    });
    this.input.on('pointerupoutside', () => {
      this.isPanning = false;
    });

    // ── wheel zoom (cursor-anchored) ──
    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _objs: any, _dx: number, dy: number) => {
      const factor = dy > 0 ? (1 / 1.15) : 1.15;
      const oldR = this.R;
      // 축소: minR (맵 전체가 화면에 들어오는 크기) 이하로 못 내려감
      // 확대: 최대 60px
      const newR = Math.max(this.minR, Math.min(60, oldR * factor));
      this.userR = newR;
      this.R = newR;
      this.OX = ptr.x - (ptr.x - this.OX) * (newR / oldR);
      this.OY = ptr.y - (ptr.y - this.OY) * (newR / oldR);
      this.clampPan();
      this.scheduleDraw();
    });
  }

  /** Center map on the hex containing a specific unit (OGRE or defender). */
  private scrollToUnit(unitId: string): void {
    const ogre = this.ogreCtrl.getStats();
    let targetCol = ogre.col;
    let targetRow = ogre.row;

    if (unitId !== 'ogre' && unitId !== ogre.id) {
      const u = this.defenders.getById(unitId);
      if (u) { targetCol = u.col; targetRow = u.row; }
      else return;
    }

    const [hx, hy] = this.hexGrid.hexCenter(
      targetCol, targetRow, this.R,
      this.OX + this.panX, this.OY + this.panY,
    );
    const mapCx = this.LEFT_PANEL + (this.scale.width - this.LEFT_PANEL - this.RIGHT_PANEL) / 2;
    const mapCy = (this.scale.height - this.BOTTOM_BAR) / 2;

    this.panX += mapCx - hx;
    this.panY += mapCy - hy;
    this.clampPan();

    // Update selection for visual feedback
    this.selectedUnitId = unitId === 'ogre' ? ogre.id : unitId;
    this.scheduleDraw();
  }

  private handleClick(wx: number, wy: number): void {
    const hex = this.hexGrid.pixelToHex(wx, wy, this.R, this.OX + this.panX, this.OY + this.panY);
    if (!this.isValidHex(hex.col, hex.row)) return;

    const phase = this.turnMgr.getPhase();
    if (phase === 'ogre-move' && this.canPlayerControl('ogre')) {
      this.handleOgreMoveClick(hex);
    } else if (phase === 'ogre-attack' && this.canPlayerControl('ogre')) {
      this.handleOgreAttackClick(hex);
    } else if ((phase === 'defender-move' || phase === 'gev-postmove')
              && this.canPlayerControl('defender')) {
      this.handleDefenderMoveClick(hex);
    } else if (phase === 'defender-attack' && this.canPlayerControl('defender')) {
      this.handleDefenderAttackClick(hex);
    }
  }

  private canPlayerControl(side: Side): boolean {
    if (this.gameMode === 'versus') return this.turnMgr.getSide() === side;
    if (this.gameMode === 'solo-ogre') return side === 'ogre';
    if (this.gameMode === 'solo-defender') return side === 'defender';
    return false;
  }

  // -------------------------------------------------------------------------
  // OGRE Phase Handlers (unchanged logic)
  // -------------------------------------------------------------------------
  private handleOgreMoveClick(hex: HexCoord): void {
    const o = this.ogreCtrl.getStats();
    const remaining = o.movement - this.ogreMoveUsed;
    if (remaining <= 0) return;

    if (this.selectedUnitId !== o.id) {
      if (hex.col === o.col && hex.row === o.row) {
        this.selectedUnitId = o.id;
        // OGRE: crater 진입 불가, 능선은 자유 통과
        this.moveRange = this.hexGrid.reachable(
          { col: o.col, row: o.row },
          remaining,
          this.craterSet,
          this.defenderBlockers(),
          new Set(),
          this.ridgeMap,
          true,
        );
        this.scheduleDraw();
      }
      return;
    }

    const inRange = this.moveRange.some(c => c.col === hex.col && c.row === hex.row);
    if (!inRange) {
      // Check if clicked hex is a defender within move range path → trigger RAM
      const unitAt = this.defenders.getAt(hex.col, hex.row);
      if (unitAt && unitAt.state !== 'dead') {
        // Determine if any neighbor of target is reachable (i.e. we can step into it via RAM)
        const adj = this.hexGrid.neighbors(hex);
        const reachableAdj = adj.find(a =>
          this.moveRange.some(m => m.col === a.col && m.row === a.row)
          || (a.col === o.col && a.row === o.row),
        );
        if (reachableAdj) {
          // Move to adjacent first (if not already adjacent)
          if (!(reachableAdj.col === o.col && reachableAdj.row === o.row)) {
            this.ogreCtrl.moveTo(reachableAdj.col, reachableAdj.row);
            this.bus.emit(EVENTS.UNIT_MOVED, {
              unitId: o.id, from: { col: o.col, row: o.row }, to: reachableAdj,
            });
            this.ogreMoveUsed += 1;
          }
          // Then perform RAM
          this.executeRamOnTarget(unitAt.id);
          return;
        }
      }
      return;
    }

    // Normal move: compute path length (1 cost per hex; crater 진입 불가)
    const path = this.hexGrid.path(
      { col: o.col, row: o.row }, hex, remaining,
      this.craterSet, this.defenderBlockers(),
      new Set(), this.ridgeMap, true,
    );
    const steps = path?.length ?? this.hexGrid.distance({ col: o.col, row: o.row }, hex);

    const from = { col: o.col, row: o.row };
    this.ogreCtrl.moveTo(hex.col, hex.row);
    this.ogreMoveUsed += steps;
    this.bus.emit(EVENTS.UNIT_MOVED, { unitId: o.id, from, to: hex });
    this.clearSelection();

    // Auto-end if movement exhausted
    if (this.ogreMoveUsed >= o.movement) {
      this.time.delayedCall(200, () => this.onEndPhase());
    } else {
      // Re-select OGRE so player can continue moving
      const o2 = this.ogreCtrl.getStats();
      this.selectedUnitId = o2.id;
      this.moveRange = this.hexGrid.reachable(
        { col: o2.col, row: o2.row },
        o.movement - this.ogreMoveUsed,
        this.craterSet,
        this.defenderBlockers(),
        new Set(),
        this.ridgeMap,
        true,
      );
    }
    this.scheduleDraw();
  }

  /** Trigger a RAM resolution onto a specific defender unit id.
   *
   *  설계 원칙: 게임 로직은 즉시 적용, 애니메이션은 독립(fire-and-forget).
   *  콜백 체인에 의존하지 않아 애니메이션 완료 여부와 무관하게 다음 시퀀스로 진행.
   */
  private executeRamOnTarget(targetId: string): void {
    if (!this.ogreCtrl.canRam()) return;
    const o = this.ogreCtrl.getStats();
    const target = this.defenders.getById(targetId);
    if (!target) return;

    // ── 1. 주사위 즉시 판정 ──────────────────────────────────────
    const ram = this.combat.resolveRam();

    // ── 2. 게임 상태 즉시 적용 ───────────────────────────────────
    if (ram.result === 'D') {
      this.defenders.setUnitState(target.id, 'disabled');
      this.bus.emit(EVENTS.UNIT_DISABLED, { unitId: target.id });
    } else {
      this.defenders.setUnitState(target.id, 'dead');
      this.bus.emit(EVENTS.UNIT_DESTROYED, { unitId: target.id });
    }
    // RAM 시 OGRE 궤도 3 손상
    this.ogreCtrl.damageTreads(3);
    this.bus.emit(EVENTS.OGRE_TREADS_CHANGED, {
      remaining: this.ogreCtrl.getStats().treads,
      moveAllowance: this.ogreCtrl.getStats().movement,
    });
    this.bus.emit(EVENTS.COMBAT_RESOLVED, {
      ramTarget: target.id, roll: ram.roll, result: ram.result,
    });

    // ── 3. RAM 결과에 따른 헥스 동거 처리 ───────────────────────
    // D(장애): 유닛이 동일 헥스에 남음 → ramColocated 플래그로 렌더링에서 겹침 표현
    // X(파괴): 유닛 제거이므로 별도 처리 불필요
    if (ram.result === 'D') {
      this.ramColocatedUnitId = target.id;   // OGRE와 같은 헥스에 겹쳐 표시
    } else {
      this.ramColocatedUnitId = null;
    }

    // ── 4. 애니메이션 독립 실행 (fire-and-forget) ────────────────
    const srcPx = this.hc(o.col, o.row);
    const tgtPx = this.hc(target.col, target.row);
    // 애니메이션 콜백 없이 실행 — 게임 진행은 아래 타이머가 담당
    this.combatEffects.fire(
      'ram',
      { x: srcPx[0], y: srcPx[1] },
      { x: tgtPx[0], y: tgtPx[1] },
      ram.result as 'NE' | 'D' | 'X',
    );

    // ── 5. 고정 딜레이 후 다음 시퀀스로 진행 ────────────────────
    // 애니메이션 총 시간: CHARGE(360) + GRIND(760) + RETURN(300) ≈ 1420ms
    // + 히트 이펙트: NE=600ms, D=1400ms, X=2000ms
    const effectDelay = ram.result === 'X' ? 2800 : ram.result === 'D' ? 2200 : 1700;
    this.mode = 'idle';
    this.clearSelection();
    this.scheduleDraw();
    this.checkVictory();
    this.time.delayedCall(effectDelay, () => {
      this.ramColocatedUnitId = null;  // 겹침 표시 해제
      this.onEndPhase();
    });
  }

  /** Defender-occupied hexes — block direct stop, used as blockers for movement BFS. */
  private defenderBlockers(): Set<string> {
    const s = new Set<string>();
    for (const u of this.defenders.getAlive()) {
      s.add(`${u.col},${u.row}`);
    }
    return s;
  }

  private handleOgreAttackClick(hex: HexCoord): void {
    const target = this.defenders.getAt(hex.col, hex.row);
    if (!target || target.state === 'dead') return;
    const o = this.ogreCtrl.getStats();
    const dist = this.hexGrid.distance({ col: o.col, row: o.row }, hex);

    // Eligible: not disabled, in range, NOT fired this turn
    const eligibleWeapons = o.weapons.filter(w =>
      !w.disabled && w.range >= dist && !this.weaponsFired.has(w.id),
    );
    if (eligibleWeapons.length === 0) return;

    // If clicking the same target as pending, treat as confirming current stage (no-op here).
    if (this.pendingTargetId && this.pendingTargetId !== target.id) {
      // Switching targets — clear pending stage
      this.pendingWeaponIds = [];
    }
    this.pendingTargetId = target.id;

    // If no weapons staged yet, add the strongest in-range available
    if (this.pendingWeaponIds.length === 0) {
      const w0 = eligibleWeapons.slice().sort((a, b) => b.atk - a.atk)[0];
      this.pendingWeaponIds.push(w0.id);
    }

    this.emitOgreAttackStaged();
  }

  /** UI 'ADD WEAPON': stage next-best unused in-range weapon on current target. */
  private onAddWeapon(): void {
    if (this.turnMgr.getPhase() !== 'ogre-attack') return;
    if (!this.pendingTargetId) return;
    const target = this.defenders.getById(this.pendingTargetId);
    if (!target) return;
    const o = this.ogreCtrl.getStats();
    const dist = this.hexGrid.distance({ col: o.col, row: o.row }, { col: target.col, row: target.row });
    const next = o.weapons.find(w =>
      !w.disabled && w.range >= dist
      && !this.weaponsFired.has(w.id)
      && !this.pendingWeaponIds.includes(w.id),
    );
    if (!next) return;
    this.pendingWeaponIds.push(next.id);
    this.emitOgreAttackStaged();
  }

  /** UI 'ATTACK NOW' — for OGRE side, resolve staged combat. */
  private onAttackNow(): void {
    const phase = this.turnMgr.getPhase();
    if (phase === 'ogre-attack') {
      this.fireAccumulatedAttack();
    } else if (phase === 'defender-attack') {
      this.fireDefenderAccumulatedAttack();
    }
  }

  private emitOgreAttackStaged(): void {
    if (!this.pendingTargetId) return;
    const target = this.defenders.getById(this.pendingTargetId);
    if (!target) return;
    const o = this.ogreCtrl.getStats();
    const stagedWeapons = o.weapons.filter(w => this.pendingWeaponIds.includes(w.id));
    const totalAtk = stagedWeapons.reduce((s, w) => s + w.atk, 0);
    this.bus.emit(EVENTS.OGRE_ATTACK_STAGED, {
      targetId: target.id,
      targetName: target.type,
      weapons: this.pendingWeaponIds.slice(),
      totalAtk,
      def: target.def,
    });
  }

  private fireAccumulatedAttack(): void {
    if (!this.pendingTargetId || this.pendingWeaponIds.length === 0) return;
    const target = this.defenders.getById(this.pendingTargetId);
    if (!target) return;
    const o = this.ogreCtrl.getStats();
    const stagedWeapons = o.weapons.filter(w => this.pendingWeaponIds.includes(w.id));
    const totalAtk = stagedWeapons.reduce((s, w) => s + w.atk, 0);
    const ridge = this.hexGrid.hasRidgeBonus(
      { col: o.col, row: o.row }, { col: target.col, row: target.row }, this.ridgeMap,
    );
    const decl = this.combat.buildDeclaration(
      this.pendingWeaponIds.slice(), target.id, totalAtk, target.def, ridge,
    );
    // Consume weapons immediately (so they can't be re-staged after dice)
    for (const wid of this.pendingWeaponIds) this.weaponsFired.add(wid);
    this.pendingTargetId = null;
    this.pendingWeaponIds = [];

    this.pendingCombat = decl;
    this.mode = 'awaiting-dice';
    this.bus.emit(EVENTS.COMBAT_DECLARED, decl);
  }

  private handleDefenderMoveClick(hex: HexCoord): void {
    const phase = this.turnMgr.getPhase();
    const isGevPhase = phase === 'gev-postmove';  // gev-premove 제거, POST만 유지
    const unitHere = this.defenders.getAt(hex.col, hex.row);

    if (this.selectedUnitId) {
      const inRange = this.moveRange.some(c => c.col === hex.col && c.row === hex.row);
      const sel = this.defenders.getById(this.selectedUnitId);
      // INF stacking: destination has same-side INF and combined squads ≤ 3
      const isInfStack = sel && sel.type === 'INF' && unitHere && unitHere.type === 'INF'
        && unitHere.id !== sel.id
        && ((sel.squads ?? 1) + (unitHere.squads ?? 1) <= 3);
      if (inRange && (!unitHere || isInfStack)) {
        const u = sel;
        if (u) {
          const from = { col: u.col, row: u.row };
          if (isInfStack && unitHere) {
            // Merge: increase target squads, remove source from registry
            unitHere.squads = ((unitHere.squads ?? 1) + (u.squads ?? 1)) as 1 | 2 | 3;
            this.defenders.removeUnit(u.id);
          } else {
            this.defenders.moveUnit(u.id, hex.col, hex.row);
          }
          this.defendersMoved.add(u.id);
          this.bus.emit(EVENTS.UNIT_MOVED, { unitId: u.id, from, to: hex });
        }
        this.clearSelection();
        this.maybeAutoEndDefenderMove();
        this.scheduleDraw();
        return;
      }
      this.clearSelection();
    }

    if (unitHere && unitHere.state === 'ok') {
      if (isGevPhase && unitHere.type !== 'GEV') return;
      if (unitHere.move <= 0) return;
      if (this.defendersMoved.has(unitHere.id) && !isGevPhase) return;  // already moved
      this.selectedUnitId = unitHere.id;
      const mp = isGevPhase
        ? (unitHere.secondaryMove ?? Math.floor(unitHere.move / 2))
        : unitHere.move;
      // Friendly units → pass-through (traverse but cannot stop)
      // INF destination of same hex would be allowed via direct stacking check separately.
      const friendlyHexes = new Set<string>();
      for (const u of this.defenders.getAlive()) {
        if (u.id === unitHere.id) continue;
        friendlyHexes.add(`${u.col},${u.row}`);
      }
      const ogreHex = new Set<string>();
      const o = this.ogreCtrl.getStats();
      ogreHex.add(`${o.col},${o.row}`);
      const unitCanCrossRidge = unitHere.type === 'INF';
      this.moveRange = this.hexGrid.reachable(
        { col: unitHere.col, row: unitHere.row },
        mp,
        this.craterSet,
        ogreHex,            // OGRE blocks
        friendlyHexes,      // friendlies are pass-through (cannot stop)
        this.ridgeMap,
        unitCanCrossRidge,
      );
      this.scheduleDraw();
    }
  }

  /** If all OK defenders have moved (or chosen to skip via END MOVE), auto-advance. */
  private maybeAutoEndDefenderMove(): void {
    const phase = this.turnMgr.getPhase();
    if (phase !== 'defender-move') return;
    const movable = this.defenders.getOK().filter(u =>
      u.type !== 'GEV' && u.move > 0 && !this.defendersMoved.has(u.id),
    );
    if (movable.length === 0) {
      this.time.delayedCall(200, () => this.onEndPhase());
    }
  }

  private handleDefenderAttackClick(hex: HexCoord): void {
    const o = this.ogreCtrl.getStats();
    if (hex.col !== o.col || hex.row !== o.row) {
      // Click an attacker candidate
      const u = this.defenders.getAt(hex.col, hex.row);
      if (u && u.state === 'ok' && u.atk > 0 && !this.defenderAttacked.has(u.id)) {
        const dist = this.hexGrid.distance({ col: u.col, row: u.row }, { col: o.col, row: o.row });
        if (dist > u.range) return;
        // Stage attacker
        if (!this.pendingDefenderAttackers.includes(u.id)) {
          this.pendingDefenderAttackers.push(u.id);
        }
        this.selectedUnitId = u.id;
        this.attackRange = [{ col: o.col, row: o.row }];
        this.emitDefenderAttackStaged();
        this.scheduleDraw();
      }
      return;
    }
    // Clicked OGRE hex → confirm staging (UI then chooses ATTACK NOW / ADD ATTACKER)
    if (this.pendingDefenderAttackers.length === 0) return;
    this.emitDefenderAttackStaged();
  }

  /** UI 'ADD ATTACKER' — keep current pending; do nothing here.
   *  The actual addition happens when the player clicks the next attacker.
   *  This handler exists for symmetry / re-emission. */
  private onAddAttacker(): void {
    if (this.turnMgr.getPhase() !== 'defender-attack') return;
    // Allow player to click another attacker; just re-emit the staged view.
    this.emitDefenderAttackStaged();
  }

  private emitDefenderAttackStaged(): void {
    const o = this.ogreCtrl.getStats();
    const attackers = this.pendingDefenderAttackers
      .map(id => this.defenders.getById(id))
      .filter((u): u is NonNullable<typeof u> => !!u);
    const totalAtk = attackers.reduce((s, u) => s + u.atk, 0);
    // Default target: weakest available weapon (or 'treads' as fallback string)
    const availableTargets = o.weapons.filter(w => !w.disabled);
    const possibleTargets = availableTargets.map(w => w.id);
    if (this.ogreCtrl.getStats().treads > 0) possibleTargets.push('treads');
    const defaultTgt = availableTargets.slice().sort((a, b) => a.def - b.def)[0];
    if (defaultTgt) this.pendingDefenderTarget = defaultTgt.id;
    const ogreDef = defaultTgt ? defaultTgt.def : 4;  // tread DEF approx
    this.bus.emit(EVENTS.DEFENDER_ATTACK_STAGED, {
      attackerIds: this.pendingDefenderAttackers.slice(),
      totalAtk,
      ogreDef,
      targetId: this.pendingDefenderTarget,
      possibleTargets,
    });
  }

  private fireDefenderAccumulatedAttack(): void {
    if (this.pendingDefenderAttackers.length === 0) return;
    const o = this.ogreCtrl.getStats();
    const attackers = this.pendingDefenderAttackers
      .map(id => this.defenders.getById(id))
      .filter((u): u is NonNullable<typeof u> => !!u);
    if (attackers.length === 0) return;

    // Resolve target — choose pending target or weakest weapon
    let targetWeapon = o.weapons.find(w => w.id === this.pendingDefenderTarget && !w.disabled);
    if (!targetWeapon) {
      targetWeapon = o.weapons.filter(w => !w.disabled).sort((a, b) => a.def - b.def)[0];
    }
    if (!targetWeapon) return;

    const totalAtk = attackers.reduce((s, u) => s + u.atk, 0);
    // Ridge bonus: if any attacker has ridge bonus, apply
    const ridge = attackers.some(u =>
      this.hexGrid.hasRidgeBonus(
        { col: u.col, row: u.row }, { col: o.col, row: o.row }, this.ridgeMap,
      ),
    );
    const decl = this.combat.buildDeclaration(
      attackers.map(u => u.id), targetWeapon.id, totalAtk, targetWeapon.def, ridge,
    );
    // Consume attackers
    for (const id of this.pendingDefenderAttackers) this.defenderAttacked.add(id);
    this.pendingDefenderAttackers = [];
    this.pendingDefenderTarget = null;

    this.pendingCombat = decl;
    this.mode = 'awaiting-dice';
    this.bus.emit(EVENTS.COMBAT_DECLARED, decl);
  }

  // -------------------------------------------------------------------------
  // Combat resolution (with effects)
  // -------------------------------------------------------------------------
  private onDiceLocked(hold: DiceHoldResult): void {
    if (!this.pendingCombat) return;
    const decl = this.pendingCombat;
    this.pendingCombat = null;
    const result = this.combat.resolve(decl, hold);

    // Play attack effect, then apply result
    this.playAttackEffect(decl, result, () => {
      this.applyCombatResult(result);
      this.bus.emit(EVENTS.COMBAT_RESOLVED, result);
      this.mode = 'idle';
      this.clearSelection();
      this.scheduleDraw();
      this.checkVictory();
      this.maybeAutoEndOgreAttack();
      this.maybeAutoEndDefenderAttack();
    });
  }

  private playAttackEffect(decl: CombatDeclaration, result: CombatResult, onDone: () => void): void {
    // Determine source pixel position
    const ogre = this.ogreCtrl.getStats();
    const targetIsOgreWeapon = ogre.weapons.some(w => w.id === decl.targetId);

    let srcPx: [number, number];
    let tgtPx: [number, number];
    let weaponType: 'missile' | 'gun' | 'infantry';

    if (targetIsOgreWeapon) {
      // Defender is attacker, target is OGRE
      const defenderUnit = this.defenders.getById(decl.attackerIds[0]);
      if (!defenderUnit) { onDone(); return; }
      srcPx = this.hc(defenderUnit.col, defenderUnit.row);
      tgtPx = this.hc(ogre.col, ogre.row);
      weaponType = defenderUnit.type === 'INF' ? 'infantry'
        : defenderUnit.type === 'MSL' ? 'missile'
        : 'gun';
    } else {
      // OGRE is attacker
      const target = this.defenders.getById(decl.targetId);
      if (!target) { onDone(); return; }
      srcPx = this.hc(ogre.col, ogre.row);
      tgtPx = this.hc(target.col, target.row);
      const firstWeaponId = decl.attackerIds[0] ?? '';
      weaponType = firstWeaponId.startsWith('missile') ? 'missile'
        : firstWeaponId.startsWith('ap') ? 'infantry'
        : 'gun';
    }

    this.combatEffects.fire(
      weaponType,
      { x: srcPx[0], y: srcPx[1] },
      { x: tgtPx[0], y: tgtPx[1] },
      result.result as 'NE' | 'D' | 'X',
      onDone,
    );
  }

  private applyCombatResult(r: CombatResult): void {
    const targetId = r.declaration.targetId;
    const isOgreWeapon = this.ogreCtrl.getStats().weapons.some(w => w.id === targetId);
    if (isOgreWeapon) {
      if (r.result === 'D') {
        this.ogreCtrl.damageWeapon(targetId);
        this.bus.emit(EVENTS.OGRE_WEAPON_DAMAGED, { weaponId: targetId, kind: 'D' });
      } else if (r.result === 'X') {
        this.ogreCtrl.destroyWeapon(targetId);
        this.bus.emit(EVENTS.OGRE_WEAPON_DAMAGED, { weaponId: targetId, kind: 'X' });
      }
    } else {
      const u = this.defenders.getById(targetId);
      if (!u) return;
      if (r.result === 'D') {
        this.defenders.setUnitState(targetId, 'disabled');
        this.bus.emit(EVENTS.UNIT_DISABLED, { unitId: targetId });
      } else if (r.result === 'X') {
        this.defenders.setUnitState(targetId, 'dead');
        this.bus.emit(EVENTS.UNIT_DESTROYED, { unitId: targetId });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase Control
  // -------------------------------------------------------------------------
  private onEndPhase(): void {
    if (this.mode === 'awaiting-dice') return;
    const before = this.turnMgr.getPhase();
    if (before === 'defender-attack') {
      this.defenders.refreshDisabled();
    }
    this.turnMgr.advance();
    this.clearSelection();
    this.scheduleDraw();
    this.checkVictory();
    this.maybeRunAI();
  }

  /** Per-phase state reset hooks. */
  private onPhaseChanged(payload: { from?: string; to?: string }): void {
    if (payload.to === 'ogre-move') {
      this.resetOgreTurn();
    }
    if (payload.to === 'defender-move') {
      this.resetDefenderTurn();
    }
  }

  private resetOgreTurn(): void {
    this.weaponsFired.clear();
    this.ogreMoveUsed = 0;
    this.pendingTargetId = null;
    this.pendingWeaponIds = [];
    this.ramColocatedUnitId = null;   // 새 턴 시작 시 겹침 표시 초기화
  }

  private resetDefenderTurn(): void {
    this.defendersMoved.clear();
    this.defenderAttacked.clear();
    this.pendingDefenderAttackers = [];
    this.pendingDefenderTarget = null;
  }

  /** Auto-end OGRE attack if no remaining usable weapons. */
  private maybeAutoEndOgreAttack(): void {
    if (this.turnMgr.getPhase() !== 'ogre-attack') return;
    const o = this.ogreCtrl.getStats();
    const remaining = o.weapons.some(w => !w.disabled && !this.weaponsFired.has(w.id));
    if (!remaining) {
      this.time.delayedCall(300, () => this.onEndPhase());
    }
  }

  /** Auto-end defender attack if no remaining attackers. */
  private maybeAutoEndDefenderAttack(): void {
    if (this.turnMgr.getPhase() !== 'defender-attack') return;
    const remaining = this.defenders.getOK().some(u =>
      u.atk > 0 && !this.defenderAttacked.has(u.id),
    );
    if (!remaining) {
      this.time.delayedCall(300, () => this.onEndPhase());
    }
  }

  private onDeclareRam(): void {
    if (this.turnMgr.getPhase() !== 'ogre-attack') return;
    if (!this.ogreCtrl.canRam()) return;
    this.turnMgr.declareRam();
    const o = this.ogreCtrl.getStats();
    const adj = this.hexGrid.neighbors({ col: o.col, row: o.row });
    let target: DefenderUnit | undefined;
    for (const c of adj) {
      const u = this.defenders.getAt(c.col, c.row);
      if (u && u.state !== 'dead') { target = u; break; }
    }
    if (!target) return;

    const ram = this.combat.resolveRam();

    // Play RAM animation, apply result on completion
    const srcPx = this.hc(o.col, o.row);
    const tgtPx = this.hc(target.col, target.row);
    this.combatEffects.fire(
      'ram',
      { x: srcPx[0], y: srcPx[1] },
      { x: tgtPx[0], y: tgtPx[1] },
      ram.result as 'NE' | 'D' | 'X',
      () => {
        if (ram.result === 'D') this.defenders.setUnitState(target!.id, 'disabled');
        else this.defenders.setUnitState(target!.id, 'dead');
        this.ogreCtrl.damageTreads(3);
        this.bus.emit(EVENTS.OGRE_TREADS_CHANGED, {
          remaining: this.ogreCtrl.getStats().treads,
          moveAllowance: this.ogreCtrl.getStats().movement,
        });
        this.bus.emit(EVENTS.COMBAT_RESOLVED, {
          ramTarget: target!.id,
          roll: ram.roll,
          result: ram.result,
        });
        this.scheduleDraw();
        this.checkVictory();
      },
    );
  }

  // -------------------------------------------------------------------------
  // AI (unchanged)
  // -------------------------------------------------------------------------
  private maybeRunAI(): void {
    const phase = this.turnMgr.getPhase();
    if (phase === 'game-over') return;
    const aiSide = this.gameMode === 'solo-ogre' ? 'defender'
                  : this.gameMode === 'solo-defender' ? 'ogre' : null;
    if (!aiSide) return;
    if (this.turnMgr.getSide() !== aiSide) return;
    this.time.delayedCall(500, () => this.runAIPhase());
  }

  private runAIPhase(): void {
    const phase = this.turnMgr.getPhase();
    const aiSide = this.gameMode === 'solo-ogre' ? 'defender' : 'ogre';

    if (aiSide === 'defender') {
      if (phase === 'defender-move' || phase === 'gev-postmove') {
        // defender-move: 전체 유닛(GEV 포함) 이동
        // gev-postmove: GEV만 2차 이동
        const units = phase === 'defender-move'
          ? this.defenders.getOK()
          : this.defenders.getAliveGevs();
        const plans = this.ai.planMoves(units, this.ogreCtrl.getStats(), this.craterSet, this.allBlockers(), this.ridgeMap);
        for (const [id, target] of plans) {
          const u = this.defenders.getById(id);
          if (!u) continue;
          this.defenders.moveUnit(id, target.col, target.row);
          this.bus.emit(EVENTS.UNIT_MOVED, { unitId: id, from: { col: u.col, row: u.row }, to: target });
        }
        this.scheduleDraw();
        this.time.delayedCall(400, () => this.onEndPhase());
        return;
      }
      if (phase === 'defender-attack') {
        const attacks = this.ai.planAttacks(this.defenders.getOK(), this.ogreCtrl.getStats());
        for (const atk of attacks) {
          const u = this.defenders.getById(atk.unitId);
          const o = this.ogreCtrl.getStats();
          const target = o.weapons.find(w => w.id === atk.targetWeaponId);
          if (!u || !target) continue;
          const ridge = this.hexGrid.hasRidgeBonus({ col: u.col, row: u.row }, { col: o.col, row: o.row }, this.ridgeMap);
          const decl = this.combat.buildDeclaration([u.id], target.id, u.atk, target.def, ridge);
          const result = this.combat.resolve(decl, null);
          this.applyCombatResult(result);
          this.bus.emit(EVENTS.COMBAT_RESOLVED, result);
        }
        this.scheduleDraw();
        this.time.delayedCall(400, () => this.onEndPhase());
        return;
      }
    }

    if (aiSide === 'ogre') {
      if (phase === 'ogre-move') {
        const o = this.ogreCtrl.getStats();
        const reach = this.hexGrid.reachable({ col: o.col, row: o.row }, o.movement, this.craterSet, this.allBlockers(), new Set(), this.ridgeMap, true);
        const cp = this.defenders.getCp();
        if (cp && reach.length > 0) {
          let best = reach[0];
          let bd = this.hexGrid.distance(best, { col: cp.col, row: cp.row });
          for (const c of reach) {
            const d = this.hexGrid.distance(c, { col: cp.col, row: cp.row });
            if (d < bd) { bd = d; best = c; }
          }
          this.ogreCtrl.moveTo(best.col, best.row);
          this.scheduleDraw();
        }
        this.time.delayedCall(400, () => this.onEndPhase());
        return;
      }
      if (phase === 'ogre-attack') {
        const o = this.ogreCtrl.getStats();
        const targets = this.defenders.getOK();
        for (const t of targets) {
          const dist = this.hexGrid.distance({ col: o.col, row: o.row }, { col: t.col, row: t.row });
          const eligible = o.weapons.filter(w => !w.disabled && w.range >= dist);
          if (eligible.length === 0) continue;
          const totalAtk = eligible.reduce((s, w) => s + w.atk, 0);
          const ridge = this.hexGrid.hasRidgeBonus({ col: o.col, row: o.row }, { col: t.col, row: t.row }, this.ridgeMap);
          const decl = this.combat.buildDeclaration(eligible.map(w => w.id), t.id, totalAtk, t.def, ridge);
          const result = this.combat.resolve(decl, null);
          this.applyCombatResult(result);
          this.bus.emit(EVENTS.COMBAT_RESOLVED, result);
          break;
        }
        this.scheduleDraw();
        this.time.delayedCall(400, () => this.onEndPhase());
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private clearSelection(): void {
    this.selectedUnitId = null;
    this.moveRange = [];
    this.attackRange = [];
  }

  private getSelectedCoord(): HexCoord | null {
    if (!this.selectedUnitId) return null;
    if (this.selectedUnitId === this.ogreCtrl.getStats().id) {
      const o = this.ogreCtrl.getStats();
      return { col: o.col, row: o.row };
    }
    const u = this.defenders.getById(this.selectedUnitId);
    return u ? { col: u.col, row: u.row } : null;
  }

  private allBlockers(except: string[] = []): Set<string> {
    const s = new Set<string>();
    for (const u of this.defenders.getAlive()) {
      if (except.includes(u.id)) continue;
      s.add(`${u.col},${u.row}`);
    }
    const o = this.ogreCtrl.getStats();
    if (!except.includes(o.id)) s.add(`${o.col},${o.row}`);
    return s;
  }

  private checkVictory(): void {
    const v = this.victory.check(
      this.ogreCtrl.getStats(),
      this.defenders.getAll(),
      this.turnMgr.getTurn(),
    );
    if (v.winner) {
      this.turnMgr.forceGameOver(v.winner);
      this.bus.emit(EVENTS.VICTORY, { winner: v.winner, reason: v.condition });
    }
  }

  private handleOgreAttackByWeaponType(weaponType: string): void {
    const ogre = this.ogreCtrl.getStats();
    const weapons = this.ogreCtrl.getAvailableWeapons()
      .filter(w => (weaponType === 'all' || w.type === weaponType) && !this.weaponsFired.has(w.id));
    if (weapons.length === 0) return;

    const maxRange = Math.max(...weapons.map(w => w.range));
    const inRange = this.hexGrid.inRange({ col: ogre.col, row: ogre.row }, maxRange);
    let target: DefenderUnit | undefined;
    let bestDist = Infinity;
    for (const hex of inRange) {
      const u = this.defenders.getAt(hex.col, hex.row);
      if (u && u.state !== 'dead') {
        const d = this.hexGrid.distance({ col: ogre.col, row: ogre.row }, { col: u.col, row: u.row });
        if (d < bestDist) { bestDist = d; target = u; }
      }
    }
    if (!target) return;

    const usable = weapons.filter(w =>
      this.hexGrid.distance({ col: ogre.col, row: ogre.row }, { col: target!.col, row: target!.row }) <= w.range,
    );
    if (usable.length === 0) return;

    const totalAtk = usable.reduce((s, w) => s + w.atk, 0);
    const ridgeBonus = this.hexGrid.hasRidgeBonus(
      { col: ogre.col, row: ogre.row },
      { col: target.col, row: target.row },
      this.ridgeMap,
    );
    const ratio = this.combat.ratioKey(totalAtk, target.def);
    const decl: CombatDeclaration = {
      attackerIds: usable.map(w => w.id),
      targetId: target.id,
      totalAtk,
      totalDef: target.def,
      ridgeBonus,
      ratio: ridgeBonus ? this.combat.applyRidgeBonus(ratio) : ratio,
    };
    // Mark these weapons as fired
    for (const w of usable) this.weaponsFired.add(w.id);

    this.pendingCombat = decl;
    this.mode = 'awaiting-dice';
    this.bus.emit(EVENTS.COMBAT_DECLARED, decl);
  }

  getState() {
    return {
      ogre: this.ogreCtrl.getStats(),
      defenders: this.defenders.getAll(),
      phase: this.turnMgr.getPhase(),
      turn: this.turnMgr.getTurn(),
      side: this.turnMgr.getSide(),
      pendingCombat: this.pendingCombat,
    };
  }
}
