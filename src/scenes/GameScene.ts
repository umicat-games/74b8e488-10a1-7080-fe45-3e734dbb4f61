import Phaser from 'phaser';
import { getRule } from '@umicat/phaser-sdk';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

// ── Layout ──────────────────────────────────────────────
const RIVER_LEFT = 320;
const RIVER_RIGHT = 960;
const RIVER_MID_X = 640;
const RIVER_WIDTH = 640;
const PLAYER_MIN_Y = 140;
const PLAYER_MAX_Y = 620;
const PLAYER_RADIUS = 18;
const ROCK_RADIUS = 22;
const BIG_FISH_RADIUS = 26;
const SMALL_FISH_RADIUS = 14;

// ── Fish definitions ─────────────────────────────────────
const FISH_TYPES = [
  { name: '鲤鱼', color: 0xFF6600, finColor: 0xFF9900, belly: 0xFFCC88, heal: 15 },
  { name: '鳟鱼', color: 0x44AAFF, finColor: 0x66BBFF, belly: 0xCCDDFF, heal: 20 },
  { name: '金鱼', color: 0xFFDD00, finColor: 0xFFAA00, belly: 0xFFEE99, heal: 30 },
];

// ── Level configs ────────────────────────────────────────
interface LevelConfig {
  biome: 'grass' | 'forest' | 'snow' | 'fog';
  timeOfDay: 'day' | 'dusk' | 'night' | 'fog';
  scrollSpeed: number;
  rockInterval: number;
  smallFishInterval: number;
  bigFishInterval: number;
  length: number;
  waterTint: number;
  skyTop: number;
  skyBottom: number;
  overlayColor: number;
  overlayAlpha: number;
}

const LEVEL_CONFIGS: LevelConfig[] = [
  { biome: 'grass', timeOfDay: 'day',   scrollSpeed: 155, rockInterval: 3200, smallFishInterval: 1600, bigFishInterval: 7000, length: 9000,  waterTint: 0x5599ff, skyTop: 0x87CEEB, skyBottom: 0xB8E8F8, overlayColor: 0xffffff, overlayAlpha: 0 },
  { biome: 'forest', timeOfDay: 'dusk', scrollSpeed: 200, rockInterval: 2600, smallFishInterval: 1800, bigFishInterval: 5000, length: 11000, waterTint: 0x4477aa, skyTop: 0xE05A30, skyBottom: 0xF5A44A, overlayColor: 0xFF7744, overlayAlpha: 0.13 },
  { biome: 'snow',   timeOfDay: 'night',scrollSpeed: 250, rockInterval: 2200, smallFishInterval: 2200, bigFishInterval: 4000, length: 13000, waterTint: 0x3366aa, skyTop: 0x080820, skyBottom: 0x18184a, overlayColor: 0x080830, overlayAlpha: 0.38 },
  { biome: 'fog',    timeOfDay: 'fog',  scrollSpeed: 220, rockInterval: 2400, smallFishInterval: 2000, bigFishInterval: 4500, length: 11000, waterTint: 0x5588aa, skyTop: 0x8099aa, skyBottom: 0xb8c8d8, overlayColor: 0xc8d8e8, overlayAlpha: 0.22 },
];

// ── Obstacle record ──────────────────────────────────────
interface ObstacleObj {
  x: number; y: number;
  radius: number;
  type: 'rock' | 'bigfish' | 'smallfish';
  fishType: number;
  container: Phaser.GameObjects.Container;
  dead: boolean;
  vx: number;
  rockVariant: number;
  phase: number;
}

// ── Particle record ──────────────────────────────────────
interface Particle {
  g: Phaser.GameObjects.Graphics;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
}

type GameState = 'title' | 'playing' | 'levelcomplete' | 'gameover';

// ════════════════════════════════════════════════════════
export class GameScene extends Phaser.Scene {
  // ── State ──
  private state: GameState = 'title';
  private overlayActive = false;
  private levelCompleting = false;

  // ── Level ──
  private currentLevel = 0;
  private levelScrolled = 0;
  private levelConfig!: LevelConfig;
  private parallaxOffset = 0;

  // ── Player position ──
  private boatX = RIVER_MID_X;
  private boatY = 560;
  private boat!: Phaser.GameObjects.Container;
  private boatShadow!: Phaser.GameObjects.Graphics;

  // ── Rules ──
  private playerSpeed = 220;
  private maxHp = 100;
  private rockDamage = 15;
  private bigFishDamage = 20;
  private smallFishHeal = 25;
  private jumpDurationMs = 700;
  private jumpCooldownMs = 1000;
  private invincibilityMs = 1500;

  // ── Input ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private numKeys: Phaser.Input.Keyboard.Key[] = [];

  // ── HP & combat ──
  private hp = 100;
  private invincibleTimer = 0;
  private isJumping = false;
  private jumpCooldownTimer = 0;

  // ── Inventory (8 slots) ──
  private inventory: Array<{ type: number; count: number }> =
    Array.from({ length: 8 }, () => ({ type: -1, count: 0 }));

  // ── Obstacles ──
  private obstacles: ObstacleObj[] = [];
  private lastRockTime = 0;
  private lastSmallFishTime = 0;
  private lastBigFishTime = 0;

  // ── Score ──
  private score = 0;
  private totalScore = 0;

  // ── Background graphics ──
  private skyBg!: Phaser.GameObjects.Graphics;
  private bankLeft!: Phaser.GameObjects.Graphics;
  private bankRight!: Phaser.GameObjects.Graphics;
  private waterTile!: Phaser.GameObjects.TileSprite;
  private dayNightOverlay!: Phaser.GameObjects.Rectangle;

  // ── HUD ──
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private progressBarFill!: Phaser.GameObjects.Rectangle;
  private progressBoatIcon!: Phaser.GameObjects.Text;
  private invSlotBgs: Phaser.GameObjects.Rectangle[] = [];
  private invSlotIcons: Phaser.GameObjects.Graphics[] = [];
  private invSlotTexts: Phaser.GameObjects.Text[] = [];
  private levelText!: Phaser.GameObjects.Text;

  // ── Overlays ──
  private titleOverlay!: Phaser.GameObjects.Container;
  private levelCompleteOverlay!: Phaser.GameObjects.Container;
  private gameOverOverlay!: Phaser.GameObjects.Container;

