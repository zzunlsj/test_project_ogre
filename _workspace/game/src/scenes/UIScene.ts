// ============================================================================
// UIScene — HUD overlay running parallel to GameScene
// ----------------------------------------------------------------------------
// Reproduces the preview/index.html layout in pure Phaser GameObjects:
//   ┌────────────┬───────────────────┬────────────┐
//   │ LEFT 180   │      MAP (1fr)    │ RIGHT 260  │   height = screen - 56
//   ├────────────┴───────────────────┴────────────┤
//   │              BOTTOM BAR  56px               │
//   └─────────────────────────────────────────────┘
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette } from '@/ui/CRTTheme';
import { LayoutManager, type UILayout } from '@/ui/LayoutManager';
import { DiceGauge } from '@/ui/DiceGauge';
import { CombatPopup } from '@/ui/CombatPopup';
import { OGRE_MOVEMENT_TABLE } from '@/data/constants';
import {
  EVENTS,
  type CombatResult,
  type DefenderUnit,
  type DefenderUnitType,
  type GameMode,
  type OgreWeaponType,
  type TurnPhase,
  type CrtRatioKey,
  type DiceHoldResult,
  type UnitState,
} from '@/types';

// ── Color palette additions (match index.html :root variables) ───────────────
const COL = {
  G:        '#33FF33',  // primary phosphor green
  G2:       '#00CC00',  // dim green
  G3:       '#00AA00',  // dim2
  G4:       '#007700',  // sub text
  AMBER:    '#FFAA00',
  RED:      '#FF3300',
  BG:       '#070C07',
  PANEL:    '#0C120C',
  BDR:      '#2A4A2A',
  BDR2:     '#1A2E1A',
  TRACK_BG: '#0D1A0D',
};

const HEX = {
  G:        0x33FF33,
  G2:       0x00CC00,
  G3:       0x00AA00,
  G4:       0x007700,
  AMBER:    0xFFAA00,
  RED:      0xFF3300,
  BG:       0x070C07,
  PANEL:    0x0C120C,
  BDR:      0x2A4A2A,
  BDR2:     0x1A2E1A,
  TRACK_BG: 0x0D1A0D,
  ROW_HOV:  0x0F1C0F,
  ROW_SEL:  0x112011,
};

interface WeaponDisplay {
  label: string;
  type: OgreWeaponType;
  total: number;
  remaining: number;
}

// SVG key map for unit token rendering (matches GameScene.SVG_KEY)
const UNIT_SVG_KEY: Record<string, string> = {
  HVY: 'heavy_tank',
  MSL: 'missile_tank',
  GEV: 'gev',
  HOW: 'howitzer',
  INF: 'infantry_1',
  INF1: 'infantry_1',
  INF2: 'infantry_2',
  INF3: 'infantry_3',
  CP:  'cp',
};

function unitSvgKey(u: DefenderUnit): string {
  if (u.type === 'INF') {
    const sq = u.squads ?? 1;
    return `infantry_${sq}`;
  }
  return UNIT_SVG_KEY[u.type] ?? 'heavy_tank';
}

interface FireBtnRef {
  type: OgreWeaponType;
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  x: number; y: number; w: number; h: number;
  fired: boolean;
}

interface ActionBtnRef {
  key: 'MOVE' | 'ATTACK' | 'END';
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  x: number; y: number; w: number; h: number;
  enabled: boolean;
  active: boolean;
}

interface UnitRowRef {
  unit: DefenderUnit;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  iconBox: Phaser.GameObjects.Graphics;
  iconText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  badgeBox: Phaser.GameObjects.Graphics;
  selected: boolean;
}

const PHASE_LABEL: Record<TurnPhase, string> = {
  'ogre-move':       'OGRE MOVE',
  'ogre-attack':     'OGRE ATTACK',
  'ogre-ram':        'OGRE RAM',
  'defender-move':   'DEFENDER MOVE',  // GEV도 여기서 이동
  'defender-attack': 'DEFENDER ATTACK',
  'gev-postmove':    'GEV POST-MOVE',  // 공격 후 GEV 2차 이동
  'game-over':       'GAME OVER',
};

// Short token shown inside .uico icon box — the index.html samples use SVG
// images, but in pure Phaser we fall back to a 3-letter code which still
// reads clearly inside the 32×32 outlined square.
const UNIT_ICON_TOKEN: Record<DefenderUnitType, string> = {
  HVY: 'HVY',
  MSL: 'MSL',
  GEV: 'GEV',
  HOW: 'HOW',
  INF: 'INF',
  CP:  'CP',
};

export class UIScene extends Phaser.Scene {
  private layout!: UILayout;

  private leftPanel!: Phaser.GameObjects.Container;
  private rightPanel!: Phaser.GameObjects.Container;
  private bottomBar!: Phaser.GameObjects.Container;

  // ── Live OGRE state ────────────────────────────────────────────────────────
  private weapons: WeaponDisplay[] = [
    { label: 'MAIN',      type: 'main',      total: 1, remaining: 1 },
    { label: 'SECONDARY', type: 'secondary', total: 2, remaining: 2 },
    { label: 'AP GUNS',   type: 'ap',        total: 8, remaining: 8 },
    { label: 'MISSILE',   type: 'missile',   total: 4, remaining: 4 },
  ];

  private currentTreads = 28;
  private maxTreads = 45;
  private currentTurn = 1;
  private currentPhase: TurnPhase = 'ogre-move';
  private ogreCol = 7;
  private ogreRow = 19;
  private ogreFacingLabel = 'NORTH ↑';
  private cpDestroyed = false;
  private logEntries: { side: 'OGRE' | 'DEF' | 'SYS'; turn: number; text: string; tag: 'X' | 'D' | 'H' }[] = [];

  // ── Defender unit list state (left panel) ──────────────────────────────────
  private unitList: DefenderUnit[] = [];
  private unitRows: UnitRowRef[] = [];
  private selectedUnitId: string | null = null;

  // ── Pip refs (weapon damage live updates) ─────────────────────────────────
  private weaponPips: Phaser.GameObjects.Graphics[] = [];

  // ── Selected unit detail panel (bottom of left panel) ──────────────────────
  private selectedInfoContainer?: Phaser.GameObjects.Container;
  private selectedUnitData: DefenderUnit | null = null;
  private selectedIsOgre = false;

  // ── Right panel refs ───────────────────────────────────────────────────────
  private treadBarG?: Phaser.GameObjects.Graphics;
  private treadBarRect = { x: 0, y: 0, w: 0, h: 12 };
  private treadValueText?: Phaser.GameObjects.Text;
  private movementText?: Phaser.GameObjects.Text;
  private positionText?: Phaser.GameObjects.Text;
  private cpStatusText?: Phaser.GameObjects.Text;
  private cpStatusBox?: Phaser.GameObjects.Graphics;
  private cpStatusBoxRect = { x: 0, y: 0, w: 0, h: 0 };
  private cpBlinkTween?: Phaser.Tweens.Tween;
  private combatLogTexts: Phaser.GameObjects.Text[] = [];
  private fireButtons: FireBtnRef[] = [];

  // ── Bottom bar refs ────────────────────────────────────────────────────────
  private turnNumText?: Phaser.GameObjects.Text;
  private phaseNameText?: Phaser.GameObjects.Text;
  private sideBadgeText?: Phaser.GameObjects.Text;
  private sideBadgeBg?: Phaser.GameObjects.Graphics;
  private sideBadgeRect = { x: 0, y: 0, w: 0, h: 0 };
  private hintTextLine1?: Phaser.GameObjects.Text;
  private hintTextLine2?: Phaser.GameObjects.Text;
  private actionButtons: ActionBtnRef[] = [];

  // Components
  private diceGauge!: DiceGauge;
  private combatPopup!: CombatPopup;

  // Attack staging prompt (OGRE multi-weapon / Defender multi-attacker)
  private attackPrompt?: Phaser.GameObjects.Container;

  constructor() { super({ key: 'ui' }); }

  // --------------------------------------------------------------------------
  create(): void {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.layout = LayoutManager.getPanels(this.scale.width, this.scale.height);

    addVignette(this);
    addScanlines(this, 0.08);

    this.buildLeftPanel();
    this.buildRightPanel();
    this.buildBottomBar();

    // 2P versus: rotate the opposite-facing panel
    const mode = this.registry.get('gameMode') as GameMode | null;
    if (mode === 'versus' && this.layout.device !== 'mobile') {
      const r = this.layout.leftPanel;
      this.leftPanel.setAngle(180);
      this.leftPanel.setPosition(r.x + r.w, r.y + r.h);
    }

    this.diceGauge = new DiceGauge(this);
    this.combatPopup = new CombatPopup(this);

    this.bindEvents();
    this.scale.on('resize', () => this.relayout());

    // initial UI sync
    this.refreshActionButtons();
    this.refreshHint();
  }

  update(time: number, delta: number): void {
    this.diceGauge.tick(time, delta);
  }

  // ==========================================================================
  // PANEL BACKGROUND  (matches .panel CSS — bg + border + inset glow)
  // ==========================================================================
  private drawPanelBg(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(HEX.PANEL, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, HEX.BDR, 1);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // crude inset glow (3 fading inner strokes)
    g.lineStyle(1, HEX.BDR2, 0.6);
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    g.lineStyle(1, 0x0A1A0A, 0.4);
    g.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  }

  private drawHRule(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, color = HEX.BDR): void {
    g.lineStyle(1, color, 1);
    g.lineBetween(x, y, x + w, y);
  }

