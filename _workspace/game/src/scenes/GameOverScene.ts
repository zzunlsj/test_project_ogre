// ============================================================================
// GameOverScene — match summary + replay buttons
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette, blink, pulseGlow } from '@/ui/CRTTheme';

interface GameOverData {
  winner?: 'ogre' | 'defender';
  reason?: string;
  turns?: number;
  ogreWeaponsLeft?: number;
  defendersLost?: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'gameover' });
  }

  init(data: GameOverData): void {
    (this as any)._data = data ?? {};
  }

  create(): void {
    const data = ((this as any)._data ?? {}) as GameOverData;
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(400, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    const winner = data.winner ?? 'defender';
    const winColor = winner === 'ogre' ? CRT.RED : CRT.AMBER;

    const big = this.add
      .text(w / 2, h / 2 - 80, winner === 'ogre' ? 'OGRE VICTORY' : 'DEFENDER VICTORY', textStyle(FONT.SIZES.TITLE, winColor))
      .setOrigin(0.5);
    applyGlow(big, winColor, 22);
    pulseGlow(this, big, 14, 28, 1100);

    const reason = this.add
      .text(w / 2, h / 2 - 24, data.reason ?? '', textStyle(FONT.SIZES.M, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(reason, CRT.GREEN, 6);

    // Stats panel
    const px = w / 2 - 200;
    const py = h / 2 + 10;
    const pw = 400;
    const ph = 120;
    const panel = this.add.graphics();
    panel.fillStyle(CRT.BG_PANEL_HEX, 1);
    panel.fillRect(px, py, pw, ph);
    panel.lineStyle(1, CRT.BORDER_HEX, 1);
    panel.strokeRect(px, py, pw, ph);

    const lines = [
      `TURNS ELAPSED      ${data.turns ?? '-'}`,
      `OGRE WEAPONS LEFT  ${data.ogreWeaponsLeft ?? '-'}`,
      `DEFENDERS LOST     ${data.defendersLost ?? '-'}`,
    ];
    lines.forEach((line, i) => {
      this.add.text(px + 20, py + 20 + i * 24, line, textStyle(FONT.SIZES.M, CRT.GREEN));
    });

    // Buttons
    const retry = this.add
      .text(w / 2 - 90, h - 90, '[ RETRY ]', textStyle(FONT.SIZES.L, CRT.GREEN))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyGlow(retry, CRT.GREEN, 10);
    retry.on('pointerover', () => retry.setColor(CRT.AMBER));
    retry.on('pointerout', () => retry.setColor(CRT.GREEN));
    retry.on('pointerdown', () => {
      this.cameras.main.fadeOut(280, 7, 12, 7);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('setup'));
    });

    const menu = this.add
      .text(w / 2 + 90, h - 90, '[ MAIN MENU ]', textStyle(FONT.SIZES.L, CRT.GREEN))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyGlow(menu, CRT.GREEN, 10);
    menu.on('pointerover', () => menu.setColor(CRT.AMBER));
    menu.on('pointerout', () => menu.setColor(CRT.GREEN));
    menu.on('pointerdown', () => {
      this.cameras.main.fadeOut(280, 7, 12, 7);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('mainmenu'));
    });

    const hint = this.add
      .text(w / 2, h - 40, 'ENTER = RETRY    ESC = MENU', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
    blink(this, hint, 1100, 0.4);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.scene.start('setup'));
      this.input.keyboard.on('keydown-SPACE', () => this.scene.start('setup'));
      this.input.keyboard.on('keydown-ESC', () => this.scene.start('mainmenu'));
    }
  }
}
