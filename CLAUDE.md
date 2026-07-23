# 河流漂流记 (River Drift)

## Game Overview
- **Genre**: Vertical-scrolling river obstacle-dodge game
- **Layout**: 1280×720 landscape — left bank 320px | river 640px | right bank 320px
- **Core mechanic**: Steer a boat up a scrolling river, dodge rocks & big fish, collect small fish as food/healing

## Currently Implemented Features

### Gameplay
- Vertical parallax river scroll (obstacle moves down = boat appears to go upstream)
- 4 timed level configs cycling: Grass/Day → Forest/Dusk → Snow/Night → Fog/Morning
- Player movement: ← → (left/right lean + tilt), ↑ (accelerate), ↓ (slow down)
- Jump mechanic (SPACE): tween up then Bounce.easeOut down, disables collision while airborne, cooldown timer
- Water TileSprite scrolling using generated 640×32 texture

### Obstacles & Entities
- **Small fish** (3 types: carp orange heal:15, trout blue heal:20, goldfish yellow heal:30): collect to inventory, wobble swim, glow ring
- **Big fish**: chases player, dark menacing with teeth/yellow eye, bounces off river walls
- **Rocks**: 3 polygon variants with shadow/highlight/cracks, fixed in river
- Obstacle patterns: single rock, rock triangle, rock corridor, fish cluster, double-flank big fish

### Combat System
- Manual circle collision detection (dx²+dy² < (r1+r2)²)
- HP bar (color shifts red→green), invincibility frames after hit (1.5s default)
- Damage: rocks = 15, big fish = 20; heal via inventory fish items
- Screen shake on rock hit (180ms) and fish hit (240ms)
- Floating text feedback (+HP, -damage, 背包已满)

### 8-Slot Inventory
- Bottom toolbar (Minecraft-style), slotted by fish type + count
- Collect by collision; eat via keys 1–8
- Full-inventory warning if all slots taken

### Parallax Banks (drawn every frame via Graphics API)
- `drawGrassBanks`: hills + pixel trees + grass tufts + flowers (3 parallax speeds)
- `drawForestBanks`: dark forest floor + silhouette trees + autumn trees + falling leaves
- `drawSnowBanks`: snow base + stars + moon + mountains + snowy pines + snowflakes
- `drawFogBanks`: misty grey + ghost trees + drifting fog wisps

### Day/Night Overlay System
- Full-screen tinted Rectangle over everything (depth 55)
- Day: no tint, Dusk: orange 13%, Night: dark blue 38%, Fog: white-grey 22%

### HUD
- HP bar (top-left, red→green gradient), heart icon
- Level label (top center), Score (top right, gold)
- Vertical progress bar (right edge) with ⛵ boat icon moving up
- 8 inventory slots (bottom center) with fish mini-icons + count

### Overlays
- **Title screen**: Chinese title + subtitle + controls + blinking start prompt
- **Level complete**: score + bonus display
- **Game over**: total score + best score (loaded/saved via `umicat.saves`)

### Scoring
- Survival score = scrollSpeed × dt × 0.11 each frame
- Fish collection = fish heal value shown as feedback
- Level complete bonus = +500

### Persistence
- High score saved via `umicat.saves.get/set('highScore')`

## Key Technical Details

### Files Changed This Session
- `src/visuals.ts` — created (empty renderScripts export needed by main.ts)
- `public/rules.json` — created (tunable balance values)
- `src/scenes/BootScene.ts` — added `preloadRules` + boat_pixel image preload; also loads `data/fish.json` and applies it via `applyFishData`
- `src/scenes/GameScene.ts` — complete game implementation (~1230 lines); boat now uses AI pixel sprite; heal lookups now use `FISH_DATA` from data module
- `public/uploaded/generated_cfowo_sheet.png` — animated boat spritesheet (68×68 per frame, 4 frames, animation key: boat_sail)
- `public/data/fish.json` — fish data table (name + heal per type); editable in Data Tables tool without code changes
- `src/data/fish.ts` — fish data loader module (`FISH_DATA` array + `applyFishData`); has code fallback values

### Constants
- `RIVER_LEFT=320`, `RIVER_RIGHT=960`, `RIVER_MID_X=640`, `RIVER_WIDTH=640`
- `PLAYER_MIN_Y=140`, `PLAYER_MAX_Y=620`
- `PLAYER_RADIUS=18`, `ROCK_RADIUS=22`, `BIG_FISH_RADIUS=26`, `SMALL_FISH_RADIUS=14`

### Rules (public/rules.json)
- `balance.playerSpeed` (220), `balance.startHp` (100)
- `balance.rockDamage` (15), `balance.bigFishDamage` (20), `balance.smallFishHeal` (25)
- `balance.invincibilityMs` (1500), `balance.jumpDurationMs` (700), `balance.jumpCooldownMs` (1000)

### Architecture
- Pure-code game — no `loadWorldScene`, no scene JSON entities used for gameplay
- All rendering via Phaser Graphics API (no image assets)
- Manual particle system (array of {g, x, y, vx, vy, life, maxLife})
- GameState machine: `'title' | 'playing' | 'levelcomplete' | 'gameover'`
- Banks redrawn every frame (Graphics.clear() + redraw) for parallax effect