  // ==========================================================================
  // LEFT PANEL  (180px) — DEFENDER UNITS LIST
  // ==========================================================================
  private buildLeftPanel(): void {
    const r = this.layout.leftPanel;
    this.leftPanel = this.add.container(0, 0);
    if (r.w === 0) return;

    const bg = this.add.graphics();
    this.drawPanelBg(bg, r.x, r.y, r.w, r.h);
    this.leftPanel.add(bg);

    // ─── Header: "DEFENDER UNITS" ────────────────────────────────────────────
    const hdrY = r.y + 6;
    const hdr = this.add
      .text(r.x + 10, hdrY, 'DEFENDER UNITS', textStyle(10, COL.G3))
      .setOrigin(0, 0);
    hdr.setLetterSpacing(3);
    this.leftPanel.add(hdr);

    const mode = this.registry.get('gameMode') as GameMode | null;
    const modeStr = mode === 'versus' ? '· 2P MODE' : mode === 'solo-ogre' ? '· VS OGRE' : '· DEFENDER';
    const modeTxt = this.add
      .text(r.x + r.w - 8, hdrY, modeStr, textStyle(8, COL.G4))
      .setOrigin(1, 0);
    this.leftPanel.add(modeTxt);

    // header underline
    const hdrLine = this.add.graphics();
    this.drawHRule(hdrLine, r.x, r.y + 22, r.w, HEX.BDR);
    this.leftPanel.add(hdrLine);

    // unit rows container — drawn dynamically by initUnitList()
    const yc = r.y + 26;
    (this as any)._unitListAnchor = { x: r.x + 4, y: yc, w: r.w - 8, h: r.y + r.h - yc - 6 };

    // Mark weapon pips moved to right panel
    this.weaponPips = [];

    // Render any existing units (e.g. after relayout)
    if (this.unitList.length > 0) this.renderUnitRows();
  }

  private drawWeaponPips(g: Phaser.GameObjects.Graphics, x: number, y: number, w: WeaponDisplay): void {
    g.clear();
    const pipR = 4.5;
    const gap = 2;
    for (let i = 0; i < w.total; i++) {
      const cx = x + pipR + i * (pipR * 2 + gap);
      const cy = y + pipR;
      if (i < w.remaining) {
        // alive pip — green with glow approximation (double draw)
        g.fillStyle(HEX.G, 1);
        g.fillCircle(cx, cy, pipR);
        g.lineStyle(1, HEX.G2, 0.6);
        g.strokeCircle(cx, cy, pipR + 1.5);
      } else {
        // destroyed pip — empty circle with grey border
        g.lineStyle(1, HEX.BDR, 1);
        g.strokeCircle(cx, cy, pipR);
      }
    }
  }

  // ==========================================================================
  // UNIT ROW RENDERING (.urow)
  // ==========================================================================
  private renderUnitRows(): void {
    // wipe previous rows
    this.unitRows.forEach(r => r.container.destroy());
    this.unitRows = [];

    const anchor = (this as any)._unitListAnchor as { x: number; y: number; w: number; h: number } | undefined;
    if (!anchor) return;

    const rowH = 44;
    let y = anchor.y;
    this.unitList.forEach(u => {
      const row = this.buildUnitRow(u, anchor.x, y, anchor.w, rowH);
      this.leftPanel.add(row.container);
      this.unitRows.push(row);
      y += rowH;
    });
  }

  private buildUnitRow(u: DefenderUnit, x: number, y: number, w: number, h: number): UnitRowRef {
    const c = this.add.container(0, 0);

    const bg = this.add.graphics();
    c.add(bg);
    // bottom divider line
    bg.lineStyle(1, HEX.BDR2, 1);
    bg.lineBetween(x + 4, y + h - 1, x + w - 4, y + h - 1);

    // icon box (32×32) — left, vertically centered
    const ix = x + 6;
    const iy = y + (h - 32) / 2;
    const iconBox = this.add.graphics();
    this.drawIconBox(iconBox, ix, iy, 32, 32, u.state);
    c.add(iconBox);

    // SVG icon (if available) or 3-letter fallback
    const svgK = `${unitSvgKey(u)}_crt`;
    const stateColor = u.state === 'dead' ? '#555555' : u.state === 'disabled' ? COL.AMBER : COL.G;
    const stateTint  = u.state === 'dead' ? 0x555555 : u.state === 'disabled' ? HEX.AMBER : HEX.G;
    let iconText: Phaser.GameObjects.Text;
    if (this.textures.exists(svgK)) {
      const img = this.add.image(ix + 16, iy + 16, svgK).setDisplaySize(28, 28);
      img.setTint(stateTint);
      if (u.state === 'dead') img.setAlpha(0.4);
      c.add(img);
      // off-screen text holder for type tracking (kept for ref type compatibility)
      iconText = this.add.text(-9999, -9999, '', textStyle(1, stateColor));
      c.add(iconText);
    } else {
      const tok = UNIT_ICON_TOKEN[u.type] ?? '???';
      iconText = this.add
        .text(ix + 16, iy + 16, tok, textStyle(9, stateColor))
        .setOrigin(0.5);
      if (u.state !== 'dead') applyGlow(iconText, stateColor, 4);
      c.add(iconText);
    }

    // info text block
    const tx = ix + 38;
    const nameColor = u.state === 'dead' ? '#666666' : COL.G;
    const nameLine = this.makeUnitLabel(u);
    const nameText = this.add
      .text(tx, y + 4, nameLine, textStyle(10, nameColor))
      .setOrigin(0, 0);
    nameText.setLetterSpacing(1);
    if (u.state === 'dead') nameText.setAlpha(0.45);
    c.add(nameText);

    const stat1 = this.add
      .text(tx, y + 18, this.makeUnitStatLine(u), textStyle(9, COL.G4))
      .setOrigin(0, 0);
    c.add(stat1);

    const stat2 = this.add
      .text(tx, y + 30, `POS ${String(u.col + 1).padStart(2, '0')},${String(u.row + 1).padStart(2, '0')}`, textStyle(9, COL.G4))
      .setOrigin(0, 0);
    c.add(stat2);

    // badge (right side, vertically centered)
    const badgeText = u.state === 'dead' ? 'DEAD' : u.state === 'disabled' ? 'DIS' : 'OK';
    const badgeColor = u.state === 'dead' ? COL.RED : u.state === 'disabled' ? COL.AMBER : COL.G3;
    const badgeHex   = u.state === 'dead' ? HEX.RED : u.state === 'disabled' ? HEX.AMBER : HEX.G4;
    const badgeBox = this.add.graphics();
    const badge = this.add
      .text(0, 0, badgeText, textStyle(8, badgeColor))
      .setOrigin(0.5, 0.5);
    badge.setLetterSpacing(1);
    const bw = badge.width + 8;
    const bh = badge.height + 4;
    const bx = x + w - bw - 6;
    const by = y + 6;
    badge.setPosition(bx + bw / 2, by + bh / 2);
    badgeBox.lineStyle(1, badgeHex, 1);
    badgeBox.strokeRect(bx, by, bw, bh);
    c.add(badgeBox);
    c.add(badge);

    // hit area
    const hit = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    c.add(hit);

    const ref: UnitRowRef = { unit: u, container: c, bg, iconBox, iconText, nameText, badge, badgeBox, selected: false };

    const drawRowBg = (mode: 'idle' | 'hover' | 'selected') => {
      bg.clear();
      if (mode === 'selected') {
        bg.fillStyle(HEX.ROW_SEL, 1);
        bg.fillRect(x, y, w, h);
        bg.fillStyle(HEX.G2, 1);
        bg.fillRect(x, y, 2, h);
      } else if (mode === 'hover') {
        bg.fillStyle(HEX.ROW_HOV, 1);
        bg.fillRect(x, y, w, h);
      }
      bg.lineStyle(1, HEX.BDR2, 1);
      bg.lineBetween(x + 4, y + h - 1, x + w - 4, y + h - 1);
    };
    drawRowBg('idle');
    (ref as any)._drawBg = drawRowBg;

    hit.on('pointerover', () => { if (!ref.selected) drawRowBg('hover'); });
    hit.on('pointerout',  () => { if (!ref.selected) drawRowBg('idle'); });
    hit.on('pointerdown', () => {
      this.selectUnit(u.id);
      this.game.events.emit(EVENTS.UI_SELECT_UNIT, { unitId: u.id });
    });

    return ref;
  }

