// ============================================================================
// DiceGauge.ts — wave hold gauge for combat dice timing
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow } from './CRTTheme';
import type { CrtRatioKey, WaveSpeed, DiceHoldResult, CrtResult } from '@/types';
import { COMBAT_TABLE } from '@/data/constants';

export interface DiceGaugeShowOptions {
  ratio: CrtRatioKey;
  atk: number;
  def: number;
  speed?: WaveSpeed;
  onHold: (result: DiceHoldResult) => void;
}

/**
 * CRT-style horizontal wave gauge. A vertical indicator oscillates left-right
 * along a sinusoidal path. Player taps/clicks/presses SPACE to lock; the locked
 * wave value maps to a -0.3..+0.3 bias added to the d6 roll.
 *
 * Visual zones (color-coded across the bar background):
 *   left  third (0.00-0.33) → GREEN  (NE-favoring bias)
 *   middle third (0.33-0.66) → AMBER  (D-favoring)
 *   right third (0.66-1.00) → RED    (X-favoring)
 *
 * Wave SPEED hints (no color change, only oscillation rate):
 *   slow=0.8x  normal=1.0x  fast=1.2x
 */
export class DiceGauge extends Phaser.GameObjects.Container {
  private bg!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Graphics;
  private indicator!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private ratioText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Rectangle;
  private rollBtn?: Phaser.GameObjects.Text;
  private rollBtnBg?: Phaser.GameObjects.Graphics;
  private rollBtnHit?: Phaser.GameObjects.Rectangle;

  private elapsed = 0;
  private locked = false;
  private active = false;
  private opts?: DiceGaugeShowOptions;
  private startTime = 0;

  // Geometry
  private readonly W = 480;
  private readonly H = 220;
  private readonly BAR_X = 30;
  private readonly BAR_Y = 110;
  private readonly BAR_W = 420;
  private readonly BAR_H = 36;

  // Wave parameters
  private baseFreqHz = 0.7; // full traversals per second
  private speedMultiplier = 1.0;

  constructor(scene: Phaser.Scene) {
    super(scene, scene.scale.width / 2, scene.scale.height / 2);
    this.setDepth(5000);
    this.setVisible(false);
    scene.add.existing(this);

    this.build();
    this.bindInput();
  }

