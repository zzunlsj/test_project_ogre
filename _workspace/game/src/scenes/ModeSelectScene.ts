// ============================================================================
// ModeSelectScene — choose 1P vs AI or 2P local
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette } from '@/ui/CRTTheme';
import type { GameMode } from '@/types';

interface Choice {
  label: string;
  desc: string;
  action: () => void;
}

export class ModeSelectScene extends Phaser.Scene {
  private choices: Choice[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private cursor = 0;

  constructor() {
    super({ key: 'modeselect' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(220, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    const header = this.add
      .text(w / 2, 90, 'SELECT MODE', textStyle(FONT.SIZES.XL, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(header, CRT.AMBER, 12);

    this.choices = [
      {
        label: '1 PLAYER  vs  AI',
        desc: 'PLAY AGAINST AI (EASY).\nCHOOSE OGRE OR DEFENDER.',
        action: () => this.pick('solo-ogre'),
      },
      {
        label: '2 PLAYERS  LOCAL',
        desc: 'HOTSEAT MULTIPLAYER.\nP1 = OGRE  /  P2 = DEFENDER.',
        action: () => this.pick('versus'),
      },
    ];

    const cardW = 320;
    const cardH = 200;
    const gap = 40;
    const totalW = cardW * 2 + gap;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h / 2 + 10;

    this.choices.forEach((ch, i) => {
      const cx = startX + i * (cardW + gap);
      const card = this.makeCard(cx, cy, cardW, cardH, ch);
      this.cards.push(card);
    });

    this.setCursor(0);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-LEFT', () => this.move(-1));
      this.input.keyboard.on('keydown-RIGHT', () => this.move(1));
      this.input.keyboard.on('keydown-A', () => this.move(-1));
      this.input.keyboard.on('keydown-D', () => this.move(1));
      this.input.keyboard.on('keydown-ENTER', () => this.activate());
      this.input.keyboard.on('keydown-SPACE', () => this.activate());
      this.input.keyboard.on('keydown-ESC', () => this.scene.start('mainmenu'));
    }

    const back = this.add
      .text(40, h - 40, '< BACK', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('mainmenu'));
  }

  private makeCard(cx: number, cy: number, w: number, h: number, ch: Choice): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const bg = this.add.graphics();
    bg.fillStyle(CRT.BG_PANEL_HEX, 1);
    bg.fillRect(-w / 2, -h / 2, w, h);
    bg.lineStyle(1, CRT.BORDER_HEX, 1);
    bg.strokeRect(-w / 2, -h / 2, w, h);
    c.add(bg);

    const lbl = this.add
      .text(0, -h / 2 + 32, ch.label, textStyle(FONT.SIZES.L, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(lbl, CRT.GREEN, 8);
    c.add(lbl);

    const desc = this.add
      .text(0, 0, ch.desc, {
        ...textStyle(FONT.SIZES.S, CRT.GREEN_DIM),
        align: 'center',
        wordWrap: { width: w - 30 },
      })
      .setOrigin(0.5);
    c.add(desc);

    const hit = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    c.add(hit);

    hit.on('pointerover', () => {
      const idx = this.cards.indexOf(c);
      if (idx >= 0) this.setCursor(idx);
    });
    hit.on('pointerdown', () => ch.action());

    (c as any)._bg = bg;
    (c as any)._lbl = lbl;
    return c;
  }

  private setCursor(i: number): void {
    this.cursor = (i + this.choices.length) % this.choices.length;
    this.cards.forEach((card, idx) => {
      const sel = idx === this.cursor;
      const bg = (card as any)._bg as Phaser.GameObjects.Graphics;
      const lbl = (card as any)._lbl as Phaser.GameObjects.Text;
      bg.clear();
      bg.fillStyle(sel ? CRT.GREEN_DEEP_HEX : CRT.BG_PANEL_HEX, sel ? 0.6 : 1);
      bg.fillRect(-160, -100, 320, 200);
      bg.lineStyle(sel ? 2 : 1, sel ? CRT.AMBER_HEX : CRT.BORDER_HEX, 1);
      bg.strokeRect(-160, -100, 320, 200);
      lbl.setColor(sel ? CRT.AMBER : CRT.GREEN);
      applyGlow(lbl, sel ? CRT.AMBER : CRT.GREEN, sel ? 14 : 6);
    });
  }

  private move(dir: number): void {
    this.setCursor(this.cursor + dir);
  }

  private activate(): void {
    this.choices[this.cursor]?.action();
  }

  private pick(kind: 'solo-ogre' | 'versus'): void {
    if (kind === 'versus') {
      this.registry.set('gameMode', 'versus' as GameMode);
      this.registry.set('playerSide', null);
      this.cameras.main.fadeOut(220, 7, 12, 7);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('briefing'));
    } else {
      // Solo — go to side select to choose OGRE or DEFENDER
      this.cameras.main.fadeOut(220, 7, 12, 7);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('sideselect'));
    }
  }
}
