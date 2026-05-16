// ============================================================================
// CombatPopup.ts — combat resolution result popup
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, RESULT_COLOR } from './CRTTheme';
import type { CombatResult } from '@/types';

const RESULT_LABEL: Record<string, string> = {
  NE: 'NO EFFECT',
  D: 'DISABLED',
  X: 'DESTROYED',
};

export class CombatPopup extends Phaser.GameObjects.Container {
  private bg!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private vsText!: Phaser.GameObjects.Text;
  private rollText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  private readonly W = 420;
  private readonly H = 180;

  constructor(scene: Phaser.Scene) {
    super(scene, scene.scale.width / 2, scene.scale.height / 2);
    this.setDepth(6000);
    this.setVisible(false);
    scene.add.existing(this);

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.headerText = scene.add
      .text(0, -this.H / 2 + 22, 'COMBAT RESULT', textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(this.headerText, CRT.AMBER, 8);
    this.add(this.headerText);

    this.vsText = scene.add
      .text(0, -this.H / 2 + 56, '', textStyle(FONT.SIZES.M, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(this.vsText, CRT.GREEN);
    this.add(this.vsText);

    this.rollText = scene.add
      .text(0, -this.H / 2 + 86, '', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
    this.add(this.rollText);

    this.resultText = scene.add
      .text(0, this.H / 2 - 38, '', textStyle(FONT.SIZES.XL, CRT.GREEN))
      .setOrigin(0.5);
    this.add(this.resultText);

    this.drawBg();
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

  show(result: CombatResult, targetName: string): void {
    const d = result.declaration;
    this.vsText.setText(`ATK ${d.totalAtk}  vs  DEF ${d.totalDef}   ->   ${d.ratio}`);
    const sign = result.bias >= 0 ? '+' : '';
    this.rollText.setText(
      `ROLL [${result.roll}]  BIAS ${sign}${result.bias.toFixed(2)}  -> [${result.finalRoll}]   TARGET: ${targetName}`,
    );

    const color = RESULT_COLOR[result.result] ?? CRT.GREEN;
    this.resultText
      .setText(`>>> ${RESULT_LABEL[result.result]} <<<`)
      .setColor(color);
    applyGlow(this.resultText, color, 12);

    this.setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2);
    this.setVisible(true);
    this.setAlpha(0);
    this.setScale(0.94);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    // Auto-hide after 2 seconds
    this.scene.time.delayedCall(2000, () => this.hide());
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeIn',
      onComplete: () => this.setVisible(false),
    });
  }
}