  private build(): void {
    const scene = this.scene;

    // Full-screen darkening overlay (input blocker)
    this.overlay = scene.add
      .rectangle(0, 0, scene.scale.width * 2, scene.scale.height * 2, 0x000000, 0.6)
      .setOrigin(0.5);
    this.overlay.setInteractive();
    this.add(this.overlay);

    // Panel background
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.drawBg();

    // Header
    this.headerText = scene.add
      .text(0, -this.H / 2 + 24, 'COMBAT RESOLUTION', textStyle(FONT.SIZES.L, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(this.headerText, CRT.AMBER, 10);
    this.add(this.headerText);

    // Ratio / atk vs def
    this.ratioText = scene.add
      .text(0, -this.H / 2 + 56, '', textStyle(FONT.SIZES.M, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(this.ratioText, CRT.GREEN);
    this.add(this.ratioText);

    // Bar (zones) — drawn relative to container center
    this.bar = scene.add.graphics();
    this.add(this.bar);
    this.drawBar();

    // Indicator (vertical line)
    this.indicator = scene.add.graphics();
    this.add(this.indicator);

    // Hint text (PRESS ROLL / locked / outcome)
    this.hintText = scene.add
      .text(0, -this.H / 2 + 78, 'PRESS [ROLL DICE] TO RESOLVE', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
    applyGlow(this.hintText, CRT.GREEN, 6);
    this.add(this.hintText);

    // Result text (hidden initially) — moved up to avoid overlap with ROLL btn
    this.resultText = scene.add
      .text(0, this.H / 2 - 64, '', textStyle(FONT.SIZES.S, CRT.GREEN))
      .setOrigin(0.5);
    this.add(this.resultText);

    // ROLL DICE button (bottom of panel)
    this.buildRollBtn();
  }

  private buildRollBtn(): void {
    const scene = this.scene;
    const bw = 160, bh = 36;
    const by = this.H / 2 - bh - 14;

    this.rollBtnBg = scene.add.graphics();
    this.drawRollBtnBg(false);
    this.add(this.rollBtnBg);

    this.rollBtn = scene.add
      .text(0, by + bh / 2, '▶ ROLL DICE',
        { fontFamily: FONT.MONO, fontSize: '14px', color: CRT.GREEN, fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5);
    applyGlow(this.rollBtn, CRT.GREEN, 6);
    this.add(this.rollBtn);

    // Hit area (rectangle for cleaner click handling)
    this.rollBtnHit = scene.add
      .rectangle(0, by + bh / 2, bw, bh, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.add(this.rollBtnHit);

    this.rollBtnHit.on('pointerover', () => {
      if (this.locked || !this.active) return;
      this.rollBtn?.setColor(CRT.AMBER);
      applyGlow(this.rollBtn!, CRT.AMBER, 10);
      this.drawRollBtnBg(true);
    });
    this.rollBtnHit.on('pointerout', () => {
      if (this.locked || !this.active) return;
      this.rollBtn?.setColor(CRT.GREEN);
      applyGlow(this.rollBtn!, CRT.GREEN, 6);
      this.drawRollBtnBg(false);
    });
    this.rollBtnHit.on('pointerdown', () => {
      if (!this.locked && this.active) this.handleHold();
    });
  }

  private drawRollBtnBg(hover: boolean): void {
    if (!this.rollBtnBg) return;
    const bw = 160, bh = 36;
    const bx = -bw / 2;
    const by = this.H / 2 - bh - 14;
    const g = this.rollBtnBg;
    g.clear();
    if (hover) {
      g.fillStyle(0x2A5A2A, 1);
    } else {
      g.fillStyle(0x1A3A1A, 1);
    }
    g.fillRect(bx, by, bw, bh);
    g.lineStyle(2, hover ? CRT.AMBER_HEX : CRT.GREEN_HEX, 1);
    g.strokeRect(bx, by, bw, bh);
  }

  private drawBg(): void {
    const g = this.bg;
    const x = -this.W / 2;
    const y = -this.H / 2;
    g.clear();
    g.fillStyle(CRT.BG_HEX, 0.96);
    g.fillRect(x, y, this.W, this.H);
    g.lineStyle(2, CRT.BORDER_HEX, 1);
    g.strokeRect(x, y, this.W, this.H);
    g.lineStyle(1, CRT.GREEN_DEEP_HEX, 0.6);
    g.strokeRect(x + 4, y + 4, this.W - 8, this.H - 8);
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    const bx = -this.W / 2 + this.BAR_X;
    const by = -this.H / 2 + this.BAR_Y;

    // Three colored zones
    const third = this.BAR_W / 3;
    g.fillStyle(CRT.GREEN_DARK_HEX, 0.55);
    g.fillRect(bx, by, third, this.BAR_H);
    g.fillStyle(CRT.AMBER_HEX, 0.40);
    g.fillRect(bx + third, by, third, this.BAR_H);
    g.fillStyle(CRT.RED_HEX, 0.45);
    g.fillRect(bx + 2 * third, by, third, this.BAR_H);

    // Bar border
    g.lineStyle(1, CRT.BORDER_HEX, 1);
    g.strokeRect(bx, by, this.BAR_W, this.BAR_H);

    // Zone labels (NE / D / X) along top of bar
    // Drawn via text would re-add each tick — use small graphics ticks instead
    g.lineStyle(1, CRT.GREEN_DEEP_HEX, 1);
    g.lineBetween(bx + third, by, bx + third, by + this.BAR_H);
    g.lineBetween(bx + 2 * third, by, bx + 2 * third, by + this.BAR_H);
  }

  private bindInput(): void {
    // Overlay only blocks clicks-through; SPACE/ENTER/overlay click no longer holds.
    // Player must click the explicit [ROLL DICE] button.
    this.overlay.on('pointerdown', () => { /* swallow input */ });
  }

  show(opts: DiceGaugeShowOptions): void {
    this.opts = opts;
    this.active = true;
    this.locked = false;
    this.elapsed = 0;
    this.startTime = this.scene.time.now;

    // Speed multiplier (0.8 / 1.0 / 1.2)
    const speed: WaveSpeed = opts.speed ?? 'normal';
    this.speedMultiplier = speed === 'slow' ? 0.8 : speed === 'fast' ? 1.2 : 1.0;

    this.ratioText.setText(`ATK ${opts.atk}  vs  DEF ${opts.def}   ->   RATIO ${opts.ratio}`);
    this.hintText.setText('PRESS [ROLL DICE] TO RESOLVE').setColor(CRT.GREEN_DIM);
    this.resultText.setText('').setColor(CRT.GREEN);

    // Reset ROLL button to enabled style
    this.rollBtn?.setVisible(true).setColor(CRT.GREEN).setAlpha(1);
    applyGlow(this.rollBtn!, CRT.GREEN, 6);
    this.rollBtnHit?.setVisible(true);
    this.drawRollBtnBg(false);

    // Reposition for current screen
    this.setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2);
    this.overlay.setSize(this.scene.scale.width * 2, this.scene.scale.height * 2);

    this.setVisible(true);
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 220,
      ease: 'Sine.easeOut',
    });

    this.drawIndicator(0);
  }

  hide(): void {
    this.active = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 220,
      ease: 'Sine.easeIn',
      onComplete: () => this.setVisible(false),
    });
  }

  /** Update is invoked from the parent scene's update loop. */
  tick(_time: number, delta: number): void {
    if (!this.active || this.locked) return;
    this.elapsed += delta;
    // 0..1 sin progress
    const t = (this.elapsed / 1000) * this.baseFreqHz * this.speedMultiplier;
    const sin = Math.sin(t * Math.PI * 2); // -1..+1
    const norm = (sin + 1) / 2; // 0..1
    this.drawIndicator(norm);

    // Pulse hint glow
    const pulse = 6 + Math.abs(sin) * 6;
    this.hintText.setShadow(0, 0, this.hintText.style.color as string, pulse, false, true);
  }

  private drawIndicator(norm: number): void {
    const g = this.indicator;
    g.clear();
    const bx = -this.W / 2 + this.BAR_X;
    const by = -this.H / 2 + this.BAR_Y;
    const x = bx + norm * this.BAR_W;
    // Vertical line through bar
    g.lineStyle(3, CRT.GREEN_HEX, 1);
    g.lineBetween(x, by - 14, x, by + this.BAR_H + 14);
    // Triangle marker on top
    g.fillStyle(CRT.GREEN_HEX, 1);
    g.fillTriangle(x - 6, by - 18, x + 6, by - 18, x, by - 8);
  }

  private handleHold(): void {
    if (!this.active || this.locked || !this.opts) return;
    this.locked = true;

    // Resolve wave value at lock
    const t = (this.elapsed / 1000) * this.baseFreqHz * this.speedMultiplier;
    const waveValue = Math.sin(t * Math.PI * 2); // -1..+1
    const norm = (waveValue + 1) / 2; // 0..1

    // Map norm into bias -0.3..+0.3
    const bias = (norm - 0.5) * 0.6;

    // Roll the d6
    const roll = Phaser.Math.Between(1, 6);
    const finalRoll = Phaser.Math.Clamp(Math.round(roll + bias), 1, 6);

    // Lookup CRT result type for spin coloring
    const row = COMBAT_TABLE[this.opts.ratio];
    const resultType: CrtResult = row ? row[finalRoll - 1] : 'NE';

    const holdTime = this.scene.time.now - this.startTime;

    const result: DiceHoldResult = {
      holdTime,
      waveValue,
      bias,
      roll,
    };

    // Dim ROLL button (locked)
    this.rollBtn?.setColor(CRT.GREEN_DEEP).setAlpha(0.4);
    this.rollBtn?.setShadow(0, 0, CRT.GREEN_DEEP, 0, false, false);
    this.rollBtnHit?.disableInteractive();
    if (this.rollBtnBg) {
      this.rollBtnBg.clear();
      this.rollBtnBg.lineStyle(1, CRT.BORDER_HEX, 1);
      const bw = 160, bh = 36;
      this.rollBtnBg.strokeRect(-bw / 2, this.H / 2 - bh - 14, bw, bh);
    }

    // Visual feedback: flash bar & freeze indicator
    this.flashLock(norm);
    this.hintText.setText(`LOCKED  HOLD ${(holdTime / 1000).toFixed(2)}s`).setColor(CRT.AMBER);

    // Spin number then fire callback
    this.showSpinResult(finalRoll, resultType, () => {
      this.opts?.onHold(result);
    });
  }

  private showSpinResult(finalRoll: number, resultType: CrtResult, onDone: () => void): void {
    const RESULT_COLOR: Record<CrtResult, string> = {
      NE: CRT.GREEN,
      D:  CRT.AMBER,
      X:  CRT.RED,
    };

    const spinEl = this.scene.add.text(
      0, this.H / 2 - 100, '?',
      { fontFamily: FONT.MONO, fontSize: '48px', color: '#FFFFFF', fontStyle: 'bold', resolution: 2 },
    ).setOrigin(0.5);
    spinEl.setShadow(0, 0, '#AAFFAA', 12, false, true);
    this.add(spinEl);
    // Re-bring rollBtn above? Spin is on top of result row only; fine.

    const intervals = [40, 40, 50, 60, 80, 100, 140, 180, 220];
    let idx = 0;
    const spin = () => {
      if (idx < intervals.length - 1) {
        spinEl.setText(String(Math.floor(Math.random() * 6) + 1));
        spinEl.setColor('#AAFFAA');
        spinEl.setShadow(0, 0, '#AAFFAA', 10, false, true);
        this.scene.time.delayedCall(intervals[idx], spin);
        idx++;
      } else {
        // Final number
        const color = RESULT_COLOR[resultType];
        spinEl.setText(String(finalRoll));
        spinEl.setColor(color);
        spinEl.setShadow(0, 0, color, 16, false, true);
        spinEl.setScale(1.4);
        this.scene.tweens.add({
          targets: spinEl,
          scale: 1.0,
          duration: 200,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.scene.time.delayedCall(600, () => {
              spinEl.destroy();
              onDone();
            });
          },
        });
      }
    };
    spin();
  }

  private flashLock(norm: number): void {
    const flash = this.scene.add.graphics();
    this.add(flash);
    const bx = -this.W / 2 + this.BAR_X;
    const by = -this.H / 2 + this.BAR_Y;
    const x = bx + norm * this.BAR_W;
    flash.fillStyle(CRT.WHITE === '#E0FFE0' ? 0xE0FFE0 : 0xFFFFFF, 1);
    flash.fillRect(x - 2, by - 16, 4, this.BAR_H + 32);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

}