  // ── Particles ──
  private particles: Particle[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  // ──────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────
  create(): void {
    // Read tunable rules
    this.playerSpeed       = getRule(this, 'balance.playerSpeed', 220);
    this.maxHp             = getRule(this, 'balance.startHp', 100);
    this.rockDamage        = getRule(this, 'balance.rockDamage', 15);
    this.bigFishDamage     = getRule(this, 'balance.bigFishDamage', 20);
    this.smallFishHeal     = getRule(this, 'balance.smallFishHeal', 25);
    this.jumpDurationMs    = getRule(this, 'balance.jumpDurationMs', 700);
    this.jumpCooldownMs    = getRule(this, 'balance.jumpCooldownMs', 1000);
    this.invincibilityMs   = getRule(this, 'balance.invincibilityMs', 1500);
    this.hp = this.maxHp;

    // Generate water texture
    this.generateWaterTexture();

    this.setupBackground();
    this.setupPlayer();
    this.setupInput();
    this.setupHUD();
    this.setupOverlays();

    // Show title screen with level-1 backdrop
    this.levelConfig = LEVEL_CONFIGS[0];
    this.drawBanks();
    this.waterTile.setTint(this.levelConfig.waterTint);
    this.showTitle();
  }

  // ──────────────────────────────────────────────────────
  // SETUP HELPERS
  // ──────────────────────────────────────────────────────
  private generateWaterTexture(): void {
    const wg = this.add.graphics();
    wg.fillStyle(0x1a6090, 1);
    wg.fillRect(0, 0, RIVER_WIDTH, 32);
    wg.lineStyle(1.5, 0x55aacc, 0.55);
    for (let x = 0; x < RIVER_WIDTH; x += 52) {
      wg.lineBetween(x, 7, x + 28, 7);
    }
    wg.lineStyle(1, 0x88bbdd, 0.35);
    for (let x = 24; x < RIVER_WIDTH; x += 52) {
      wg.lineBetween(x, 19, x + 18, 19);
    }
    wg.generateTexture('water', RIVER_WIDTH, 32);
    wg.destroy();
  }

  private setupBackground(): void {
    this.skyBg   = this.add.graphics().setDepth(0);
    this.bankLeft  = this.add.graphics().setDepth(1);
    this.bankRight = this.add.graphics().setDepth(1);
    this.waterTile = this.add.tileSprite(RIVER_MID_X, GAME_HEIGHT / 2, RIVER_WIDTH, GAME_HEIGHT, 'water').setDepth(2);
    // River edge strips
    const edges = this.add.graphics().setDepth(3);
    edges.fillStyle(0x2a4a20, 1);
    edges.fillRect(RIVER_LEFT - 7, 0, 7, GAME_HEIGHT);
    edges.fillRect(RIVER_RIGHT, 0, 7, GAME_HEIGHT);
    // Day/night tint overlay
    this.dayNightOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(55);
  }

  private setupPlayer(): void {
    this.boatShadow = this.add.graphics().setDepth(4);
    this.boat = this.add.container(this.boatX, this.boatY).setDepth(7);
    const bg = this.add.graphics();
    this.drawBoat(bg);
    this.boat.add(bg);
  }

  private setupInput(): void {
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const codes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
    ];
    this.numKeys = codes.map(c => this.input.keyboard!.addKey(c));
  }

