// ============================================================================
// TitleScene — Apple II boot-style typing intro
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, glowTextStyle, applyGlow, blink, addScanlines, addVignette } from '@/ui/CRTTheme';

const BOOT_LINES = [
  'COMBINE MILITARY TACTICAL SYS v3.14',
  'COPYRIGHT 1991 SJG.',
  '',
  'MEMORY...... 64K   OK',
  'CRT MODULE.. ONLINE',
  'HEX GRID.... LOADED',
  'AI CORE..... READY',
  '',
  'BOOT COMPLETE.',
  '',
];

export class TitleScene extends Phaser.Scene {
  private linesShown: string[] = [];
  private currentLine = 0;
  private currentChar = 0;
  private typingTimer?: Phaser.Time.TimerEvent;
  private bootText?: Phaser.GameObjects.Text;
  private titleText?: Phaser.GameObjects.Text;
  private startText?: Phaser.GameObjects.Text;
  private interactive = false;

  constructor() {
    super({ key: 'title' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    const w = this.scale.width;
    const h = this.scale.height;

    addScanlines(this);
    addVignette(this);

    this.bootText = this.add.text(40, 30, '', textStyle(FONT.SIZES.S, CRT.GREEN_DIM));
    applyGlow(this.bootText, CRT.GREEN, 4);

    // Reset
    this.linesShown = [];
    this.currentLine = 0;
    this.currentChar = 0;
    this.interactive = false;

    this.typingTimer = this.time.addEvent({
      delay: 18,
      callback: () => this.tickType(),
      loop: true,
    });

    // Pre-build (hidden) title artwork
    this.titleText = this.add
      .text(w / 2, h / 2 - 20, 'O G R E', glowTextStyle(FONT.SIZES.TITLE, CRT.GREEN, 20))
      .setOrigin(0.5)
      .setAlpha(0);

    const sub = this.add
      .text(w / 2, h / 2 + 36, 'MARK III SCENARIO', textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(0.5)
      .setAlpha(0);
    applyGlow(sub, CRT.AMBER, 8);
    (sub as any)._isSub = true;

    this.startText = this.add
      .text(w / 2, h - 80, '[ PRESS ANY KEY ]', textStyle(FONT.SIZES.M, CRT.GREEN))
      .setOrigin(0.5)
      .setAlpha(0);
    applyGlow(this.startText, CRT.GREEN, 10);

    // Hide refs for later reveal
    (this as any)._sub = sub;

    // Input bindings
    this.input.on('pointerdown', () => this.advance());
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown', () => this.advance());
    }
  }

  private tickType(): void {
    if (this.currentLine >= BOOT_LINES.length) {
      this.typingTimer?.remove();
      this.typingTimer = undefined;
      this.revealTitle();
      return;
    }
    const line = BOOT_LINES[this.currentLine];
    if (this.currentChar > line.length) {
      this.linesShown.push(line);
      this.currentLine++;
      this.currentChar = 0;
      // Delay between lines
      this.typingTimer?.remove();
      this.typingTimer = this.time.delayedCall(80, () => {
        this.typingTimer = this.time.addEvent({
          delay: 18,
          callback: () => this.tickType(),
          loop: true,
        });
      });
      return;
    }
    const partial = line.substring(0, this.currentChar);
    const display = [...this.linesShown, partial + '_'].join('\n');
    this.bootText?.setText(display);
    this.currentChar++;
  }

  private revealTitle(): void {
    if (!this.titleText || !this.startText) return;
    const sub = (this as any)._sub as Phaser.GameObjects.Text;

    this.tweens.add({ targets: this.titleText, alpha: 1, duration: 600, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 300 });
    this.tweens.add({
      targets: this.startText,
      alpha: 1,
      duration: 400,
      delay: 800,
      onComplete: () => {
        if (this.startText) blink(this, this.startText, 700, 0.15);
        this.interactive = true;
      },
    });

    // Fade boot text down
    this.tweens.add({ targets: this.bootText, alpha: 0.35, duration: 600, delay: 200 });
  }

  private advance(): void {
    if (!this.interactive) {
      // Skip typing animation
      if (this.typingTimer) {
        this.typingTimer.remove();
        this.typingTimer = undefined;
        this.linesShown = [...BOOT_LINES];
        this.bootText?.setText(this.linesShown.join('\n'));
        this.revealTitle();
      }
      return;
    }
    this.cameras.main.fadeOut(280, 7, 12, 7);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('mainmenu'));
  }
}