  private drawIconBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, state: UnitState): void {
    g.clear();
    const bdr = state === 'dead' ? 0x333333 : state === 'disabled' ? HEX.AMBER : HEX.G3;
    g.lineStyle(1, bdr, state === 'dead' ? 0.4 : 1);
    g.strokeRect(x, y, w, h);
    // glow approximation: outer faint stroke
    if (state !== 'dead') {
      g.lineStyle(1, bdr, 0.3);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }

  private makeUnitLabel(u: DefenderUnit): string {
    const base = u.type === 'INF' ? `INFANTRY ×${u.squads ?? 1}` :
                 u.type === 'HVY' ? 'HEAVY TANK' :
                 u.type === 'MSL' ? 'MISSILE TANK' :
                 u.type === 'GEV' ? 'GEV' :
                 u.type === 'HOW' ? 'HOWITZER' :
                 u.type === 'CP'  ? 'COMMAND POST' : u.type;
    return base;
  }

  private makeUnitStatLine(u: DefenderUnit): string {
    if (u.type === 'CP') return `DEF ${u.def} · MOV 0`;
    const moveLabel = u.secondaryMove ? `${u.move}+${u.secondaryMove}` : `${u.move}`;
    return `ATK ${u.atk}/${u.range} · DEF ${u.def} · MOV ${moveLabel}`;
  }

  private selectUnit(unitId: string): void {
    this.selectedUnitId = unitId;
    this.unitRows.forEach(r => {
      const sel = r.unit.id === unitId;
      r.selected = sel;
      const drawBg = (r as any)._drawBg as ((mode: 'idle' | 'hover' | 'selected') => void) | undefined;
      drawBg?.(sel ? 'selected' : 'idle');
    });
  }

  // ==========================================================================
  // RIGHT PANEL  (260px) — OGRE STATUS (portrait + weapons + tread + fire + victory + log)
  // ==========================================================================
  private buildRightPanel(): void {
    const r = this.layout.rightPanel;
    this.rightPanel = this.add.container(0, 0);
    if (r.w === 0) return;

    const bg = this.add.graphics();
    this.drawPanelBg(bg, r.x, r.y, r.w, r.h);
    this.rightPanel.add(bg);

    // ── Header: "OGRE MK.III · CPU" + portrait icon right ───────────────────
    const hdrY = r.y + 6;
    const hdr = this.add
      .text(r.x + 8, hdrY, 'OGRE MK.III · CPU', textStyle(10, COL.G3))
      .setOrigin(0, 0);
    hdr.setLetterSpacing(3);
    this.rightPanel.add(hdr);

    if (this.textures.exists('ogre_mk3_crt')) {
      const portrait = this.add.image(r.x + r.w - 6, hdrY + 6, 'ogre_mk3_crt')
        .setOrigin(1, 0.5).setDisplaySize(40, 24).setTint(HEX.G).setAlpha(0.9);
      this.rightPanel.add(portrait);
    } else {
      const pTxt = this.add.text(r.x + r.w - 6, hdrY, '▓ OGRE', textStyle(11, COL.G)).setOrigin(1, 0);
      applyGlow(pTxt, COL.G, 6);
      this.rightPanel.add(pTxt);
    }

    const hdrLine = this.add.graphics();
    this.drawHRule(hdrLine, r.x, r.y + 22, r.w, HEX.BDR);
    this.rightPanel.add(hdrLine);

    // ── WEAPONS section (pip grid) ──────────────────────────────────────────
    let yc = r.y + 28;
    this.addSectionTitle(this.rightPanel, r.x + 8, yc, r.w - 16, 'WEAPONS');
    yc += 18;

    this.weaponPips = [];
    const colW = (r.w - 24) / 2;
    this.weapons.forEach((w, i) => {
      const cx = r.x + 8 + (i % 2) * (colW + 8);
      const cy = yc + Math.floor(i / 2) * 30;
      const lbl = this.add.text(cx, cy, w.label, textStyle(9, COL.G4)).setOrigin(0, 0);
      lbl.setLetterSpacing(1);
      this.rightPanel.add(lbl);
      const pipsG = this.add.graphics();
      this.drawWeaponPips(pipsG, cx, cy + 12, w);
      this.rightPanel.add(pipsG);
      this.weaponPips.push(pipsG);
    });
    yc += 30 * Math.ceil(this.weapons.length / 2) + 4;

    // ── TREAD STATUS ────────────────────────────────────────────────────────
    this.addSectionTitle(this.rightPanel, r.x + 8, yc, r.w - 16, 'TREAD STATUS');
    yc += 18;

    // tread bar
    const tbX = r.x + 10;
    const tbY = yc;
    const tbW = r.w - 20;
    const tbH = 12;
    this.treadBarRect = { x: tbX, y: tbY, w: tbW, h: tbH };
    this.treadBarG = this.add.graphics();
    this.rightPanel.add(this.treadBarG);
    this.drawTreadBar();
    yc += tbH + 4;

    // numbers row
    this.treadValueText = this.add
      .text(tbX, yc, `${this.currentTreads} / ${this.maxTreads}`, textStyle(9, COL.G))
      .setOrigin(0, 0);
    this.rightPanel.add(this.treadValueText);

    this.movementText = this.add
      .text(tbX + tbW, yc, 'MOVE: M2', textStyle(9, COL.AMBER))
      .setOrigin(1, 0);
    this.movementText.setLetterSpacing(1);
    this.rightPanel.add(this.movementText);
    yc += 14;

    // POSITION line
    this.positionText = this.add
      .text(tbX, yc, this.formatPosLine(), textStyle(9, COL.G4))
      .setOrigin(0, 0);
    this.rightPanel.add(this.positionText);
    yc += 18;

    // ── FIRE WEAPONS ────────────────────────────────────────────────────────
    this.addSectionTitle(this.rightPanel, r.x + 8, yc, r.w - 16, 'FIRE WEAPONS');
    yc += 18;

    const fireBtnW = (r.w - 26) / 2;
    const fireBtnH = 32;
    const fireOrder: { type: OgreWeaponType; label: string; sub: string }[] = [
      { type: 'main',      label: 'MAIN',   sub: '4/3' },
      { type: 'secondary', label: 'SEC ×2', sub: '3/3' },
      { type: 'ap',        label: 'AP ×8',  sub: '1/1' },
      { type: 'missile',   label: 'MSL ×4', sub: '6/5' },
    ];
    this.fireButtons = [];
    fireOrder.forEach((b, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = r.x + 10 + col * (fireBtnW + 6);
      const y = yc + row * (fireBtnH + 4);
      this.fireButtons.push(this.makeFireBtn(x, y, fireBtnW, fireBtnH, b));
    });
    yc += 2 * (fireBtnH + 4) + 6;

    // ── VICTORY CONDITIONS ──────────────────────────────────────────────────
    this.addSectionTitle(this.rightPanel, r.x + 8, yc, r.w - 16, 'VICTORY CONDITIONS');
    yc += 18;

    // CP STATUS row
    const cpLbl = this.add
      .text(r.x + 10, yc, 'CP STATUS', textStyle(9, COL.G4))
      .setOrigin(0, 0);
    cpLbl.setLetterSpacing(1);
    this.rightPanel.add(cpLbl);

    this.cpStatusBox = this.add.graphics();
    this.rightPanel.add(this.cpStatusBox);
    this.cpStatusText = this.add
      .text(r.x + r.w - 10, yc, '■ INTACT', textStyle(8, COL.G))
      .setOrigin(1, 0);
    this.cpStatusText.setLetterSpacing(1);
    this.rightPanel.add(this.cpStatusText);
    this.refreshCpStatusBox();
    if (!this.cpDestroyed) {
      this.cpBlinkTween = this.tweens.add({
        targets: this.cpStatusText,
        alpha: 0,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Cubic.easeInOut',
      });
    }
    yc += 16;

    // OGRE ESCAPE row
    const escLbl = this.add
      .text(r.x + 10, yc, 'OGRE ESCAPE', textStyle(9, COL.G4))
      .setOrigin(0, 0);
    escLbl.setLetterSpacing(1);
    this.rightPanel.add(escLbl);
    const escVal = this.add
      .text(r.x + r.w - 10, yc, 'PENDING', textStyle(8, COL.G4))
      .setOrigin(1, 0);
    escVal.setLetterSpacing(1);
    this.rightPanel.add(escVal);
    yc += 16;

    // VC subgroup header — OGRE WIN CONDITIONS
    const ogreHdr = this.add.text(r.x + 10, yc, 'OGRE', textStyle(8, COL.G4)).setOrigin(0, 0);
    ogreHdr.setLetterSpacing(2);
    this.rightPanel.add(ogreHdr);
    const ogreHdrR = this.add.text(r.x + r.w - 10, yc, 'CONDITION', textStyle(8, COL.G4)).setOrigin(1, 0);
    ogreHdrR.setLetterSpacing(1);
    this.rightPanel.add(ogreHdrR);
    yc += 12;

    const ogreVcLines = [
      { left: '★ CP파괴+탈출', right: 'OGRE 대승' },
      { left: '✓ CP파괴',      right: 'OGRE 승' },
    ];
    ogreVcLines.forEach(line => {
      const l = this.add.text(r.x + 10, yc, line.left, textStyle(9, COL.G4)).setOrigin(0, 0);
      const rt = this.add.text(r.x + r.w - 10, yc, line.right, textStyle(9, COL.G)).setOrigin(1, 0);
      this.rightPanel.add(l); this.rightPanel.add(rt);
      yc += 13;
    });

    yc += 2;
    const vcDiv = this.add.graphics();
    this.drawHRule(vcDiv, r.x + 8, yc, r.w - 16, HEX.BDR2);
    this.rightPanel.add(vcDiv);
    yc += 4;

    // DEFENDER WIN CONDITIONS
    const defHdr = this.add.text(r.x + 10, yc, 'DEFENDER', textStyle(8, COL.G4)).setOrigin(0, 0);
    defHdr.setLetterSpacing(2);
    this.rightPanel.add(defHdr);
    const defHdrR = this.add.text(r.x + r.w - 10, yc, 'CONDITION', textStyle(8, COL.G4)).setOrigin(1, 0);
    defHdrR.setLetterSpacing(1);
    this.rightPanel.add(defHdrR);
    yc += 12;

    const defVcLines = [
      { left: '✓ OGRE 이동불가', right: '방어군 승' },
      { left: '✓ OGRE 완파',     right: '방어군 대승' },
      { left: '✓ CP 생존(턴제한)', right: '방어군 승' },
    ];
    defVcLines.forEach(line => {
      const l = this.add.text(r.x + 10, yc, line.left, textStyle(9, COL.G4)).setOrigin(0, 0);
      const rt = this.add.text(r.x + r.w - 10, yc, line.right, textStyle(9, COL.G)).setOrigin(1, 0);
      this.rightPanel.add(l); this.rightPanel.add(rt);
      yc += 13;
    });
    yc += 4;

    // divider
    const scoreDiv = this.add.graphics();
    this.drawHRule(scoreDiv, r.x + 8, yc, r.w - 16, HEX.BDR2);
    this.rightPanel.add(scoreDiv);
    yc += 4;

    // SCORE rows
    const scoreRows = [['OGRE SCORE', '18pt'], ['DEF  SCORE', ' 8pt']];
    scoreRows.forEach(([l, v]) => {
      const lt = this.add.text(r.x + 10, yc, l, textStyle(9, COL.G3)).setOrigin(0, 0);
      const vt = this.add.text(r.x + r.w - 10, yc, v, textStyle(9, COL.G)).setOrigin(1, 0);
      this.rightPanel.add(lt);
      this.rightPanel.add(vt);
      yc += 13;
    });
    // MARGIN line
    yc += 2;
    const mDiv = this.add.graphics();
    this.drawHRule(mDiv, r.x + 8, yc - 2, r.w - 16, HEX.BDR2);
    this.rightPanel.add(mDiv);
    const mLbl = this.add.text(r.x + 10, yc, 'MARGIN', textStyle(9, COL.G4)).setOrigin(0, 0);
    const mVal = this.add.text(r.x + r.w - 10, yc, '+10 OGRE ↑', textStyle(10, COL.G)).setOrigin(1, 0);
    applyGlow(mVal, COL.G2, 6);
    this.rightPanel.add(mLbl);
    this.rightPanel.add(mVal);
    yc += 18;

    // ── COMBAT LOG ──────────────────────────────────────────────────────────
    this.addSectionTitle(this.rightPanel, r.x + 8, yc, r.w - 16, 'COMBAT LOG');
    yc += 16;

    this.combatLogTexts = [];
    for (let i = 0; i < 6; i++) {
      const t = this.add.text(r.x + 10, yc + i * 12, '', textStyle(9, COL.G4)).setOrigin(0, 0);
      this.rightPanel.add(t);
      this.combatLogTexts.push(t);
    }
    this.refreshCombatLog();
  }

  private addSectionTitle(parent: Phaser.GameObjects.Container, x: number, y: number, w: number, title: string): void {
    const t = this.add.text(x, y, title, textStyle(9, COL.G4)).setOrigin(0, 0);
    t.setLetterSpacing(2);
    parent.add(t);
    const u = this.add.graphics();
    this.drawHRule(u, x, y + 13, w, HEX.BDR2);
    parent.add(u);
  }

  private drawTreadBar(): void {
    const g = this.treadBarG;
    if (!g) return;
    const { x, y, w, h } = this.treadBarRect;
    g.clear();
    // track bg
    g.fillStyle(HEX.TRACK_BG, 1);
    g.fillRect(x, y, w, h);
    // fill
    const ratio = Phaser.Math.Clamp(this.currentTreads / this.maxTreads, 0, 1);
    const color = ratio > 0.55 ? HEX.G : ratio > 0.25 ? HEX.AMBER : HEX.RED;
    g.fillStyle(color, 0.95);
    g.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * ratio), h - 2);
    // glow approximation: extra translucent stroke
    g.lineStyle(1, color, 0.4);
    g.strokeRect(x, y, w, h);
    g.lineStyle(1, HEX.BDR2, 1);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private formatPosLine(): string {
    const c = String(this.ogreCol).padStart(2, '0');
    const rr = String(this.ogreRow).padStart(2, '0');
    return `POS: (${c}, ${rr})  ·  DIR: ${this.ogreFacingLabel}`;
  }

  private refreshCpStatusBox(): void {
    if (!this.cpStatusBox || !this.cpStatusText) return;
    const t = this.cpStatusText;
    const bw = t.width + 12;
    const bh = t.height + 4;
    const bx = t.x - bw;
    const by = t.y - 2;
    this.cpStatusBoxRect = { x: bx, y: by, w: bw, h: bh };
    this.cpStatusBox.clear();
    const c = this.cpDestroyed ? HEX.RED : HEX.G3;
    this.cpStatusBox.lineStyle(1, c, 1);
    this.cpStatusBox.strokeRect(bx, by, bw, bh);
  }

  // ==========================================================================
  // FIRE BUTTONS
  // ==========================================================================
  private makeFireBtn(x: number, y: number, w: number, h: number, def: { type: OgreWeaponType; label: string; sub: string }): FireBtnRef {
    const bg = this.add.graphics();
    const label = this.add.text(x + w / 2, y + 8, def.label, textStyle(9, COL.G)).setOrigin(0.5, 0);
    label.setLetterSpacing(1);
    const sub = this.add.text(x + w / 2, y + h - 12, def.sub, textStyle(8, COL.G4)).setOrigin(0.5, 0);
    const ref: FireBtnRef = { type: def.type, bg, label, sub, x, y, w, h, fired: false };
    this.drawFireBtn(ref);
    this.rightPanel.add(bg);
    this.rightPanel.add(label);
    this.rightPanel.add(sub);

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    this.rightPanel.add(hit);
    hit.on('pointerover', () => { if (!ref.fired) { ref.label.setColor(COL.AMBER); applyGlow(ref.label, COL.AMBER, 6); }});
    hit.on('pointerout',  () => { if (!ref.fired) { ref.label.setColor(COL.G);     applyGlow(ref.label, COL.G2, 4); }});
    hit.on('pointerdown', () => {
      if (ref.fired) return;
      this.game.events.emit(EVENTS.UI_DECLARE_ATTACK, { weaponType: def.type });
    });
    return ref;
  }

  private drawFireBtn(ref: FireBtnRef): void {
    ref.bg.clear();
    if (ref.fired) {
      ref.bg.lineStyle(1, HEX.BDR, 1);
      ref.bg.strokeRect(ref.x, ref.y, ref.w, ref.h);
      ref.label.setAlpha(0.25);
      ref.sub.setAlpha(0.25);
      ref.sub.setText('✕ FIRED');
      ref.label.setColor(COL.G4);
    } else {
      ref.bg.lineStyle(1, HEX.G3, 1);
      ref.bg.strokeRect(ref.x, ref.y, ref.w, ref.h);
      ref.label.setAlpha(1);
      ref.sub.setAlpha(1);
      ref.label.setColor(COL.G);
      applyGlow(ref.label, COL.G2, 4);
    }
  }

  // ==========================================================================
  // BOTTOM BAR  (56px)
  // ==========================================================================
  private buildBottomBar(): void {
    const r = this.layout.bottomBar;
    this.bottomBar = this.add.container(0, 0);

    const bg = this.add.graphics();
    this.drawPanelBg(bg, r.x, r.y, r.w, r.h);
    this.bottomBar.add(bg);

    const cy = r.y + r.h / 2;

    // ── LEFT: turn block + phase block + side badge ─────────────────────────
    let lx = r.x + 14;
    // TURN
    const turnLbl = this.add.text(lx, cy - 14, 'TURN', textStyle(8, COL.G4)).setOrigin(0, 0);
    turnLbl.setLetterSpacing(2);
    this.bottomBar.add(turnLbl);
    this.turnNumText = this.add.text(lx, cy + 2, String(this.currentTurn).padStart(2, '0'), textStyle(22, COL.G)).setOrigin(0, 0);
    applyGlow(this.turnNumText, COL.G2, 10);
    this.bottomBar.add(this.turnNumText);
    lx += 50;

    // separator
    const sep = this.add.graphics();
    sep.lineStyle(1, HEX.BDR, 1);
    sep.lineBetween(lx, cy - 16, lx, cy + 16);
    this.bottomBar.add(sep);
    lx += 12;

    // PHASE
    const phaseLbl = this.add.text(lx, cy - 14, 'PHASE', textStyle(8, COL.G4)).setOrigin(0, 0);
    phaseLbl.setLetterSpacing(2);
    this.bottomBar.add(phaseLbl);
    this.phaseNameText = this.add.text(lx, cy + 2, PHASE_LABEL[this.currentPhase], textStyle(13, COL.G)).setOrigin(0, 0);
    this.phaseNameText.setLetterSpacing(2);
    applyGlow(this.phaseNameText, COL.G2, 6);
    this.bottomBar.add(this.phaseNameText);
    lx += 130;

    // SIDE BADGE (filled rectangle behind text)
    this.sideBadgeBg = this.add.graphics();
    this.bottomBar.add(this.sideBadgeBg);
    this.sideBadgeText = this.add.text(lx + 6, cy, 'OGRE TURN', textStyle(10, COL.BG)).setOrigin(0, 0.5);
    this.sideBadgeText.setLetterSpacing(2);
    this.bottomBar.add(this.sideBadgeText);
    this.refreshSideBadge();

    // ── CENTER: action buttons ──────────────────────────────────────────────
    // RAM 버튼 제거: RAM은 이동 중 자동 발생 이벤트로 처리
    const actions: { key: 'MOVE' | 'ATTACK' | 'END'; label: string }[] = [
      { key: 'MOVE',   label: 'MOVE' },
      { key: 'ATTACK', label: 'ATTACK' },
      { key: 'END',    label: 'END TURN' },
    ];
    const btnW = 92;
    const btnH = r.h - 18;
    const totalW = actions.length * btnW + (actions.length - 1) * 6;
    const startX = r.x + r.w / 2 - totalW / 2;
    this.actionButtons = [];
    actions.forEach((a, i) => {
      const x = startX + i * (btnW + 6);
      const y = r.y + 9;
      this.actionButtons.push(this.makeActionBtn(x, y, btnW, btnH, a.key, a.label));
    });

    // ── RIGHT: hint text (two lines) ────────────────────────────────────────
    const hx = r.x + r.w - 14;
    this.hintTextLine1 = this.add.text(hx, cy - 9, 'SELECT DESTINATION HEX', textStyle(9, COL.G4)).setOrigin(1, 0.5);
    this.hintTextLine2 = this.add.text(hx, cy + 8, 'GREEN=REACHABLE · AMBER=ATK RANGE', textStyle(9, COL.BDR)).setOrigin(1, 0.5);
    this.bottomBar.add(this.hintTextLine1);
    this.bottomBar.add(this.hintTextLine2);
  }

  private makeActionBtn(x: number, y: number, w: number, h: number, key: ActionBtnRef['key'], label: string): ActionBtnRef {
    const bg = this.add.graphics();
    const text = this.add.text(x + w / 2, y + h / 2, label, textStyle(11, COL.G)).setOrigin(0.5);
    text.setLetterSpacing(2);
    this.bottomBar.add(bg);
    this.bottomBar.add(text);

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    this.bottomBar.add(hit);

    const ref: ActionBtnRef = { key, bg, label: text, hit, x, y, w, h, enabled: true, active: false };
    this.drawActionBtn(ref);

    hit.on('pointerover', () => { if (ref.enabled && !ref.active) this.drawActionBtn(ref, true); });
    hit.on('pointerout',  () => { if (ref.enabled) this.drawActionBtn(ref); });
    hit.on('pointerdown', () => this.onActionClick(ref));
    return ref;
  }

  private drawActionBtn(ref: ActionBtnRef, hover = false): void {
    ref.bg.clear();
    if (!ref.enabled) {
      ref.bg.lineStyle(1, HEX.G3, 0.25);
      ref.bg.strokeRect(ref.x, ref.y, ref.w, ref.h);
      ref.label.setAlpha(0.25);
      ref.label.setColor(COL.G);
      return;
    }
    ref.label.setAlpha(1);
    if (ref.active || hover) {
      ref.bg.fillStyle(HEX.G2, 1);
      ref.bg.fillRect(ref.x, ref.y, ref.w, ref.h);
      ref.bg.lineStyle(1, HEX.G3, 1);
      ref.bg.strokeRect(ref.x, ref.y, ref.w, ref.h);
      ref.label.setColor(COL.BG);
      ref.label.setShadow(0, 0, COL.G, 0, false, false);
    } else {
      ref.bg.lineStyle(1, HEX.G3, 1);
      ref.bg.strokeRect(ref.x, ref.y, ref.w, ref.h);
      ref.label.setColor(COL.G);
      applyGlow(ref.label, COL.G2, 5);
    }
  }

  private onActionClick(ref: ActionBtnRef): void {
    if (!ref.enabled) return;
    switch (ref.key) {
      case 'MOVE':
        this.setActiveAction('MOVE');
        this.game.events.emit(EVENTS.UI_SELECT_UNIT, { mode: 'move' });
        break;
      case 'ATTACK':
        this.setActiveAction('ATTACK');
        this.game.events.emit(EVENTS.UI_DECLARE_ATTACK, { mode: 'pick-target' });
        break;
      case 'END':
        this.game.events.emit(EVENTS.UI_END_PHASE);
        break;
    }
    this.refreshHint();
  }

  private setActiveAction(key: ActionBtnRef['key']): void {
    this.actionButtons.forEach(b => {
      b.active = b.key === key;
      this.drawActionBtn(b);
    });
  }

  private refreshActionButtons(): void {
    const phase = this.currentPhase;
    const setEnabled = (key: ActionBtnRef['key'], on: boolean) => {
      const b = this.actionButtons.find(x => x.key === key);
      if (!b) return;
      b.enabled = on;
      if (!on) b.active = false;
      this.drawActionBtn(b);
    };
    // RAM 버튼 제거: 이동 중 자동 발생 이벤트로 처리
    if (phase === 'ogre-move') {
      setEnabled('MOVE',   true);
      setEnabled('ATTACK', false);
      setEnabled('END',    true);
      this.setActiveAction('MOVE');
    } else if (phase === 'ogre-attack' || phase === 'ogre-ram') {
      setEnabled('MOVE',   false);
      setEnabled('ATTACK', true);
      setEnabled('END',    true);
      this.setActiveAction('ATTACK');
    } else {
      // defender phases
      setEnabled('MOVE',   phase === 'defender-move' || phase === 'gev-postmove');
      setEnabled('ATTACK', phase === 'defender-attack');
      setEnabled('END',    true);
    }
  }

  private refreshHint(): void {
    if (!this.hintTextLine1 || !this.hintTextLine2) return;
    const phase = this.currentPhase;
    if (phase === 'ogre-move') {
      this.hintTextLine1.setText('SELECT DESTINATION HEX');
      this.hintTextLine2.setText('GREEN=REACHABLE · AMBER=ATK RANGE');
    } else if (phase === 'ogre-attack') {
      this.hintTextLine1.setText('PICK TARGET FOR WEAPON');
      this.hintTextLine2.setText('AMBER=IN RANGE · RED=OUT OF LOS');
    } else if (phase === 'ogre-ram') {
      this.hintTextLine1.setText('SELECT ADJACENT UNIT TO RAM');
      this.hintTextLine2.setText('GREEN=ADJACENT');
    } else if (phase.startsWith('defender')) {
      this.hintTextLine1.setText('SELECT DEFENDER UNIT');
      this.hintTextLine2.setText('GREEN=READY · AMBER=DISABLED');
    } else if (phase.startsWith('gev')) {
      this.hintTextLine1.setText('GEV BONUS MOVE');
      this.hintTextLine2.setText('GREEN=REACHABLE');
    }
  }

  private refreshSideBadge(): void {
    if (!this.sideBadgeBg || !this.sideBadgeText) return;
    const isOgre = this.currentPhase.startsWith('ogre');
    const fillC = isOgre ? HEX.G : HEX.AMBER;
    this.sideBadgeText.setText(isOgre ? 'OGRE TURN' : 'DEFENDER TURN');
    const tw = this.sideBadgeText.width;
    const th = this.sideBadgeText.height;
    const bx = this.sideBadgeText.x - 6;
    const by = this.sideBadgeText.y - th / 2 - 2;
    const bw = tw + 12;
    const bh = th + 4;
    this.sideBadgeRect = { x: bx, y: by, w: bw, h: bh };
    this.sideBadgeBg.clear();
    this.sideBadgeBg.fillStyle(fillC, 1);
    this.sideBadgeBg.fillRect(bx, by, bw, bh);
    this.sideBadgeText.setColor(COL.BG);
  }

  // ==========================================================================
  // COMBAT LOG
  // ==========================================================================
  private addCombatLog(side: 'OGRE' | 'DEF' | 'SYS', text: string, tag: 'X' | 'D' | 'H' = 'H'): void {
    this.logEntries.unshift({ side, turn: this.currentTurn, text, tag });
    if (this.logEntries.length > 6) this.logEntries.pop();
    this.refreshCombatLog();
  }

  private refreshCombatLog(): void {
    this.combatLogTexts.forEach((t, i) => {
      const e = this.logEntries[i];
      if (!e) { t.setText(''); return; }
      const color = e.tag === 'X' ? COL.RED : e.tag === 'D' ? COL.AMBER : COL.G4;
      const tagStr = e.tag === 'X' ? '[X]' : e.tag === 'D' ? '[D]' : '';
      t.setText(`T${String(e.turn).padStart(2, '0')} ${e.side} ${e.text} ${tagStr}`.trim());
      t.setColor(color);
    });
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================
  private bindEvents(): void {
    const bus = this.game.events;

    bus.on(EVENTS.TURN_PHASE_CHANGED, (data: { turn: number; phase: TurnPhase }) => {
      this.currentTurn = data.turn ?? this.currentTurn;
      this.currentPhase = data.phase ?? this.currentPhase;
      this.turnNumText?.setText(String(this.currentTurn).padStart(2, '0'));
      this.phaseNameText?.setText(PHASE_LABEL[this.currentPhase]);
      this.refreshSideBadge();
      this.refreshActionButtons();
      this.refreshHint();
      // reset fire buttons each new ogre turn
      if (this.currentPhase === 'ogre-attack') {
        this.fireButtons.forEach(b => { b.fired = false; this.drawFireBtn(b); });
      }
    });

    bus.on(EVENTS.OGRE_TREADS_CHANGED, (payload: number | { remaining: number; moveAllowance?: number }) => {
      this.currentTreads = typeof payload === 'number' ? payload : payload.remaining;
      this.drawTreadBar();
      this.treadValueText?.setText(`${this.currentTreads} / ${this.maxTreads}`);
      const mvNum = typeof payload === 'object' && payload.moveAllowance != null
        ? payload.moveAllowance
        : (OGRE_MOVEMENT_TABLE.find(b => this.currentTreads >= b.treadMin && this.currentTreads <= b.treadMax)?.movement ?? 0);
      const mv = mvNum >= 3 ? 'M3' : mvNum === 2 ? 'M2' : mvNum === 1 ? 'M1' : 'M0';
      this.movementText?.setText(`MOVE: ${mv}`);
    });

    bus.on(EVENTS.OGRE_WEAPON_DAMAGED, (info: { weaponId?: string; type?: OgreWeaponType; kind?: string }) => {
      const wType: OgreWeaponType = (info.type ?? info.weaponId?.split('-')[0] ?? 'ap') as OgreWeaponType;
      const w = this.weapons.find(wd => wd.type === wType);
      if (w && w.remaining > 0) {
        w.remaining -= 1;
        const idx = this.weapons.indexOf(w);
        if (this.weaponPips[idx]) {
          // recompute pip position — now in right panel
          const r = this.layout.rightPanel;
          const colW = (r.w - 24) / 2;
          const cx = r.x + 8 + (idx % 2) * (colW + 8);
          const cy = r.y + 28 + 18 + Math.floor(idx / 2) * 30 + 12;
          this.drawWeaponPips(this.weaponPips[idx], cx, cy, w);
        }
      }
      const kindLabel = info.kind === 'X' ? 'DESTROYED' : 'DISABLED';
      this.addCombatLog('SYS', `${wType.toUpperCase()} ${kindLabel}`, info.kind === 'X' ? 'X' : 'D');
    });

    bus.on(EVENTS.UNIT_DISABLED, (payload: DefenderUnit | { unitId: string }) => {
      const id = 'unitId' in payload ? payload.unitId : `${payload.type}@${payload.col},${payload.row}`;
      this.updateUnitState(id, 'disabled');
      this.addCombatLog('SYS', `${id} DISABLED`, 'D');
    });

    bus.on(EVENTS.UNIT_DESTROYED, (payload: DefenderUnit | { unitId: string }) => {
      const id = 'unitId' in payload ? payload.unitId : `${payload.type}@${payload.col},${payload.row}`;
      this.updateUnitState(id, 'dead');
      // detect CP
      const isCP = id.toLowerCase().includes('cp') || ('type' in payload && payload.type === 'CP');
      if (isCP) {
        this.cpDestroyed = true;
        if (this.cpStatusText) {
          this.cpBlinkTween?.stop();
          this.cpStatusText.setAlpha(1);
          this.cpStatusText.setText('✕ DESTROYED');
          this.cpStatusText.setColor(COL.RED);
          applyGlow(this.cpStatusText, COL.RED, 6);
          this.refreshCpStatusBox();
        }
      }
      this.addCombatLog('SYS', `${id} DESTROYED`, 'X');
    });

    bus.on(EVENTS.UNIT_MOVED, (payload: { unitId: string; from?: any; to?: any } | DefenderUnit) => {
      if ('unitId' in payload && payload.unitId === 'ogre-mk3' && payload.to) {
        this.ogreCol = payload.to.col;
        this.ogreRow = payload.to.row;
        this.positionText?.setText(this.formatPosLine());
      }
    });

    bus.on(EVENTS.COMBAT_DECLARED, (data: { ratio: CrtRatioKey; totalAtk?: number; totalDef?: number; atk?: number; def?: number }) => {
      this.diceGauge.show({
        ratio: data.ratio,
        atk: data.totalAtk ?? data.atk ?? 0,
        def: data.totalDef ?? data.def ?? 0,
        speed: 'normal',
        onHold: (result: DiceHoldResult) => {
          this.game.events.emit(EVENTS.DICE_HOLD, result);
          this.diceGauge.hide();
        },
      });
    });

    bus.on(EVENTS.COMBAT_RESOLVED, (payload: CombatResult | { ramTarget?: string; roll?: number; result?: string }) => {
      const crtResult = (payload.result ?? 'NE') as string;
      const targetLabel = (payload as CombatResult).declaration?.targetId ?? (payload as any).ramTarget ?? 'TGT';
      this.combatPopup.show(payload as CombatResult, targetLabel);
      const tag = crtResult === 'X' ? 'X' : crtResult === 'D' ? 'D' : 'H';
      const side = this.currentPhase.startsWith('ogre') ? 'OGRE' : 'DEF';
      this.addCombatLog(side, `→ ${targetLabel}`, tag as any);
      // mark fire button as fired
      const decl = (payload as CombatResult).declaration;
      if (decl?.attackerIds?.[0]) {
        const t = decl.attackerIds[0].split('-')[0] as OgreWeaponType;
        const fb = this.fireButtons.find(b => b.type === t);
        if (fb) { fb.fired = true; this.drawFireBtn(fb); }
      }
    });

    bus.on(EVENTS.SETUP_DONE, (p: { defenderUnits?: DefenderUnit[] }) => {
      if (p?.defenderUnits) this.initUnitList(p.defenderUnits);
    });

    // ── Selected-unit detail panel (left panel bottom) ──────────────────────
    bus.on(EVENTS.UI_SELECT_UNIT, (payload: { unitId?: string; mode?: string }) => {
      if (!payload || !payload.unitId) return;
      const uid = payload.unitId;
      const u = this.unitList.find(x => x.id === uid);
      if (u) {
        this.showUnitDetail(u);
      } else if (uid === 'ogre' || uid.toLowerCase().startsWith('ogre')) {
        this.showOgreDetail();
      }
    });

    bus.on(EVENTS.VICTORY, (data: { winner: 'ogre' | 'defender'; reason: string }) => {
      this.scene.start('gameover', data);
    });

    // ── Multi-weapon / multi-attacker staging prompts ────────────────────────
    bus.on(EVENTS.OGRE_ATTACK_STAGED, (data: {
      targetName: string; weapons: string[]; totalAtk: number; def: number;
    }) => {
      this.showAttackPrompt('ogre', data);
    });

    bus.on(EVENTS.DEFENDER_ATTACK_STAGED, (data: {
      attackerIds: string[]; totalAtk: number; ogreDef: number;
    }) => {
      this.showAttackPrompt('defender', data);
    });
  }

  // ==========================================================================
  // ATTACK STAGING PROMPT — center-screen popup
  // ==========================================================================
  private showAttackPrompt(side: 'ogre' | 'defender', data: any): void {
    this.attackPrompt?.destroy();
    this.attackPrompt = undefined;

    const W = 480, H = 280;
    const px = this.scale.width / 2 - W / 2;
    const py = this.scale.height / 2 - H / 2;

    const c = this.add.container(0, 0).setDepth(5000);

    // Full-screen dim background
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.55);
    dimBg.fillRect(0, 0, this.scale.width, this.scale.height);
    c.add(dimBg);

    // Popup panel
    const bg = this.add.graphics();
    bg.fillStyle(HEX.PANEL, 1);
    bg.fillRect(px, py, W, H);
    bg.lineStyle(2, HEX.BDR, 1);
    bg.strokeRect(px, py, W, H);
    // header divider
    bg.lineStyle(1, HEX.BDR2, 1);
    bg.lineBetween(px, py + 32, px + W, py + 32);
    // center vertical divider
    bg.lineBetween(px + W / 2, py + 32, px + W / 2, py + H - 48);
    // bottom button divider
    bg.lineBetween(px, py + H - 48, px + W, py + H - 48);
    c.add(bg);

    // Header title
    const isOgre = side === 'ogre';
    const title = isOgre ? 'OGRE ATTACK DECLARATION' : 'DEFENDER ATTACK DECLARATION';
    const titleTxt = this.add.text(px + W / 2, py + 16, title, textStyle(13, COL.AMBER))
      .setOrigin(0.5, 0.5);
    titleTxt.setLetterSpacing(2);
    applyGlow(titleTxt, COL.AMBER, 6);
    c.add(titleTxt);

    // Section labels
    c.add(this.add.text(px + 12, py + 40, 'ATTACKER', textStyle(10, COL.G4)).setOrigin(0, 0));
    c.add(this.add.text(px + W / 2 + 12, py + 40, 'TARGET', textStyle(10, COL.G4)).setOrigin(0, 0));

    if (isOgre) {
      // Attacker side: OGRE portrait
      if (this.textures.exists('ogre_mk3_crt')) {
        const img = this.add.image(px + 60, py + 90, 'ogre_mk3_crt')
          .setDisplaySize(56, 56).setTint(HEX.G);
        c.add(img);
      } else {
        const t = this.add.text(px + 60, py + 90, '▓ OGRE', textStyle(16, COL.G)).setOrigin(0.5);
        applyGlow(t, COL.G, 8);
        c.add(t);
      }
      c.add(this.add.text(px + 12, py + 125, 'OGRE Mk.III', textStyle(10, COL.G)).setOrigin(0, 0));

      // Staged weapon list
      let wy = py + 142;
      const stagedWeapons: any[] = data.stagedWeapons ?? data.weapons ?? [];
      if (stagedWeapons.length === 0) {
        c.add(this.add.text(px + 12, wy, '(no weapons staged)', textStyle(9, COL.G4)).setOrigin(0, 0));
        wy += 14;
      } else {
        stagedWeapons.forEach((w: any) => {
          const lbl = typeof w === 'string' ? w :
                      `${(w.type ?? w.label ?? '?').toString().toUpperCase()}${w.atk != null ? ` (ATK ${w.atk})` : ''}`;
          c.add(this.add.text(px + 12, wy, `■ ${lbl}`, textStyle(9, COL.G2)).setOrigin(0, 0));
          wy += 13;
        });
      }
      const totalAtk = data.totalAtk ?? 0;
      c.add(this.add.text(px + 12, wy + 6, `ATK TOTAL: ${totalAtk}`, textStyle(11, COL.G)).setOrigin(0, 0));

      // Target side: defender unit
      const tgt = data.target ?? { type: data.targetName ?? 'UNIT', def: data.def ?? 0, col: 0, row: 0 };
      const tgtSvgKey = tgt.svgKey ? `${tgt.svgKey}_crt` : (tgt.type ? `${UNIT_SVG_KEY[tgt.type] ?? 'heavy_tank'}_crt` : 'heavy_tank_crt');
      if (this.textures.exists(tgtSvgKey)) {
        const img = this.add.image(px + W / 2 + 60, py + 90, tgtSvgKey)
          .setDisplaySize(48, 48).setTint(HEX.G);
        c.add(img);
      } else {
        const t = this.add.text(px + W / 2 + 60, py + 90, (tgt.type ?? '?').toString().slice(0, 3),
          textStyle(14, COL.G)).setOrigin(0.5);
        c.add(t);
      }
      c.add(this.add.text(px + W / 2 + 12, py + 125, tgt.name ?? tgt.type ?? 'UNIT', textStyle(10, COL.G)).setOrigin(0, 0));
      const posStr = (tgt.col != null && tgt.row != null) ? `(${tgt.col},${tgt.row})` : '';
      c.add(this.add.text(px + W / 2 + 12, py + 140, `DEF ${tgt.def ?? 0}  ${posStr}`, textStyle(9, COL.G4)).setOrigin(0, 0));
      const ratio = this.computeRatio(totalAtk, tgt.def ?? 1);
      const rTxt = this.add.text(px + W / 2 + 12, py + 162, `RATIO: ${ratio}`, textStyle(12, COL.AMBER)).setOrigin(0, 0);
      applyGlow(rTxt, COL.AMBER, 4);
      c.add(rTxt);

    } else {
      // DEFENDER side: attacker units (up to 3 icons)
      const attackers: any[] = data.attackers ?? data.attackerIds?.map((id: string) => ({ id })) ?? [];
      attackers.slice(0, 3).forEach((a, i) => {
        const svgK = a.svgKey ? `${a.svgKey}_crt` :
                     a.type ? `${UNIT_SVG_KEY[a.type] ?? 'heavy_tank'}_crt` :
                     'heavy_tank_crt';
        if (this.textures.exists(svgK)) {
          const img = this.add.image(px + 30 + i * 42, py + 88, svgK)
            .setDisplaySize(36, 36).setTint(HEX.G);
          c.add(img);
        } else {
          c.add(this.add.text(px + 30 + i * 42, py + 88, (a.type ?? '?').toString().slice(0, 3),
            textStyle(10, COL.G)).setOrigin(0.5));
        }
      });
      if (attackers.length > 3) {
        c.add(this.add.text(px + 12 + 3 * 42 + 24, py + 88, `+${attackers.length - 3}`,
          textStyle(11, COL.G4)).setOrigin(0.5));
      }
      c.add(this.add.text(px + 12, py + 130, `${attackers.length} UNIT(S)`, textStyle(10, COL.G)).setOrigin(0, 0));
      const totalAtk = data.totalAtk ?? 0;
      c.add(this.add.text(px + 12, py + 148, `ATK TOTAL: ${totalAtk}`, textStyle(11, COL.G)).setOrigin(0, 0));

      // Target: OGRE — weapon target selection
      if (this.textures.exists('ogre_mk3_crt')) {
        const img = this.add.image(px + W - 60, py + 88, 'ogre_mk3_crt')
          .setDisplaySize(56, 36).setTint(HEX.RED).setAlpha(0.9);
        c.add(img);
      }
      c.add(this.add.text(px + W / 2 + 12, py + 56, 'OGRE Mk.III', textStyle(10, COL.G)).setOrigin(0, 0));
      c.add(this.add.text(px + W / 2 + 12, py + 70, 'SELECT TARGET:', textStyle(8, COL.G4)).setOrigin(0, 0));

      const possibleTargets: string[] = data.possibleTargets ?? ['TREADS', 'MAIN', 'SECONDARY', 'AP GUN', 'MISSILE'];
      let chosenIdx = 0;
      const radios: Phaser.GameObjects.Text[] = [];
      const labels: Phaser.GameObjects.Text[] = [];

      let ty = py + 90;
      possibleTargets.forEach((tgt, i) => {
        const isSel = i === chosenIdx;
        const tc = isSel ? COL.G : COL.G4;
        const radio = this.add.text(px + W / 2 + 12, ty, isSel ? '◉' : '○', textStyle(12, tc))
          .setInteractive({ useHandCursor: true });
        const lbl = this.add.text(px + W / 2 + 30, ty, tgt, textStyle(10, tc)).setOrigin(0, 0);
        radio.on('pointerdown', () => {
          chosenIdx = i;
          radios.forEach((r, ri) => {
            r.setText(ri === chosenIdx ? '◉' : '○');
            r.setColor(ri === chosenIdx ? COL.G : COL.G4);
            labels[ri].setColor(ri === chosenIdx ? COL.G : COL.G4);
          });
          this.game.events.emit('ui:select-ogre-target', { targetId: tgt });
        });
        radios.push(radio);
        labels.push(lbl);
        c.add(radio);
        c.add(lbl);
        ty += 16;
      });
    }

    // Action buttons
    const addLabel = isOgre ? 'ADD WEAPON' : 'ADD ATTACKER';
    const addEvent = isOgre ? EVENTS.UI_ADD_WEAPON : EVENTS.UI_ADD_ATTACKER;
    this.makeAttackBtn(c, px + W / 4, py + H - 24, 160, 32, addLabel, HEX.AMBER, COL.AMBER, () => {
      this.game.events.emit(addEvent);
      this.attackPrompt?.destroy(); this.attackPrompt = undefined;
    });
    this.makeAttackBtn(c, px + 3 * W / 4, py + H - 24, 160, 32, 'ATTACK NOW', HEX.G, COL.G, () => {
      this.game.events.emit(EVENTS.UI_ATTACK_NOW);
      this.attackPrompt?.destroy(); this.attackPrompt = undefined;
    });

    // Close X button
    const closeBtn = this.add.text(px + W - 14, py + 8, '✕', textStyle(14, COL.RED))
      .setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      this.attackPrompt?.destroy();
      this.attackPrompt = undefined;
    });
    c.add(closeBtn);

    this.attackPrompt = c;

    // Auto-close on COMBAT_RESOLVED
    const cleanup = () => {
      this.attackPrompt?.destroy();
      this.attackPrompt = undefined;
      this.game.events.off(EVENTS.COMBAT_RESOLVED, cleanup);
    };
    this.game.events.once(EVENTS.COMBAT_RESOLVED, cleanup);
  }

  private computeRatio(atk: number, def: number): string {
    if (def <= 0) return '4:1+';
    const r = atk / def;
    if (r >= 4) return '4:1+';
    if (r >= 3) return '3:1';
    if (r >= 2) return '2:1';
    if (r >= 1) return '1:1';
    if (r >= 0.5) return '1:2';
    return '1:3-';
  }

  private makeAttackBtn(
    container: Phaser.GameObjects.Container,
    x: number, y: number, w: number, h: number,
    label: string, hexColor: number, strColor: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const bg = this.add.graphics();
    bg.lineStyle(1, hexColor, 1);
    bg.strokeRect(x - w / 2, y - h / 2, w, h);
    container.add(bg);

    const txt = this.add.text(x, y, label, {
      ...textStyle(10, strColor),
    }).setOrigin(0.5);
    txt.setLetterSpacing(1);
    applyGlow(txt, strColor, 4);
    container.add(txt);

    const hit = this.add.rectangle(x, y, w, h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    container.add(hit);

    hit.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hexColor, 0.2);
      bg.fillRect(x - w / 2, y - h / 2, w, h);
      bg.lineStyle(1, hexColor, 1);
      bg.strokeRect(x - w / 2, y - h / 2, w, h);
    });
    hit.on('pointerout', () => {
      bg.clear();
      bg.lineStyle(1, hexColor, 1);
      bg.strokeRect(x - w / 2, y - h / 2, w, h);
    });
    hit.on('pointerdown', onClick);
    return txt;
  }

  // ==========================================================================
  // PUBLIC API used by event handlers
  // ==========================================================================
  initUnitList(units: DefenderUnit[]): void {
    this.unitList = units.slice();
    this.renderUnitRows();
  }

  private updateUnitState(unitId: string, state: UnitState): void {
    const u = this.unitList.find(x => x.id === unitId);
    if (u) u.state = state;
    this.renderUnitRows();
    if (this.selectedUnitId) this.selectUnit(this.selectedUnitId);
    // Refresh detail panel if the changed unit is currently selected
    if (this.selectedUnitData && this.selectedUnitData.id === unitId) {
      const updated = this.unitList.find(x => x.id === unitId);
      if (updated) this.showUnitDetail(updated);
    }
  }

  // ==========================================================================
  // SELECTED UNIT DETAIL — bottom of left panel
  // ==========================================================================
  private showUnitDetail(u: DefenderUnit): void {
    this.selectedInfoContainer?.destroy();
    this.selectedInfoContainer = undefined;
    this.selectedUnitData = u;
    this.selectedIsOgre = false;

    const r = this.layout.leftPanel;
    if (r.w === 0) return;

    const PANEL_H = 180;
    const y0 = r.y + r.h - PANEL_H;

    const c = this.add.container(0, 0);

    // top separator
    const sepG = this.add.graphics();
    sepG.lineStyle(1, HEX.BDR, 1);
    sepG.lineBetween(r.x + 8, y0, r.x + r.w - 8, y0);
    c.add(sepG);

    // background tint to visually separate from list above
    const bgG = this.add.graphics();
    bgG.fillStyle(0x0A140A, 0.85);
    bgG.fillRect(r.x + 1, y0 + 1, r.w - 2, PANEL_H - 2);
    c.add(bgG);

    let y = y0 + 6;

    // Section header
    const hdr = this.add.text(r.x + 10, y, 'SELECTED UNIT', textStyle(9, COL.G4)).setOrigin(0, 0);
    hdr.setLetterSpacing(2);
    c.add(hdr);
    y += 14;

    // Determine state-derived colors
    const stateCol = u.state === 'dead' ? '#555555' : u.state === 'disabled' ? COL.AMBER : COL.G;
    const stateHex = u.state === 'dead' ? 0x555555 : u.state === 'disabled' ? HEX.AMBER : HEX.G;

    // Icon box (36x36)
    const ix = r.x + 10;
    const iy = y;
    const iconG = this.add.graphics();
    iconG.lineStyle(1, stateHex, u.state === 'dead' ? 0.4 : 1);
    iconG.strokeRect(ix, iy, 36, 36);
    c.add(iconG);

    const svgK = `${unitSvgKey(u)}_crt`;
    if (this.textures.exists(svgK)) {
      const img = this.add.image(ix + 18, iy + 18, svgK).setDisplaySize(32, 32).setTint(stateHex);
      if (u.state === 'dead') img.setAlpha(0.4);
      c.add(img);
    } else {
      const tok = UNIT_ICON_TOKEN[u.type] ?? u.type.slice(0, 3);
      c.add(this.add.text(ix + 18, iy + 18, tok, textStyle(10, stateCol)).setOrigin(0.5));
    }

    // Name + position + state
    const unitNames: Record<DefenderUnitType, string> = {
      HVY: 'Heavy Tank',
      MSL: 'Missile Tank',
      GEV: 'GEV',
      HOW: 'Howitzer',
      INF: 'Infantry',
      CP:  'Command Post',
    };
    const tCode = `(${u.type})`;
    const squadStr = u.type === 'INF' && u.squads ? ` x${u.squads}sq` : '';
    const nameLine = `${unitNames[u.type] ?? u.type} ${tCode}${squadStr}`;
    const nameTxt = this.add.text(ix + 44, iy, nameLine, textStyle(10, stateCol)).setOrigin(0, 0);
    nameTxt.setLetterSpacing(1);
    if (u.state === 'dead') nameTxt.setAlpha(0.5);
    c.add(nameTxt);

    const posTxt = this.add.text(
      ix + 44, iy + 14,
      `POS: (${String(u.col + 1).padStart(2, '0')},${String(u.row + 1).padStart(2, '0')})`,
      textStyle(9, COL.G4),
    ).setOrigin(0, 0);
    c.add(posTxt);

    const stateLabel = u.state === 'dead' ? 'DESTROYED' : u.state === 'disabled' ? 'DISABLED' : 'OK';
    const stateTxt = this.add.text(ix + 44, iy + 26, `STATE: ${stateLabel}`, textStyle(9, stateCol)).setOrigin(0, 0);
    c.add(stateTxt);

    y += 44;

    // Mid divider
    const midDiv = this.add.graphics();
    midDiv.lineStyle(1, HEX.BDR2, 1);
    midDiv.lineBetween(r.x + 10, y, r.x + r.w - 10, y);
    c.add(midDiv);
    y += 4;

    // Stats row 1: ATK / DEF
    const stat1 = this.add.text(r.x + 10, y, `ATK:${u.atk}   DEF:${u.def}`, textStyle(9, COL.G3)).setOrigin(0, 0);
    c.add(stat1);
    y += 12;

    // Stats row 2: MOV (with secondary if present) / RNG
    const moveStr = u.secondaryMove ? `${u.move}+${u.secondaryMove}` : `${u.move}`;
    const stat2 = this.add.text(r.x + 10, y, `MOV:${moveStr}   RNG:${u.range}`, textStyle(9, COL.G3)).setOrigin(0, 0);
    c.add(stat2);
    y += 12;

    // Ridge crossing capability (INF only)
    const canRidge = u.type === 'INF';
    const ridgeStr = canRidge ? 'RIDGE: CAN CROSS' : 'RIDGE: BLOCKED';
    const ridgeCol = canRidge ? COL.G3 : COL.G4;
    const ridgeTxt = this.add.text(r.x + 10, y, ridgeStr, textStyle(9, ridgeCol)).setOrigin(0, 0);
    c.add(ridgeTxt);

    this.leftPanel.add(c);
    this.selectedInfoContainer = c;
  }

  private showOgreDetail(): void {
    this.selectedInfoContainer?.destroy();
    this.selectedInfoContainer = undefined;
    this.selectedUnitData = null;
    this.selectedIsOgre = true;

    const r = this.layout.leftPanel;
    if (r.w === 0) return;

    const PANEL_H = 180;
    const y0 = r.y + r.h - PANEL_H;

    const c = this.add.container(0, 0);

    const sepG = this.add.graphics();
    sepG.lineStyle(1, HEX.BDR, 1);
    sepG.lineBetween(r.x + 8, y0, r.x + r.w - 8, y0);
    c.add(sepG);

    const bgG = this.add.graphics();
    bgG.fillStyle(0x0A140A, 0.85);
    bgG.fillRect(r.x + 1, y0 + 1, r.w - 2, PANEL_H - 2);
    c.add(bgG);

    let y = y0 + 6;
    const hdr = this.add.text(r.x + 10, y, 'SELECTED UNIT', textStyle(9, COL.G4)).setOrigin(0, 0);
    hdr.setLetterSpacing(2);
    c.add(hdr);
    y += 14;

    // OGRE icon
    const ix = r.x + 10;
    const iy = y;
    const iconG = this.add.graphics();
    iconG.lineStyle(1, HEX.G, 1);
    iconG.strokeRect(ix, iy, 36, 36);
    c.add(iconG);
    if (this.textures.exists('ogre_mk3_crt')) {
      const img = this.add.image(ix + 18, iy + 18, 'ogre_mk3_crt').setDisplaySize(32, 32).setTint(HEX.G);
      c.add(img);
    } else {
      c.add(this.add.text(ix + 18, iy + 18, 'OGRE', textStyle(9, COL.G)).setOrigin(0.5));
    }

    const nameTxt = this.add.text(ix + 44, iy, 'OGRE MK.III', textStyle(10, COL.G)).setOrigin(0, 0);
    nameTxt.setLetterSpacing(1);
    applyGlow(nameTxt, COL.G2, 4);
    c.add(nameTxt);

    const posTxt = this.add.text(
      ix + 44, iy + 14,
      `POS: (${String(this.ogreCol).padStart(2, '0')},${String(this.ogreRow).padStart(2, '0')})`,
      textStyle(9, COL.G4),
    ).setOrigin(0, 0);
    c.add(posTxt);

    const mv = OGRE_MOVEMENT_TABLE.find(b => this.currentTreads >= b.treadMin && this.currentTreads <= b.treadMax)?.movement ?? 0;
    const mvLbl = mv >= 3 ? 'M3' : mv === 2 ? 'M2' : mv === 1 ? 'M1' : 'M0';
    const tTxt = this.add.text(
      ix + 44, iy + 26,
      `TREADS: ${this.currentTreads}/${this.maxTreads}  MOVE: ${mvLbl}`,
      textStyle(9, COL.G3),
    ).setOrigin(0, 0);
    c.add(tTxt);

    y += 44;

    const midDiv = this.add.graphics();
    midDiv.lineStyle(1, HEX.BDR2, 1);
    midDiv.lineBetween(r.x + 10, y, r.x + r.w - 10, y);
    c.add(midDiv);
    y += 4;

    // Weapon summary lines (live remaining counts)
    const main = this.weapons.find(w => w.type === 'main');
    const sec  = this.weapons.find(w => w.type === 'secondary');
    const ap   = this.weapons.find(w => w.type === 'ap');
    const msl  = this.weapons.find(w => w.type === 'missile');

    const w1 = this.add.text(
      r.x + 10, y,
      `WEAPONS: MAIN x${main?.remaining ?? 0}  SEC x${sec?.remaining ?? 0}`,
      textStyle(9, COL.G3),
    ).setOrigin(0, 0);
    c.add(w1);
    y += 12;

    const w2 = this.add.text(
      r.x + 10, y,
      `         MSL x${msl?.remaining ?? 0}  AP x${ap?.remaining ?? 0}`,
      textStyle(9, COL.G3),
    ).setOrigin(0, 0);
    c.add(w2);
    y += 14;

    const hint = this.add.text(r.x + 10, y, 'SEE RIGHT PANEL ->', textStyle(8, COL.G4)).setOrigin(0, 0);
    hint.setLetterSpacing(1);
    c.add(hint);

    this.leftPanel.add(c);
    this.selectedInfoContainer = c;
  }

  // ==========================================================================
  // RELAYOUT (resize)
  // ==========================================================================
  private relayout(): void {
    this.leftPanel?.destroy();
    this.rightPanel?.destroy();
    this.bottomBar?.destroy();
    this.cpBlinkTween?.stop();
    this.layout = LayoutManager.getPanels(this.scale.width, this.scale.height);
    this.weaponPips = [];
    this.unitRows = [];
    this.fireButtons = [];
    this.actionButtons = [];
    this.combatLogTexts = [];
    this.selectedInfoContainer = undefined;  // destroyed with leftPanel
    this.buildLeftPanel();
    this.buildRightPanel();
    this.buildBottomBar();
    this.refreshActionButtons();
    this.refreshHint();
    this.refreshCombatLog();
    // Restore detail panel after relayout if a unit was selected
    if (this.selectedUnitData) {
      const u = this.unitList.find(x => x.id === this.selectedUnitData!.id);
      if (u) this.showUnitDetail(u);
    } else if (this.selectedIsOgre) {
      this.showOgreDetail();
    }
  }
}