  private setupHUD(): void {
    const hud = this.add.container(0, 0).setDepth(100);

    // HP bar
    const hpBorder = this.add.rectangle(105, 24, 204, 22, 0x000000).setOrigin(0, 0.5);
    hpBorder.setStrokeStyle(2, 0x555555);
    const hpBg = this.add.rectangle(105, 24, 200, 18, 0x330000).setOrigin(0, 0.5);
    this.hpBarFill = this.add.rectangle(105, 24, 200, 18, 0xee3333).setOrigin(0, 0.5);
    const hpIcon = this.add.text(16, 24, '♥', { fontSize: '16px', color: '#ff5555', fontFamily: 'serif' }).setOrigin(0, 0.5);
    hud.add([hpBorder, hpBg, this.hpBarFill, hpIcon]);

    // Level label (center top)
    this.levelText = this.add.text(GAME_WIDTH / 2, 24, 'LEVEL 1', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    hud.add(this.levelText);

    // Score (top right)
    this.scoreText = this.add.text(GAME_WIDTH - 16, 24, '0', {
      fontSize: '20px', color: '#ffee88', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5);
    hud.add(this.scoreText);

    // Progress bar (right edge, vertical)
    const BAR_Y = GAME_HEIGHT / 2;
    const BAR_H = 420;
    const BAR_X = GAME_WIDTH - 14;
    const pbBorder = this.add.rectangle(BAR_X, BAR_Y, 12, BAR_H + 4, 0x000000).setStrokeStyle(1, 0x555555);
    const pbBg = this.add.rectangle(BAR_X, BAR_Y, 8, BAR_H, 0x222222);
    this.progressBarFill = this.add.rectangle(BAR_X, BAR_Y + BAR_H / 2, 8, 0, 0x88ee44).setOrigin(0.5, 1);
    this.progressBoatIcon = this.add.text(BAR_X, BAR_Y + BAR_H / 2, '⛵', { fontSize: '11px' }).setOrigin(0.5, 1);
    hud.add([pbBorder, pbBg, this.progressBarFill, this.progressBoatIcon]);

    // Inventory slots (bottom bar)
    const SLOT = 52;
    const GAP  = 4;
    const totalW = 8 * SLOT + 7 * GAP;
    const sx0 = (GAME_WIDTH - totalW) / 2;
    const invY = GAME_HEIGHT - 34;

    for (let i = 0; i < 8; i++) {
      const cx = sx0 + i * (SLOT + GAP) + SLOT / 2;
      const shadow = this.add.rectangle(cx + 2, invY + 2, SLOT, SLOT, 0x000000, 0.3);
      const bg = this.add.rectangle(cx, invY, SLOT, SLOT, 0x3a2a1a).setStrokeStyle(2, 0x8a6a4a);
      const numT = this.add.text(cx - SLOT / 2 + 4, invY - SLOT / 2 + 4, `${i + 1}`, {
        fontSize: '10px', color: '#776655', fontFamily: 'monospace',
      }).setOrigin(0);
      const icon = this.add.graphics();
      icon.setPosition(cx, invY);
      const countT = this.add.text(cx + SLOT / 2 - 3, invY + SLOT / 2 - 3, '', {
        fontSize: '12px', color: '#ffdd88', fontFamily: 'monospace',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(1);
      hud.add([shadow, bg, numT, icon, countT]);
      this.invSlotBgs.push(bg);
      this.invSlotIcons.push(icon);
      this.invSlotTexts.push(countT);
    }
  }

  private setupOverlays(): void {
    // ── Title ──
    this.titleOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(200);
    const tBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72);
    const tTitle = this.add.text(0, -100, '河流漂流记', {
      fontSize: '62px', color: '#ffee88', fontFamily: 'serif',
      stroke: '#885500', strokeThickness: 5,
    }).setOrigin(0.5);
    const tSub = this.add.text(0, -24, 'River Drift', {
      fontSize: '24px', color: '#aaddff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    const tInstr = this.add.text(0, 48, '← → ↑ ↓  操控船       SPACE  跳跃\n  1–8  吃鱼回血    避开石头和大鱼', {
      fontSize: '17px', color: '#cccccc', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5);
    const tStart = this.add.text(0, 148, '[ 按任意键 / 点击 开始 ]', {
      fontSize: '22px', color: '#88ff88', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.titleOverlay.add([tBg, tTitle, tSub, tInstr, tStart]);
    this.tweens.add({ targets: tStart, alpha: { from: 1, to: 0.3 }, duration: 900, yoyo: true, repeat: -1 });

    // ── Level complete ──
    this.levelCompleteOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(200);
    const lcBg = this.add.rectangle(0, 0, 520, 300, 0x001500, 0.94).setStrokeStyle(3, 0x44ee44);
    const lcTitle = this.add.text(0, -96, '关卡完成!', { fontSize: '44px', color: '#88ff44', fontFamily: 'serif' }).setOrigin(0.5);
    const lcScore = this.add.text(0, -24, '', { fontSize: '22px', color: '#ffee88', fontFamily: 'monospace' }).setOrigin(0.5).setName('lcScore');
    const lcCont = this.add.text(0, 96, '[ 任意键继续 ]', { fontSize: '20px', color: '#aaffaa', fontFamily: 'monospace' }).setOrigin(0.5);
    this.levelCompleteOverlay.add([lcBg, lcTitle, lcScore, lcCont]);
    this.levelCompleteOverlay.setVisible(false);

    // ── Game over ──
    this.gameOverOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(200);
    const goBg = this.add.rectangle(0, 0, 520, 300, 0x150000, 0.94).setStrokeStyle(3, 0xee4444);
    const goTitle = this.add.text(0, -96, '游戏结束', { fontSize: '44px', color: '#ff4444', fontFamily: 'serif' }).setOrigin(0.5);
    const goScore = this.add.text(0, -24, '', { fontSize: '22px', color: '#ffee88', fontFamily: 'monospace' }).setOrigin(0.5).setName('goScore');
    const goHigh  = this.add.text(0, 24, '', { fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace' }).setOrigin(0.5).setName('goHigh');
    const goRetry = this.add.text(0, 96, '[ 任意键重试 ]', { fontSize: '20px', color: '#ffaaaa', fontFamily: 'monospace' }).setOrigin(0.5);
    this.gameOverOverlay.add([goBg, goTitle, goScore, goHigh, goRetry]);
    this.gameOverOverlay.setVisible(false);
  }

  // ──────────────────────────────────────────────────────
  // LEVEL MANAGEMENT
  // ──────────────────────────────────────────────────────
  private startLevel(index: number): void {
    this.currentLevel = index;
    this.levelConfig = LEVEL_CONFIGS[index % LEVEL_CONFIGS.length];
    this.levelScrolled = 0;
    this.levelCompleting = false;
    this.parallaxOffset = 0;
    this.lastRockTime = 0;
    this.lastSmallFishTime = 0;
    this.lastBigFishTime = 0;

    // Clear all obstacles
    for (const obs of this.obstacles) obs.container.destroy();
    this.obstacles = [];

    // Clear particles
    for (const p of this.particles) p.g.destroy();
    this.particles = [];

    // Apply level visuals
    const lc = this.levelConfig;
    this.waterTile.setTint(lc.waterTint);
    this.dayNightOverlay.setFillStyle(lc.overlayColor, lc.overlayAlpha);
    this.levelText.setText(`LEVEL ${index + 1}`);
    this.drawBanks();
  }

  // ──────────────────────────────────────────────────────
  // DRAWING — WORLD OBJECTS
  // ──────────────────────────────────────────────────────
  private drawBoat(g: Phaser.GameObjects.Graphics): void {
    // Shadow rim
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(3, 5, 46, 20);
    // Hull dark outer
    g.fillStyle(0x3e1f00, 1);
    g.fillEllipse(0, 0, 48, 62);
    // Hull main brown
    g.fillStyle(0x8B5A2B, 1);
    g.fillEllipse(0, 0, 44, 58);
    // Interior lighter
    g.fillStyle(0xa06830, 1);
    g.fillEllipse(0, 2, 38, 48);
    // Plank lines
    g.lineStyle(1.5, 0x6a3a10, 0.75);
    for (const py of [-18, -10, -2, 7, 15, 21]) {
      const hw = Math.sqrt(Math.max(0, 1 - (py / 31) ** 2)) * 16;
      g.lineBetween(-hw, py, hw, py);
    }
    // Bow detail
    g.fillStyle(0x3e1f00, 1);
    g.fillEllipse(0, -27, 16, 10);
    // Mast
    g.fillStyle(0x241008, 1);
    g.fillRect(-2, -35, 4, 22);
    // Flag
    g.fillStyle(0xff3333, 1);
    g.fillTriangle(2, -35, 2, -20, 16, -28);
    // Steering wheel hint
    g.fillStyle(0x3e1f00, 1);
    g.fillCircle(0, 13, 7);
    g.fillStyle(0x8B5A2B, 1);
    g.fillCircle(0, 13, 5);
    g.lineStyle(1, 0x3e1f00, 1);
    g.lineBetween(-5, 13, 5, 13);
    g.lineBetween(0, 8, 0, 18);
  }

  private drawSmallFish(g: Phaser.GameObjects.Graphics, type: number): void {
    const t = FISH_TYPES[type] ?? FISH_TYPES[0];
    // Tail
    g.fillStyle(t.finColor, 1);
    g.fillTriangle(0, 11, -7, 18, 7, 18);
    // Body
    g.fillStyle(t.color, 1);
    g.fillEllipse(0, 1, 14, 22);
    // Belly
    g.fillStyle(t.belly, 0.8);
    g.fillEllipse(2, 3, 8, 13);
    // Dorsal fin
    g.fillStyle(t.finColor, 1);
    g.fillTriangle(0, -8, -5, -14, 5, -14);
    // Eye
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-4, -3, 3);
    g.fillStyle(0x000000, 1);
    g.fillCircle(-4, -3, 1.5);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-5, -4, 1);
    // Subtle glow ring (makes fish visible especially at night)
    g.fillStyle(t.color, 0.14);
    g.fillCircle(0, 0, 13);
  }

  private drawBigFish(g: Phaser.GameObjects.Graphics): void {
    // Tail
    g.fillStyle(0x0a1520, 1);
    g.fillTriangle(0, 22, -13, 36, 13, 36);
    // Body outer
    g.fillStyle(0x0d1e30, 1);
    g.fillEllipse(0, 3, 40, 54);
    // Body inner
    g.fillStyle(0x1a3a5a, 1);
    g.fillEllipse(0, 3, 36, 50);
    // Belly
    g.fillStyle(0x2a5070, 1);
    g.fillEllipse(4, 8, 22, 33);
    // Dorsal fin
    g.fillStyle(0x0a1520, 1);
    g.fillTriangle(0, -18, -8, -32, 8, -32);
    // Side fins
    g.fillTriangle(-14, 1, -22, -8, -17, 10);
    g.fillTriangle( 14, 1,  22, -8,  17, 10);
    // Eye — large, menacing yellow
    g.fillStyle(0xFFFF00, 1);
    g.fillCircle(-8, -8, 8);
    g.fillStyle(0xff2200, 1);
    g.fillCircle(-8, -8, 5);
    g.fillStyle(0x000000, 1);
    g.fillCircle(-9, -8, 3);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(-10, -9, 1.5);
    // Teeth
    g.fillStyle(0xffffff, 1);
    for (let tx = -10; tx <= 6; tx += 4) {
      g.fillTriangle(tx, -21, tx + 2, -27, tx + 4, -21);
    }
    // Scale arcs
    g.lineStyle(0.5, 0x0a1520, 0.6);
    for (let r = 0; r < 3; r++) g.strokeCircle(0, 4, 10 + r * 6);
  }

  private drawRock(g: Phaser.GameObjects.Graphics, variant: number): void {
    const shapes = [
      [{ x: 0, y: -20 }, { x: 14, y: -12 }, { x: 20, y: 0 }, { x: 13, y: 14 }, { x: 0, y: 20 }, { x: -14, y: 13 }, { x: -20, y: 0 }, { x: -11, y: -15 }],
      [{ x: 0, y: -22 }, { x: 10, y: -15 }, { x: 20, y: -4 }, { x: 18, y: 9 }, { x: 9, y: 20 }, { x: -6, y: 18 }, { x: -20, y: 7 }, { x: -18, y: -8 }, { x: -8, y: -20 }],
      [{ x: 0, y: -15 }, { x: 18, y: -7 }, { x: 22, y: 2 }, { x: 15, y: 12 }, { x: 0, y: 16 }, { x: -16, y: 10 }, { x: -22, y: 0 }, { x: -15, y: -9 }],
    ];
    const pts = shapes[variant % shapes.length];
    // Shadow
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(5, 6, 46, 24);
    // Dark base
    g.fillStyle(0x555555, 1);
    g.fillPoints(pts, true);
    // Lighter surface
    g.fillStyle(0x888888, 1);
    g.fillPoints(pts.map(p => ({ x: p.x * 0.72, y: p.y * 0.72 })), true);
    // Highlight
    g.fillStyle(0xaaaaaa, 0.65);
    g.fillEllipse(-7, -7, 11, 7);
    // Cracks
    g.lineStyle(1, 0x444444, 0.75);
    g.lineBetween(2, -10, 8, 2);
    g.lineBetween(-6, -4, -2, 8);
  }

  // ──────────────────────────────────────────────────────
  // DRAWING — BANKS (called every frame)
  // ──────────────────────────────────────────────────────
  private drawBanks(): void {
    const lc = this.levelConfig;
    const off = this.parallaxOffset;

    // Sky gradient behind both banks
    this.skyBg.clear();
    this.skyBg.fillGradientStyle(lc.skyTop, lc.skyTop, lc.skyBottom, lc.skyBottom, 1);
    this.skyBg.fillRect(0, 0, RIVER_LEFT, GAME_HEIGHT);
    this.skyBg.fillGradientStyle(lc.skyTop, lc.skyTop, lc.skyBottom, lc.skyBottom, 1);
    this.skyBg.fillRect(RIVER_RIGHT, 0, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT);

    this.bankLeft.clear();
    this.bankRight.clear();

    switch (lc.biome) {
      case 'grass':  this.drawGrassBanks(off); break;
      case 'forest': this.drawForestBanks(off); break;
      case 'snow':   this.drawSnowBanks(off); break;
      case 'fog':    this.drawFogBanks(off); break;
    }
  }

  private drawGrassBanks(off: number): void {
    const gl = this.bankLeft;
    const gr = this.bankRight;

    // Ground fill
    gl.fillStyle(0x3d7a1a, 1); gl.fillRect(0, 0, RIVER_LEFT, GAME_HEIGHT);
    gr.fillStyle(0x3d7a1a, 1); gr.fillRect(RIVER_RIGHT, 0, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT);

    // Far hills (slow, offset * 0.1)
    const h1 = (off * 0.1) % 280;
    gl.fillStyle(0x5a9a2a, 1);
    for (let i = -1; i <= 2; i++) {
      gl.fillEllipse(i * 280 - h1 + 120, GAME_HEIGHT, 200, 180);
      gl.fillEllipse(i * 280 - h1 + 250, GAME_HEIGHT, 160, 130);
    }

    // Mid trees (offset * 0.28)
    const t1 = (off * 0.28) % 130;
    for (let i = -1; i <= 6; i++) {
      const ty = i * 130 - t1;
      this.drawPixelTree(gl, 65, ty, 1.0, 0x2a7020);
      this.drawPixelTree(gl, 190, ty + 58, 0.85, 0x337722);
      this.drawPixelTree(gl, 270, ty + 24, 0.95, 0x266218);
      this.drawPixelTree(gr, RIVER_RIGHT + 55, ty + 35, 0.9, 0x2a7020);
      this.drawPixelTree(gr, RIVER_RIGHT + 170, ty + 5, 1.05, 0x337722);
      this.drawPixelTree(gr, RIVER_RIGHT + 265, ty + 70, 0.88, 0x266218);
    }

    // Near grass tufts (offset * 0.6)
    const g2 = (off * 0.6) % 70;
    gl.fillStyle(0x44991a, 1);
    for (let i = -1; i <= 12; i++) {
      const gy = i * 70 - g2;
      gl.fillTriangle(RIVER_LEFT - 22, gy - 10, RIVER_LEFT - 28, gy, RIVER_LEFT - 16, gy);
      gl.fillTriangle(RIVER_LEFT - 12, gy - 8, RIVER_LEFT - 18, gy, RIVER_LEFT - 6, gy);
    }
    gr.fillStyle(0x44991a, 1);
    for (let i = -1; i <= 12; i++) {
      const gy = i * 70 - g2 + 35;
      gr.fillTriangle(RIVER_RIGHT + 15, gy - 10, RIVER_RIGHT + 9, gy, RIVER_RIGHT + 21, gy);
      gr.fillTriangle(RIVER_RIGHT + 26, gy - 8, RIVER_RIGHT + 20, gy, RIVER_RIGHT + 32, gy);
    }

    // Flowers
    const f1 = (off * 0.45) % 220;
    gl.fillStyle(0xffff55, 1);
    for (let i = -1; i <= 5; i++) {
      gl.fillCircle(70, i * 220 - f1 + 45, 4);
      gl.fillCircle(180, i * 220 - f1 + 145, 3);
    }
    gr.fillStyle(0xff88ff, 1);
    for (let i = -1; i <= 5; i++) {
      gr.fillCircle(RIVER_RIGHT + 100, i * 220 - f1 + 80, 4);
      gr.fillCircle(RIVER_RIGHT + 240, i * 220 - f1 + 200, 3);
    }
  }

  private drawForestBanks(off: number): void {
    const gl = this.bankLeft;
    const gr = this.bankRight;

    // Dark forest floor
    gl.fillStyle(0x18380e, 1); gl.fillRect(0, 0, RIVER_LEFT, GAME_HEIGHT);
    gr.fillStyle(0x18380e, 1); gr.fillRect(RIVER_RIGHT, 0, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT);

    // Far silhouette trees (slowest)
    const ft = (off * 0.1) % 200;
    for (let i = -1; i <= 4; i++) {
      const ty = i * 200 - ft;
      this.drawPixelTree(gl, 55, ty, 1.7, 0x10280a);
      this.drawPixelTree(gl, 170, ty + 85, 1.5, 0x0c2008);
      this.drawPixelTree(gl, 275, ty + 32, 1.6, 0x10280a);
      this.drawPixelTree(gr, RIVER_RIGHT + 50, ty + 50, 1.7, 0x10280a);
      this.drawPixelTree(gr, RIVER_RIGHT + 175, ty + 10, 1.6, 0x0c2008);
      this.drawPixelTree(gr, RIVER_RIGHT + 265, ty + 95, 1.5, 0x10280a);
    }

    // Autumn trees (orange/amber)
    const at = (off * 0.32) % 140;
    for (let i = -1; i <= 6; i++) {
      const ty = i * 140 - at;
      this.drawPixelTree(gl, 80, ty, 1.0, 0xcc5500);
      this.drawPixelTree(gl, 210, ty + 65, 1.15, 0xdd7700);
      this.drawPixelTree(gr, RIVER_RIGHT + 80, ty + 25, 1.1, 0xcc5500);
      this.drawPixelTree(gr, RIVER_RIGHT + 235, ty + 85, 0.95, 0xaa3300);
    }

    // Falling leaves
    const lf = (off * 0.75) % 110;
    for (let i = 0; i < 22; i++) {
      const lx = (i * 47 + 20) % 280;
      const ly = (i * 73 + lf * 1.6) % (GAME_HEIGHT + 80) - 40;
      gl.fillStyle(0xcc5500, 0.85);
      gl.fillRect(lx, ly, 4, 4);
      const rx = RIVER_RIGHT + (i * 53 + 30) % 280;
      const ry = (i * 61 + lf) % (GAME_HEIGHT + 80) - 40;
      gr.fillStyle(0xdd7700, 0.85);
      gr.fillRect(rx, ry, 4, 3);
    }
  }

  private drawSnowBanks(off: number): void {
    const gl = this.bankLeft;
    const gr = this.bankRight;

    // Snow base
    gl.fillStyle(0xccdde8, 1); gl.fillRect(0, 0, RIVER_LEFT, GAME_HEIGHT);
    gr.fillStyle(0xccdde8, 1); gr.fillRect(RIVER_RIGHT, 0, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT);

    // Stars (fixed — use i as seed)
    gl.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 14; i++) {
      gl.fillCircle((i * 71 + 10) % 290, (i * 53 + 20) % (GAME_HEIGHT * 0.55), i % 4 === 0 ? 1.5 : 1);
    }
    gr.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 14; i++) {
      gr.fillCircle(RIVER_RIGHT + (i * 67 + 30) % 290, (i * 47 + 30) % (GAME_HEIGHT * 0.55), i % 4 === 0 ? 1.5 : 1);
    }

    // Moon
    gl.fillStyle(0xffeedd, 1);
    gl.fillCircle(256, 55, 20);
    gl.fillStyle(0xccdde8, 1);
    gl.fillCircle(265, 50, 16);

    // Distant mountains (very slow)
    const mo = (off * 0.07) % 380;
    gl.fillStyle(0x99aabb, 1);
    for (let i = -1; i <= 2; i++) {
      this.drawMountain(gl, i * 380 - mo + 90, 95, 90);
      this.drawMountain(gl, i * 380 - mo + 240, 75, 70);
    }
    gr.fillStyle(0x99aabb, 1);
    for (let i = -1; i <= 2; i++) {
      this.drawMountain(gr, RIVER_RIGHT + i * 380 - mo + 70, 85, 80);
      this.drawMountain(gr, RIVER_RIGHT + i * 380 - mo + 210, 65, 65);
    }

    // Snowy pines
    const po = (off * 0.3) % 130;
    for (let i = -1; i <= 6; i++) {
      const ty = i * 130 - po;
      this.drawSnowPine(gl, 72, ty, 1.0);
      this.drawSnowPine(gl, 195, ty + 58, 1.2);
      this.drawSnowPine(gl, 272, ty + 20, 0.9);
      this.drawSnowPine(gr, RIVER_RIGHT + 55, ty + 32, 1.1);
      this.drawSnowPine(gr, RIVER_RIGHT + 175, ty + 5, 0.9);
      this.drawSnowPine(gr, RIVER_RIGHT + 272, ty + 75, 1.0);
    }

    // Snowflakes
    const sf = (off * 1.0) % 120;
    gl.fillStyle(0xffffff, 0.92);
    for (let i = 0; i < 28; i++) {
      const sx = (i * 41 + 15) % 290;
      const sy = (i * 67 + sf * 2) % (GAME_HEIGHT + 60) - 30;
      gl.fillCircle(sx, sy, i % 3 === 0 ? 2 : 1);
    }
    gr.fillStyle(0xffffff, 0.92);
    for (let i = 0; i < 28; i++) {
      const sx = RIVER_RIGHT + (i * 37 + 25) % 290;
      const sy = (i * 59 + sf) % (GAME_HEIGHT + 60) - 30;
      gr.fillCircle(sx, sy, i % 3 === 0 ? 2 : 1);
    }
  }

  private drawFogBanks(off: number): void {
    const gl = this.bankLeft;
    const gr = this.bankRight;

    gl.fillStyle(0x6a8a9a, 1); gl.fillRect(0, 0, RIVER_LEFT, GAME_HEIGHT);
    gr.fillStyle(0x6a8a9a, 1); gr.fillRect(RIVER_RIGHT, 0, GAME_WIDTH - RIVER_RIGHT, GAME_HEIGHT);

    // Ghost trees through mist
    const to = (off * 0.22) % 150;
    for (let i = -1; i <= 5; i++) {
      const ty = i * 150 - to;
      this.drawPixelTree(gl, 80, ty, 1.2, 0x3a5a4a, 0.45);
      this.drawPixelTree(gl, 205, ty + 72, 1.0, 0x3a5a4a, 0.38);
      this.drawPixelTree(gr, RIVER_RIGHT + 65, ty + 42, 1.1, 0x3a5a4a, 0.45);
      this.drawPixelTree(gr, RIVER_RIGHT + 205, ty + 12, 1.0, 0x3a5a4a, 0.38);
    }

    // Fog wisps
    const fo = (off * 0.14) % 220;
    gl.fillStyle(0xbdd0de, 0.32);
    for (let i = -1; i <= 5; i++) {
      gl.fillRect(0, i * 220 - fo, RIVER_LEFT, 90);
    }
    gr.fillStyle(0xbdd0de, 0.32);
    for (let i = -1; i <= 5; i++) {
      gr.fillRect(RIVER_RIGHT, i * 220 - fo + 110, GAME_WIDTH - RIVER_RIGHT, 90);
    }
  }

  // ── Shape helpers ──
  private drawPixelTree(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number, alpha = 1.0): void {
    g.fillStyle(0x5a3a1a, alpha);
    g.fillRect(x - 3 * s, y - 8, 6 * s, 14 * s);
    g.fillStyle(color, alpha);
    g.fillTriangle(x, y - 36 * s, x - 18 * s, y, x + 18 * s, y);
    g.fillTriangle(x, y - 52 * s, x - 14 * s, y - 18 * s, x + 14 * s, y - 18 * s);
    g.fillTriangle(x, y - 65 * s, x - 10 * s, y - 34 * s, x + 10 * s, y - 34 * s);
  }

  private drawSnowPine(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(x - 3 * s, y - 8, 6 * s, 14 * s);
    g.fillStyle(0x28402a, 1);
    g.fillTriangle(x, y - 38 * s, x - 17 * s, y, x + 17 * s, y);
    g.fillTriangle(x, y - 54 * s, x - 13 * s, y - 20 * s, x + 13 * s, y - 20 * s);
    // Snow caps
    g.fillStyle(0xeef4ff, 0.9);
    g.fillTriangle(x, y - 40 * s, x - 13 * s, y - 21 * s, x + 13 * s, y - 21 * s);
    g.fillTriangle(x, y - 57 * s, x - 9 * s, y - 39 * s, x + 9 * s, y - 39 * s);
  }

  private drawMountain(g: Phaser.GameObjects.Graphics, cx: number, peakY: number, halfW: number): void {
    g.fillStyle(0x8899aa, 1);
    g.fillTriangle(cx, peakY, cx - halfW, GAME_HEIGHT * 0.65, cx + halfW, GAME_HEIGHT * 0.65);
    g.fillStyle(0xeef4ff, 0.92);
    g.fillTriangle(cx, peakY, cx - halfW * 0.38, peakY + 52, cx + halfW * 0.38, peakY + 52);
  }

  // ──────────────────────────────────────────────────────
  // SPAWNING
  // ──────────────────────────────────────────────────────
  private spawnRockAt(x: number, y: number): void {
    const variant = Phaser.Math.Between(0, 2);
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    this.drawRock(g, variant);
    c.add(g);
    this.obstacles.push({ x, y, radius: ROCK_RADIUS, type: 'rock', fishType: 0, container: c, dead: false, vx: 0, rockVariant: variant, phase: 0 });
  }

  private spawnSmallFishAt(x: number, y: number, fishType: number, vx: number): void {
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    this.drawSmallFish(g, fishType);
    c.add(g);
    this.obstacles.push({ x, y, radius: SMALL_FISH_RADIUS, type: 'smallfish', fishType, container: c, dead: false, vx, rockVariant: 0, phase: Math.random() * Math.PI * 2 });
  }

  private spawnBigFishAt(x: number, y: number, vx: number): void {
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    this.drawBigFish(g);
    c.add(g);
    this.obstacles.push({ x, y, radius: BIG_FISH_RADIUS, type: 'bigfish', fishType: 0, container: c, dead: false, vx, rockVariant: 0, phase: 0 });
  }

  private spawnObstacles(time: number): void {
    const lc = this.levelConfig;
    const progress = this.levelScrolled / lc.length;
    // 60-80% of the level is the "tension" zone — spawn patterns more densely
    const tensionMul = progress > 0.6 && progress < 0.8 ? 0.6 : 1.0;

    if (time - this.lastRockTime > lc.rockInterval * tensionMul) {
      this.lastRockTime = time;
      const rnd = Math.random();
      if (rnd < 0.18 && progress > 0.25) {
        // Rock triangle
        const cx = Phaser.Math.Between(RIVER_LEFT + 80, RIVER_RIGHT - 80);
        this.spawnRockAt(cx, -40);
        this.spawnRockAt(cx - 52, -90);
        this.spawnRockAt(cx + 52, -90);
      } else if (rnd < 0.32 && progress > 0.4) {
        // Corridor — two columns with a gap
        const gapCx = Phaser.Math.Between(RIVER_LEFT + 80, RIVER_RIGHT - 80);
        for (const py of [-40, -100, -155]) {
          const lx = gapCx - 44; const rx = gapCx + 44;
          if (lx > RIVER_LEFT + 28) this.spawnRockAt(lx, py);
          if (rx < RIVER_RIGHT - 28) this.spawnRockAt(rx, py);
        }
      } else {
        this.spawnRockAt(Phaser.Math.Between(RIVER_LEFT + 30, RIVER_RIGHT - 30), -40);
      }
    }

    if (time - this.lastSmallFishTime > lc.smallFishInterval) {
      this.lastSmallFishTime = time;
      const ft = Phaser.Math.Between(0, FISH_TYPES.length - 1);
      if (Math.random() < 0.28) {
        // Fish cluster
        const cx = Phaser.Math.Between(RIVER_LEFT + 55, RIVER_RIGHT - 55);
        const cnt = Phaser.Math.Between(3, 5);
        for (let i = 0; i < cnt; i++) {
          this.spawnSmallFishAt(
            cx + Phaser.Math.Between(-55, 55),
            -28 - i * 28,
            ft,
            Phaser.Math.Between(-55, 55),
          );
        }
      } else {
        this.spawnSmallFishAt(
          Phaser.Math.Between(RIVER_LEFT + 25, RIVER_RIGHT - 25),
          -28, ft, Phaser.Math.Between(-65, 65),
        );
      }
    }

    if (time - this.lastBigFishTime > lc.bigFishInterval * tensionMul) {
      this.lastBigFishTime = time;
      if (Math.random() < 0.28 && progress > 0.45) {
        // Double big fish flanking
        this.spawnBigFishAt(RIVER_LEFT  + 72, -55, 35);
        this.spawnBigFishAt(RIVER_RIGHT - 72, -55, -35);
      } else {
        this.spawnBigFishAt(Phaser.Math.Between(RIVER_LEFT + 45, RIVER_RIGHT - 45), -55, Phaser.Math.Between(-44, 44));
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // COMBAT & EFFECTS
  // ──────────────────────────────────────────────────────
  private handleCollision(obs: ObstacleObj): void {
    obs.dead = true;
    obs.container.destroy();
    if (obs.type === 'smallfish') {
      this.collectFish(obs.fishType);
      this.spawnPickupParticles(obs.x, obs.y, FISH_TYPES[obs.fishType].color);
      this.floatText(obs.x, obs.y - 10, `+${FISH_TYPES[obs.fishType].heal}`, '#88ff44');
    } else {
      const dmg = obs.type === 'rock' ? this.rockDamage : this.bigFishDamage;
      const pColor = obs.type === 'rock' ? 0x888888 : 0x4488bb;
      this.takeDamage(dmg);
      this.spawnHitParticles(obs.x, obs.y, pColor);
      this.floatText(obs.x, obs.y - 10, `-${dmg}`, '#ff4444');
      this.cameras.main.shake(obs.type === 'rock' ? 180 : 240, 0.007);
    }
  }

  private collectFish(fishType: number): void {
    for (let i = 0; i < 8; i++) {
      if (this.inventory[i].type === fishType) { this.inventory[i].count++; this.refreshInventoryHUD(); return; }
    }
    for (let i = 0; i < 8; i++) {
      if (this.inventory[i].type === -1) { this.inventory[i] = { type: fishType, count: 1 }; this.refreshInventoryHUD(); return; }
    }
    this.floatText(this.boatX, this.boatY - 50, '背包已满!', '#ffaa44');
  }

  private eatFish(slot: number): void {
    const s = this.inventory[slot];
    if (s.type < 0 || s.count < 1) return;
    const heal = FISH_TYPES[s.type]?.heal ?? this.smallFishHeal;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    s.count--;
    if (s.count === 0) s.type = -1;
    this.refreshInventoryHUD();
    this.refreshHPBar();
    this.floatText(this.boatX, this.boatY - 48, `+${heal} HP`, '#44ff88');
    this.tweens.add({ targets: this.boat, alpha: { from: 0.5, to: 1 }, duration: 280 });
  }

  private takeDamage(dmg: number): void {
    if (this.invincibleTimer > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invincibleTimer = this.invincibilityMs;
    this.refreshHPBar();
    this.tweens.add({ targets: this.boat, alpha: { from: 0.3, to: 1 }, duration: 380 });
    if (this.hp <= 0) this.triggerGameOver();
  }

  private doJump(): void {
    if (this.isJumping || this.jumpCooldownTimer > 0) return;
    this.isJumping = true;
    const upDur = this.jumpDurationMs * 0.42;
    const dnDur = this.jumpDurationMs * 0.50;
    this.tweens.add({
      targets: this.boat,
      y: this.boatY - 44, scaleX: 1.18, scaleY: 1.18,
      duration: upDur, ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.boat, y: this.boatY, scaleX: 1, scaleY: 1,
          duration: dnDur, ease: 'Bounce.easeOut',
          onComplete: () => {
            this.isJumping = false;
            this.jumpCooldownTimer = this.jumpCooldownMs;
            this.spawnSplashParticles(this.boatX, this.boatY);
          },
        });
      },
    });
  }

  // ──────────────────────────────────────────────────────
  // PARTICLES & FLOATING TEXT
  // ──────────────────────────────────────────────────────
  private spawnPickupParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 8; i++) {
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(color, 1); g.fillCircle(0, 0, Phaser.Math.Between(2, 5));
      const a = (i / 8) * Math.PI * 2;
      const sp = Phaser.Math.Between(60, 120);
      this.particles.push({ g, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 600, maxLife: 600 });
    }
  }

  private spawnHitParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 7; i++) {
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(color, 1); g.fillCircle(0, 0, Phaser.Math.Between(3, 7));
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const sp = Phaser.Math.Between(50, 110);
      this.particles.push({ g, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 520, maxLife: 520 });
    }
  }

  private spawnSplashParticles(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(0xaaddff, 1); g.fillCircle(0, 0, Phaser.Math.Between(2, 5));
      const a = Phaser.Math.FloatBetween(-Math.PI, 0);
      const sp = Phaser.Math.Between(55, 140);
      this.particles.push({ g, x: x + Phaser.Math.Between(-14, 14), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 460, maxLife: 460 });
    }
  }

