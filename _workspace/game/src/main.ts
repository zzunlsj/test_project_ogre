// ============================================================================
// Main entry - Phaser game bootstrap
// ============================================================================

import Phaser from 'phaser';
import { BootScene }       from '@/scenes/BootScene';
import { PreloadScene }    from '@/scenes/PreloadScene';
import { TitleScene }      from '@/scenes/TitleScene';
import { MainMenuScene }   from '@/scenes/MainMenuScene';
import { ModeSelectScene } from '@/scenes/ModeSelectScene';
import { SideSelectScene } from '@/scenes/SideSelectScene';
import { BriefingScene }   from '@/scenes/BriefingScene';
import { SetupScene }      from '@/scenes/SetupScene';
import { GameScene }       from '@/scenes/GameScene';
import { UIScene }         from '@/scenes/UIScene';
import { GameOverScene }   from '@/scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#070C07',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    MainMenuScene,
    ModeSelectScene,
    SideSelectScene,
    BriefingScene,
    SetupScene,
    GameScene,
    UIScene,
    GameOverScene,
  ],
};

export const game = new Phaser.Game(config);
