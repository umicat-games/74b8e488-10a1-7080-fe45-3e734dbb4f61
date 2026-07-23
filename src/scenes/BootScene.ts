import Phaser from 'phaser';
import { preloadManifest, getManifest, preloadRules } from '@umicat/phaser-sdk';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { applyFishData } from '../data/fish';

/**
 * BootScene — loads the scene-as-data manifest, then hands off to
 * GameScene with the manifest's initialScene.
 *
 * Per-scene assets are loaded lazily inside `loadWorldScene` (called
 * from GameScene), so this BootScene only loads the manifest itself.
 *
 * If the agent generates or imports image/audio assets, they are
 * declared in `scenes/manifest.json`'s `assets[]` table — NOT here.
 * The scene loader queues them via `this.load.*` on demand based on
 * which assetIds the active scene's entities reference.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    drawLoadingBar(this);
    preloadManifest(this);
    preloadRules(this);
    this.load.spritesheet('boat_sheet', 'uploaded/generated_cfowo_sheet.png', { frameWidth: 68, frameHeight: 68 });
    this.load.json('data-fish', 'data/fish.json');
  }

  create(): void {
    // Apply fish data table before game starts
    applyFishData(this.cache.json.get('data-fish'));

    // Register boat animation (must be in create, after texture is loaded)
    this.anims.create({
      key: 'boat_sail',
      frames: this.anims.generateFrameNumbers('boat_sheet', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });
    const manifest = getManifest(this);
    this.scene.start('GameScene', { sceneId: manifest.initialScene });
  }
}

function drawLoadingBar(scene: Phaser.Scene): void {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const barW = Math.min(480, GAME_WIDTH * 0.6);
  const barH = 24;

  const label = scene.add
    .text(cx, cy - 40, 'Loading...', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: '#ffffff',
    })
    .setOrigin(0.5);

  const track = scene.add
    .rectangle(cx, cy, barW, barH, 0x222222)
    .setStrokeStyle(2, 0xffffff);
  const fill = scene.add
    .rectangle(cx - barW / 2 + 2, cy, 0, barH - 4, 0xffffff)
    .setOrigin(0, 0.5);

  scene.load.on('progress', (value: number) => {
    fill.width = (barW - 4) * value;
  });
  scene.load.on('complete', () => {
    label.destroy();
    track.destroy();
    fill.destroy();
  });
}