  private floatText(x: number, y: number, msg: string, color: string): void {
    const t = this.add.text(x, y, msg, {
      fontSize: '20px', color, fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 55, alpha: 0, duration: 850, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  // ──────────────────────────────────────────────────────
  // HUD REFRESH
  // ──────────────────────────────────────────────────────
  private refreshHPBar(): void {
    const r = this.hp / this.maxHp;
    this.hpBarFill.width = 200 * r;
    const red   = r < 0.5 ? 238 : Math.round(238 * (1 - r) * 2);
    const green = r > 0.5 ? 238 : Math.round(238 * r * 2);
    this.hpBarFill.setFillStyle(Phaser.Display.Color.GetColor(red, green, 0x22));
  }

  private refreshInventoryHUD(): void {
    for (let i = 0; i < 8; i++) {
      const s = this.inventory[i];
      this.invSlotIcons[i].clear();
      if (s.type >= 0 && s.count > 0) {
        this.drawSmallFish(this.invSlotIcons[i], s.type);
        this.invSlotTexts[i].setText(`×${s.count}`);
        this.invSlotBgs[i].setFillStyle(0x4a3a2a);
      } else {
        this.invSlotTexts[i].setText('');
        this.invSlotBgs[i].setFillStyle(0x3a2a1a);
      }
    }
  }

  private refreshProgressBar(): void {
    if (!this.levelConfig) return;
    const BAR_H = 420;
    const BAR_Y_CENTER = GAME_HEIGHT / 2;
    const ratio = Math.min(1, this.levelScrolled / this.levelConfig.length);
    const fillH = BAR_H * ratio;
    this.progressBarFill.height = fillH;
    this.progressBarFill.y = BAR_Y_CENTER + BAR_H / 2 - fillH;
    // Move boat icon up the bar
    this.progressBoatIcon.y = BAR_Y_CENTER + BAR_H / 2 - fillH - 4;
  }

  // ──────────────────────────────────────────────────────
  // OVERLAY CONTROL
  // ──────────────────────────────────────────────────────
  private showTitle(): void {
    this.state = 'title';
    this.overlayActive = true;
    this.titleOverlay.setVisible(true);
  }

  private showLevelComplete(): void {
    this.state = 'levelcomplete';
    this.overlayActive = true;
    this.levelCompleteOverlay.setVisible(true);
    const bonus = 500;
    this.score += bonus;
    (this.levelCompleteOverlay.getByName('lcScore') as Phaser.GameObjects.Text)
      .setText(`本关得分: ${this.score}\n通关奖励: +${bonus}`);
    this.cameras.main.shake(120, 0.004);
  }

  private showGameOver(): void {
    this.state = 'gameover';
    this.overlayActive = true;
    this.gameOverOverlay.setVisible(true);
    (this.gameOverOverlay.getByName('goScore') as Phaser.GameObjects.Text)
      .setText(`总得分: ${this.totalScore + this.score}`);
    void this.saveHighScore();
  }

  private async saveHighScore(): Promise<void> {
    try {
      const { Umicat } = await import('@umicat/phaser-sdk');
      const umicat = await Umicat.init({ standaloneGameId: 'river-drift' }).catch(() => null);
      if (!umicat) return;
      const prev = await umicat.saves.get<number>('highScore') ?? 0;
      const now = this.totalScore + this.score;
      const hi = Math.max(prev, now);
      (this.gameOverOverlay.getByName('goHigh') as Phaser.GameObjects.Text).setText(`最高分: ${hi}`);
      if (now > prev) await umicat.saves.set('highScore', now);
    } catch { /* non-blocking */ }
  }

  private dismissOverlay(): void {
    if (!this.overlayActive) return;
    this.overlayActive = false;
    if (this.state === 'title') {
      this.titleOverlay.setVisible(false);
      this.beginGame();
    } else if (this.state === 'levelcomplete') {
      this.levelCompleteOverlay.setVisible(false);
      this.totalScore += this.score;
      this.score = 0;
      this.startLevel(this.currentLevel + 1);
      this.state = 'playing';
    } else if (this.state === 'gameover') {
      this.gameOverOverlay.setVisible(false);
      this.beginGame();
    }
  }

  private beginGame(): void {
    this.hp = this.maxHp;
    this.score = 0;
    this.totalScore = 0;
    this.inventory = Array.from({ length: 8 }, () => ({ type: -1, count: 0 }));
    this.boatX = RIVER_MID_X;
    this.boatY = 560;
    this.boat.setPosition(this.boatX, this.boatY).setScale(1).setAlpha(1);
    this.isJumping = false;
    this.jumpCooldownTimer = 0;
    this.invincibleTimer = 0;
    this.refreshHPBar();
    this.refreshInventoryHUD();
    this.startLevel(0);
    this.state = 'playing';
  }

  private triggerGameOver(): void {
    for (const obs of this.obstacles) obs.container.destroy();
    this.obstacles = [];
    this.showGameOver();
  }

  // ──────────────────────────────────────────────────────
  // UPDATE LOOP
  // ──────────────────────────────────────────────────────
  update(time: number, delta: number): void {
    // On overlay: any key dismisses it
    if (this.overlayActive) {
      const jd = Phaser.Input.Keyboard.JustDown;
      if (
        jd(this.cursors.up) || jd(this.cursors.down) ||
        jd(this.cursors.left) || jd(this.cursors.right) ||
        jd(this.spaceKey) || this.input.activePointer.justDown ||
        this.numKeys.some(k => jd(k))
      ) {
        this.dismissOverlay();
      }
      // Slow ambient scroll on title
      this.parallaxOffset += delta * 0.07;
      this.drawBanks();
      return;
    }
    if (this.state !== 'playing') return;

    const dt = delta / 1000;
    const scrollSpeed = this.levelConfig.scrollSpeed;

    // Advance level progress
    this.levelScrolled += scrollSpeed * dt;
    this.parallaxOffset += scrollSpeed * dt;

    // Scroll water texture upward
    this.waterTile.tilePositionY += scrollSpeed * dt * 0.85;

    // Redraw parallax banks
    this.drawBanks();

    // ── Player input ──
    const sp = this.playerSpeed;
    if (this.cursors.left.isDown) {
      this.boatX -= sp * dt;
      if (!this.isJumping) this.boat.setAngle(-9);
    } else if (this.cursors.right.isDown) {
      this.boatX += sp * dt;
      if (!this.isJumping) this.boat.setAngle(9);
    } else {
      if (!this.isJumping) this.boat.setAngle(0);
    }
    if (this.cursors.up.isDown)   this.boatY -= sp * 0.7 * dt;
    if (this.cursors.down.isDown) this.boatY += sp * 0.5 * dt;

    this.boatX = Phaser.Math.Clamp(this.boatX, RIVER_LEFT + 26, RIVER_RIGHT - 26);
    this.boatY = Phaser.Math.Clamp(this.boatY, PLAYER_MIN_Y, PLAYER_MAX_Y);

    // Sync boat X (Y is managed by tween during jump)
    this.boat.setX(this.boatX);
    if (!this.isJumping) this.boat.setY(this.boatY);

    // Jump
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.doJump();

    // Eat fish (number keys)
    for (let i = 0; i < 8; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.numKeys[i])) this.eatFish(i);
    }

    // ── Timers ──
    if (this.jumpCooldownTimer > 0) this.jumpCooldownTimer -= delta;
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= delta;
      this.boat.setAlpha(Math.sin(time / 55) * 0.38 + 0.72);
    } else {
      if (!this.isJumping) this.boat.setAlpha(1);
    }

    // ── Boat shadow ──
    this.boatShadow.clear();
    this.boatShadow.fillStyle(0x000000, 0.18);
    this.boatShadow.fillEllipse(this.boatX, this.boatY, 50, 16);

    // ── Spawning ──
    if (this.levelScrolled < this.levelConfig.length) {
      this.spawnObstacles(time);
    }

    // ── Move & collide obstacles ──
    for (const obs of this.obstacles) {
      if (obs.dead) continue;
      obs.y += scrollSpeed * dt;

      if (obs.type !== 'rock') {
        obs.phase += dt * 3;
        obs.x += obs.vx * dt;
        if (obs.type === 'smallfish') {
          obs.y += Math.sin(obs.phase) * 0.75;
          obs.container.setAngle(Math.sin(obs.phase) * 12);
        }
        // Big fish chases player
        if (obs.type === 'bigfish' && obs.y > 0) {
          obs.vx += (this.boatX - obs.x) * 0.12 * dt;
          obs.vx = Phaser.Math.Clamp(obs.vx, -85, 85);
        }
        // Bounce off banks
        if (obs.x < RIVER_LEFT + 24) { obs.x = RIVER_LEFT + 24; obs.vx = Math.abs(obs.vx); }
        if (obs.x > RIVER_RIGHT - 24) { obs.x = RIVER_RIGHT - 24; obs.vx = -Math.abs(obs.vx); }
      }

      obs.container.setPosition(obs.x, obs.y);

      if (obs.y > GAME_HEIGHT + 80) { obs.container.destroy(); obs.dead = true; continue; }

      // Circle collision with player
      if (!this.isJumping && this.invincibleTimer <= 0) {
        const dx = this.boatX - obs.x;
        const dy = this.boatY - obs.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + obs.radius) ** 2) {
          this.handleCollision(obs);
        }
      }
    }
    this.obstacles = this.obstacles.filter(o => !o.dead);

    // ── Particles ──
    for (const p of this.particles) {
      p.life -= delta;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 115 * dt;
      p.g.setAlpha(p.life / p.maxLife).setPosition(p.x, p.y);
      if (p.life <= 0) p.g.destroy();
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // ── Survival score ──
    this.score += Math.floor(scrollSpeed * dt * 0.11);

    // ── HUD ──
    this.refreshProgressBar();
    this.scoreText.setText(`${this.score + this.totalScore}`);

    // ── Level complete check ──
    if (!this.levelCompleting && this.levelScrolled >= this.levelConfig.length) {
      this.levelCompleting = true;
      // Give a short moment for any remaining obstacles to clear, then show overlay
      this.time.delayedCall(600, () => {
        for (const obs of this.obstacles) obs.container.destroy();
        this.obstacles = [];
        this.showLevelComplete();
      });
    }
  }
}
