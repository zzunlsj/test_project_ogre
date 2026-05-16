// ============================================================================
// BootScene — minimal init, hands off to PreloadScene
// ============================================================================
import Phaser from 'phaser';
import { LayoutManager } from '@/ui/LayoutManager';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'boot' });
  }

  create(): void {
    // Initialize registry slots
    this.registry.set('gameMode', null);
    this.registry.set('playerSide', null);
    this.registry.set('aiLevel', 'easy');

    const layout = LayoutManager.detect(this.scale.width, this.scale.height);
    this.registry.set('deviceLayout', layout);

    this.scene.start('preload');
  }
}
