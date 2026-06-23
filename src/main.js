(() => {
  'use strict';

  const VIRTUAL_WIDTH = 480;
  const VIRTUAL_HEIGHT = 270;
  const BASE_SPEED = 150;
  const MAX_SPEED = 320;
  const GRAVITY_Y = 920;
  const GROUND_Y = 218;
  const RACE_DISTANCE_KM = 42;
  const KM_PER_SPEED_SECOND = 0.00055;
  const SHOP_SPAWN_LOOKAHEAD_KM = 0.24;
  const COINS_PER_KM = 3;
  const H2O_COIN_REWARD = 5;
  const DINO_BIB_NUMBER = '1';
  const PLAYER_RUN_HITBOX = { width: 28, height: 34, offsetX: 16, offsetY: 14 };
  const PLAYER_SLIDE_HITBOX = { width: 42, height: 14, offsetX: 8, offsetY: 18 };
  const BACKGROUND_RUNNER_BIBS = ['07', '13', '21', '26', '38', '42', '57', '88'];
  const MERGE_EVENT_MIN_BEFORE_SHOP_KM = 0.85;
  const MERGE_EVENT_MAX_BEFORE_SHOP_KM = 1.55;
  const MERGE_EVENT_MIN_SECONDS = 15;
  const MERGE_EVENT_MAX_SECONDS = 20;
  const MERGE_GIT_SPAWN_MIN_MS = 520;
  const MERGE_GIT_SPAWN_MAX_MS = 860;
  const MERGE_BOT_X = VIRTUAL_WIDTH / 2 + 92;
  const MERGE_BOT_GROUND_Y = GROUND_Y;
  const MERGE_BOT_MIN_Y = GROUND_Y - 116;
  const MERGE_BOT_VERTICAL_SPEED = 178;
  const MERGE_BOT_LOOKAHEAD_X = 190;
  const MERGE_BOT_MISS_CHANCE = 18;
  const MERGE_BOT_COLLECT_ERROR_MIN = 25;
  const MERGE_BOT_COLLECT_ERROR_MAX = 30;
  const MERGE_PLAYER_COIN_SPAWN_X = VIRTUAL_WIDTH / 2 - 12;
  const MERGE_BOT_COIN_SPAWN_X = VIRTUAL_WIDTH + 24;
  const MERGE_PLAYER_COIN_OFFSETS = [34, 64, 94];
  const MERGE_BOT_COIN_OFFSETS = [34, 64, 94];
  const SHOP_STOPS = [
    { km: 5, name: 'Лавка у старта' },
    { km: 10, name: 'Пункт воды' },
    { km: 21, name: 'Магазин полумарафона' },
    { km: 32, name: 'Палатка темпа' },
    { km: 38, name: 'Тележка финального рывка' },
  ];
  const SHOP_ITEMS = [
    { id: 'gel', name: 'Энергогель', price: 12, effect: 'Замедляет темп на 12 сек.' },
    { id: 'shoes', name: 'Пружинные кроссовки', price: 14, effect: 'Усиливают прыжок на 15 сек.' },
    { id: 'shield', name: 'Панцирь-щит', price: 18, effect: 'Блокирует одно столкновение.' },
  ];
  const LEADERBOARD_LIMIT = 10;
  const LEADERBOARD_API_URL = '/api/leaderboard';
  const PLAYER_NAME_STORAGE_KEY = 'dino-pace-run-player-name';

  // Real dragon character sprites are loaded from assets/sprites/.
  // The rest of the prototype still uses generated placeholder textures until art files exist.
  const USE_GENERATED_PLACEHOLDERS = true;
  const ASSETS = {
    character: {
      run: [
        { key: 'dino-run-0', path: 'assets/sprites/dino-run-0.png' },
        { key: 'dino-run-1', path: 'assets/sprites/dino-run-1.png' },
        { key: 'dino-run-2', path: 'assets/sprites/dino-run-2.png' },
        { key: 'dino-run-3', path: 'assets/sprites/dino-run-3.png' },
      ],
      jump: { key: 'dino-jump', path: 'assets/sprites/dino-jump.png' },
      slide: { key: 'dino-slide', path: 'assets/sprites/dino-slide.png' },
    },
    obstacles: [
      { key: 'cactus', path: 'assets/sprites/obstacle-cactus.png' },
      { key: 'hurdle', path: 'assets/sprites/obstacle-hurdle.png' },
      { key: 'cone', path: 'assets/sprites/obstacle-cone.png' },
    ],
    collectibles: [{ key: 'h2o-bottle', path: 'assets/sprites/h2o-bottle.png' }],
    event: { gitToken: { key: 'git-token', path: 'assets/sprites/git-token.png' } },
    shops: [{ key: 'shop-stand', path: 'assets/sprites/shop-stand.png' }],
    backgrounds: [
      { key: 'clouds', path: 'assets/backgrounds/clouds.png' },
      { key: 'city-far', path: 'assets/backgrounds/city-far.png' },
      { key: 'trees-mid', path: 'assets/backgrounds/trees-mid.png' },
      { key: 'road-tile', path: 'assets/backgrounds/road-tile.png' },
    ],
  };

  const fallback = document.getElementById('fallback');
  const showFallback = (message) => {
    if (!fallback) return;
    fallback.textContent = message;
    fallback.classList.add('is-visible');
  };

  if (!window.Phaser) {
    showFallback('Phaser 3 не найден. Проверьте файл vendor/phaser.min.js — игра полностью локальная и не использует CDN.');
    return;
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super('GameScene');
    }

    preload() {
      ASSETS.character.run.forEach((asset) => this.load.image(asset.key, asset.path));
      this.load.image(ASSETS.character.jump.key, ASSETS.character.jump.path);
      this.load.image(ASSETS.character.slide.key, ASSETS.character.slide.path);

      if (!USE_GENERATED_PLACEHOLDERS) {
        ASSETS.obstacles.forEach((asset) => this.load.image(asset.key, asset.path));
        ASSETS.collectibles.forEach((asset) => this.load.image(asset.key, asset.path));
        this.load.image(ASSETS.event.gitToken.key, ASSETS.event.gitToken.path);
        ASSETS.shops.forEach((asset) => this.load.image(asset.key, asset.path));
        ASSETS.backgrounds.forEach((asset) => this.load.image(asset.key, asset.path));
      }
    }

    create() {
      if (USE_GENERATED_PLACEHOLDERS) {
        createPlaceholderTextures(this);
      }

      this.gameSpeed = BASE_SPEED;
      this.distance = 0;
      this.h2o = 0;
      this.coins = 0;
      this.coinCarry = 0;
      this.visitedShopIndex = 0;
      this.buffs = {
        gel: 0,
        shoes: 0,
        shield: 0,
        invulnerable: 0,
      };
      this.spawnedShopIndex = 0;
      this.currentShopSprite = null;
      this.mergeEvents = SHOP_STOPS.map((stop, index) => ({
        shopIndex: index,
        km: Math.max(0.35, stop.km - Phaser.Math.FloatBetween(MERGE_EVENT_MIN_BEFORE_SHOP_KM, MERGE_EVENT_MAX_BEFORE_SHOP_KM)),
        triggered: false,
        resolved: false,
      }));
      this.mergeConflict = null;
      this.mergeInputLockUntil = 0;
      this.mergeControlLockUntil = 0;
      this.retroMusic = null;
      this.retroMusicTimer = null;
      this.retroMusicStep = 0;
      this.retroMusicStopAt = 0;
      this.gitScore = { player: 0, bot: 0 };
      this.botDino = null;
      this.runFrame = 0;
      this.nextRunFrameAt = 0;
      this.backgroundRunnerFrame = 0;
      this.nextBackgroundRunnerFrameAt = 0;
      this.nextObstacleAt = 720;
      this.nextCollectibleAt = 1300;
      this.jumpsLeft = 2;
      this.isSliding = false;
      this.isGameOver = false;
      this.isShopping = false;
      this.isFinished = false;
      this.isMenuOpen = true;
      this.isEditingName = false;
      this.isLeaderboardOpen = false;
      this.pendingPlayerName = '';
      this.playerName = readPlayerName();
      this.bestDistance = Math.min(RACE_DISTANCE_KM, readBestDistance());

      this.createWorld();
      this.createBackgroundRunners();
      this.createPlayer();
      this.createGroups();
      this.createHud();
      this.createControls();
      this.createMainMenu();
      this.bindInput();
      this.mobileControls.setVisible(false);
      this.updateHud();
    }

    createWorld() {
      this.add.rectangle(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x17225d);
      this.add.rectangle(VIRTUAL_WIDTH / 2, 210, VIRTUAL_WIDTH, 120, 0x25306f).setAlpha(0.38);

      this.clouds = this.add.tileSprite(VIRTUAL_WIDTH / 2, 54, VIRTUAL_WIDTH, 64, 'clouds').setAlpha(0.8);
      this.cityFar = this.add.tileSprite(VIRTUAL_WIDTH / 2, 134, VIRTUAL_WIDTH, 80, 'city-far').setAlpha(0.86);
      this.treesMid = this.add.tileSprite(VIRTUAL_WIDTH / 2, 176, VIRTUAL_WIDTH, 54, 'trees-mid');
      this.road = this.add.tileSprite(VIRTUAL_WIDTH / 2, 238, VIRTUAL_WIDTH, 64, 'road-tile');

      this.add.rectangle(VIRTUAL_WIDTH / 2, GROUND_Y + 5, VIRTUAL_WIDTH, 2, 0xfff0a6).setAlpha(0.55);
      this.ground = this.physics.add.staticImage(VIRTUAL_WIDTH / 2, GROUND_Y + 14, 'solid');
      this.ground.setDisplaySize(VIRTUAL_WIDTH + 48, 28).refreshBody();
      this.ground.setVisible(false);
    }

    createBackgroundRunners() {
      this.backgroundRunners = [];
      const rows = [
        { y: 191, scale: 0.82, speed: 23, alpha: 0.82 },
        { y: 199, scale: 0.9, speed: 31, alpha: 0.9 },
        { y: 207, scale: 0.98, speed: 39, alpha: 0.96 },
      ];

      rows.forEach((row, rowIndex) => {
        for (let index = 0; index < 4; index += 1) {
          const bibIndex = (index + rowIndex * 2) % BACKGROUND_RUNNER_BIBS.length;
          const runner = this.add.sprite(24 + index * 124 + rowIndex * 37, row.y, `runner-bg-${bibIndex}-0`);
          runner.setOrigin(0.5, 1);
          runner.setDepth(4 + rowIndex);
          runner.setScale(row.scale);
          runner.setAlpha(row.alpha);
          runner.speed = row.speed + index * 3;
          runner.frameOffset = (index + rowIndex) % 3;
          runner.baseY = row.y;
          runner.bibIndex = bibIndex;
          this.backgroundRunners.push(runner);
        }
      });
    }

    createPlayer() {
      this.player = this.physics.add.sprite(92, GROUND_Y - 2, 'dino-run-0');
      this.player.setOrigin(0.5, 1);
      this.player.setDepth(8);
      this.player.setCollideWorldBounds(true);
      this.player.body.setGravityY(GRAVITY_Y);
      this.player.body.setMaxVelocity(0, 640);
      this.setPlayerRunHitbox();

      this.physics.add.collider(this.player, this.ground, () => {
        this.jumpsLeft = 2;
      });
    }

    createGroups() {
      this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
      this.collectibles = this.physics.add.group({ allowGravity: false, immovable: true });
      this.shops = this.physics.add.group({ allowGravity: false, immovable: true });
      this.playerGitCoins = this.physics.add.group({ allowGravity: false, immovable: true });
      this.botGitCoins = this.physics.add.group({ allowGravity: false, immovable: true });

      this.physics.add.overlap(this.player, this.obstacles, (player, obstacle) => this.hitObstacle(obstacle), null, this);
      this.physics.add.overlap(this.player, this.collectibles, (player, bottle) => this.collectBottle(bottle), null, this);
      this.physics.add.overlap(this.player, this.playerGitCoins, (player, coin) => this.collectGitCoin(coin, 'player'), null, this);
    }

    createHud() {
      this.createRouteUi();

      const textStyle = {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '11px',
        color: '#fff6d8',
        stroke: '#101330',
        strokeThickness: 3,
      };

      this.hudText = this.add.text(10, 30, '', textStyle).setDepth(30);
      this.buffText = this.add.text(10, 45, '', textStyle).setDepth(30);
      this.tipText = this.add
        .text(VIRTUAL_WIDTH / 2, 64, 'Трасса 42 км: добегай до магазинов, покупай бафы и финишируй!', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#80ff8f',
          stroke: '#101330',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(30);

      this.time.delayedCall(3200, () => {
        if (this.tipText) {
          this.tweens.add({ targets: this.tipText, alpha: 0, duration: 450 });
        }
      });

      this.createMergeConflictUi();
      this.createShopPanel();
      this.createResultPanel();
      this.updateHud();
    }

    createRouteUi() {
      this.routeX = 42;
      this.routeY = 14;
      this.routeWidth = 392;
      this.routeTrack = this.add
        .rectangle(this.routeX, this.routeY, this.routeWidth, 8, 0x070a1e, 0.72)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0xfff6d8, 0.34)
        .setDepth(29);
      this.routeFill = this.add
        .rectangle(this.routeX, this.routeY, 1, 6, 0x80ff8f, 0.9)
        .setOrigin(0, 0.5)
        .setDepth(30);
      this.routeRunnerMarker = this.add
        .triangle(this.routeX, this.routeY + 13, 0, 9, 10, 9, 5, 0, 0x80ff8f)
        .setDepth(31);
      this.routeDistanceText = this.add
        .text(VIRTUAL_WIDTH / 2, 2, '0.0 / 42 KM', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '10px',
          color: '#fff6d8',
          stroke: '#101330',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(31);

      this.add
        .text(8, 9, 'СТАРТ', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '8px',
          color: '#9fb7ff',
          stroke: '#101330',
          strokeThickness: 2,
        })
        .setDepth(31);
      this.add
        .text(438, 9, '42К', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '8px',
          color: '#ffb84d',
          stroke: '#101330',
          strokeThickness: 2,
        })
        .setDepth(31);

      this.shopRouteMarkers = SHOP_STOPS.map((stop) => {
        const x = this.routeX + (stop.km / RACE_DISTANCE_KM) * this.routeWidth;
        const marker = this.add.circle(x, this.routeY, 4, 0xffb84d, 1).setStrokeStyle(1, 0x101330, 1).setDepth(32);
        const label = this.add
          .text(x, this.routeY + 10, `${stop.km}`, {
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '8px',
            color: '#ffdf8a',
            stroke: '#101330',
            strokeThickness: 2,
          })
          .setOrigin(0.5, 0)
          .setDepth(32);
        return { marker, label };
      });
    }

    createMergeConflictUi() {
      this.mergeUi = this.add.container(0, 0).setDepth(6).setVisible(false);
      this.mergePlayerLane = this.add.rectangle(VIRTUAL_WIDTH / 4, 164, VIRTUAL_WIDTH / 2, 178, 0x193657, 0.24);
      this.mergeBotLane = this.add.rectangle((VIRTUAL_WIDTH * 3) / 4, 164, VIRTUAL_WIDTH / 2, 178, 0x111943, 0.34);
      this.mergeDivider = this.add.rectangle(VIRTUAL_WIDTH / 2, 164, 3, 178, 0xfff6d8, 0.65);
      this.mergeBranchLinePlayer = this.add.rectangle(VIRTUAL_WIDTH / 4, GROUND_Y + 5, VIRTUAL_WIDTH / 2, 2, 0x80ff8f, 0.58);
      this.mergeBranchLineBot = this.add.rectangle((VIRTUAL_WIDTH * 3) / 4, MERGE_BOT_GROUND_Y + 5, VIRTUAL_WIDTH / 2, 2, 0xff657f, 0.58);
      this.mergeTitleText = this.add
        .text(VIRTUAL_WIDTH / 2, 33, 'MERGE CONFLICT', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '22px',
          color: '#ff657f',
          stroke: '#070a1e',
          strokeThickness: 5,
        })
        .setOrigin(0.5);
      this.mergeInfoText = this.add
        .text(VIRTUAL_WIDTH / 2, 57, 'left: player  |  right: bot', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '10px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.mergePlayerLabel = this.add
        .text(9, GROUND_Y - 62, 'YOUR BRANCH', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '9px',
          color: '#80ff8f',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5);
      this.mergeBotLabel = this.add
        .text(VIRTUAL_WIDTH / 2 + 9, MERGE_BOT_GROUND_Y - 62, 'BOT BRANCH', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '9px',
          color: '#ff8fb0',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5);
      this.mergeScoreText = this.add
        .text(VIRTUAL_WIDTH - 10, 33, '', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '11px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 3,
          align: 'right',
        })
        .setOrigin(1, 0.5);

      this.mergeUi.add([
        this.mergePlayerLane,
        this.mergeBotLane,
        this.mergeDivider,
        this.mergeBranchLinePlayer,
        this.mergeBranchLineBot,
        this.mergeTitleText,
        this.mergeInfoText,
        this.mergePlayerLabel,
        this.mergeBotLabel,
        this.mergeScoreText,
      ]);

      this.mergeIntroPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2).setDepth(80).setVisible(false);
      const introShade = this.add.rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0x070a1e, 0.72);
      const introBg = this.add.rectangle(0, 0, 408, 154, 0x101330, 0.97).setStrokeStyle(2, 0xff657f, 0.85);
      const introTitle = this.add
        .text(0, -50, 'MERGE CONFLICT', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '24px',
          color: '#ff657f',
          stroke: '#070a1e',
          strokeThickness: 5,
        })
        .setOrigin(0.5);
      const introBody = this.add
        .text(0, -4, 'Экран разделится: слева ты, справа бот.\nЗа 15–20 секунд собери больше git-значков.\nЕсли бот соберёт больше — забег начнётся заново.', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '11px',
          color: '#fff6d8',
          align: 'center',
          lineSpacing: 4,
        })
        .setOrigin(0.5);
      const introHint = this.add
        .text(0, 56, 'PRESS ANY KEY / TAP TO START', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '11px',
          color: '#80ff8f',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.mergeIntroPanel.add([introShade, introBg, introTitle, introBody, introHint]);
    }

    createShopPanel() {
      this.shopPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 8).setDepth(70).setVisible(false);
      const bg = this.add.rectangle(0, 0, 398, 216, 0x101330, 0.96).setStrokeStyle(2, 0xffb84d, 0.8);
      this.shopTitle = this.add
        .text(0, -91, 'МАГАЗИН', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '18px',
          color: '#ffdf8a',
          stroke: '#070a1e',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.shopBalance = this.add
        .text(0, -70, '', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '11px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.shopMessage = this.add
        .text(0, 56, 'Нажми товар или клавиши 1/2/3. Потом продолжи бег.', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '10px',
          color: '#9fb7ff',
          align: 'center',
        })
        .setOrigin(0.5);

      this.shopRows = SHOP_ITEMS.map((item, index) => {
        const y = -40 + index * 35;
        const box = this.add
          .rectangle(0, y, 354, 30, 0x193657, 0.95)
          .setStrokeStyle(1, 0xfff6d8, 0.28)
          .setInteractive({ useHandCursor: true });
        const text = this.add
          .text(-166, y, `${index + 1}. ${item.name} — ${item.price} монет\n${item.effect}`, {
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '10px',
            color: '#fff6d8',
            lineSpacing: 1,
          })
          .setOrigin(0, 0.5);
        box.on('pointerdown', () => this.buyShopItem(index));
        return { box, text, item };
      });

      this.continueButton = this.add
        .rectangle(0, 88, 156, 26, 0x1f8f58, 0.92)
        .setStrokeStyle(1, 0x80ff8f, 0.9)
        .setInteractive({ useHandCursor: true });
      this.continueText = this.add
        .text(0, 88, 'ПРОДОЛЖИТЬ ▶', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.continueButton.on('pointerdown', () => this.closeShop());

      this.shopPanel.add([
        bg,
        this.shopTitle,
        this.shopBalance,
        ...this.shopRows.flatMap((row) => [row.box, row.text]),
        this.shopMessage,
        this.continueButton,
        this.continueText,
      ]);
    }

    createResultPanel() {
      this.resultPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2).setDepth(75).setVisible(false);
      const panelBg = this.add.rectangle(0, 0, 338, 168, 0x101330, 0.94).setStrokeStyle(2, 0xfff6d8, 0.45);
      this.resultTitle = this.add
        .text(0, -52, 'ТЕМП ПОТЕРЯН!', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '24px',
          color: '#ff657f',
          stroke: '#070a1e',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.resultScore = this.add
        .text(0, -8, '', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#fff6d8',
          align: 'center',
        })
        .setOrigin(0.5);
      const panelHint = this.add
        .text(0, 38, 'Space / R — меню', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#9fb7ff',
        })
        .setOrigin(0.5);
      this.resultMenuButton = createMenuButton(this, 0, 66, 94, 30, 'МЕНЮ', 0x9fb7ff);
      this.resultMenuButton.bg.on('pointerdown', () => this.returnToMenu());
      this.resultPanel.add([panelBg, this.resultTitle, this.resultScore, panelHint, this.resultMenuButton.bg, this.resultMenuButton.label]);
    }

    createMainMenu() {
      this.menuPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2).setDepth(90);
      const bg = this.add.rectangle(0, 0, 382, 232, 0x101330, 0.96).setStrokeStyle(2, 0xfff6d8, 0.46);
      const title = this.add
        .text(0, -92, 'DINO PACE RUN', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '24px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.menuNameText = this.add
        .text(0, -64, '', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#80ff8f',
          stroke: '#070a1e',
          strokeThickness: 3,
        })
        .setOrigin(0.5);

      this.startButton = createMenuButton(this, -122, -28, 94, 34, 'СТАРТ', 0x80ff8f);
      this.nameButton = createMenuButton(this, -12, -28, 88, 34, 'ИМЯ', 0xffb84d);
      this.leaderboardButton = createMenuButton(this, 112, -28, 132, 34, 'ЛИДЕРБОРД', 0x9fb7ff);

      this.startButton.bg.on('pointerdown', () => this.startRun());
      this.nameButton.bg.on('pointerdown', () => this.changePlayerName());
      this.leaderboardButton.bg.on('pointerdown', () => this.loadMenuLeaderboard());

      this.menuPanel.add([
        bg,
        title,
        this.menuNameText,
        this.startButton.bg,
        this.startButton.label,
        this.nameButton.bg,
        this.nameButton.label,
        this.leaderboardButton.bg,
        this.leaderboardButton.label,
      ]);
      this.updateMenuName();
      this.createLeaderboardPanel();
    }

    createLeaderboardPanel() {
      this.leaderboardPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2).setDepth(100).setVisible(false);
      const bg = this.add
        .rectangle(0, 0, 334, 214, 0x101330, 0.98)
        .setStrokeStyle(2, 0x9fb7ff, 0.7)
        .setInteractive();
      const title = this.add
        .text(0, -88, 'ЛИДЕРБОРД', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '20px',
          color: '#fff6d8',
          stroke: '#070a1e',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.leaderboardText = this.add
        .text(0, -8, 'загружаю...', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '10px',
          color: '#ffdf8a',
          align: 'center',
          lineSpacing: 1,
        })
        .setOrigin(0.5);
      this.leaderboardCloseButton = createMenuButton(this, 0, 82, 94, 30, 'НАЗАД', 0x9fb7ff);
      this.leaderboardCloseButton.bg.on('pointerdown', () => this.closeLeaderboard());
      this.leaderboardPanel.add([
        bg,
        title,
        this.leaderboardText,
        this.leaderboardCloseButton.bg,
        this.leaderboardCloseButton.label,
      ]);
    }

    startRun() {
      this.isMenuOpen = false;
      this.menuPanel.setVisible(false);
      this.mobileControls.setVisible(true);
    }

    changePlayerName() {
      this.isEditingName = true;
      this.pendingPlayerName = '';
      this.updateMenuName();
    }

    updateMenuName() {
      const shownName = this.isEditingName ? `${this.pendingPlayerName || '_'}_` : this.playerName;
      this.menuNameText.setText(`ИГРОК: ${shownName}`);
    }

    commitPlayerName() {
      this.playerName = normalizePlayerName(this.pendingPlayerName || this.playerName);
      writePlayerName(this.playerName);
      this.isEditingName = false;
      this.pendingPlayerName = '';
      this.updateMenuName();
    }

    cancelPlayerNameEdit() {
      this.isEditingName = false;
      this.pendingPlayerName = '';
      this.updateMenuName();
    }

    handleNameInput(event) {
      if (event.key === 'Enter') {
        this.commitPlayerName();
        return;
      }
      if (event.key === 'Escape') {
        this.cancelPlayerNameEdit();
        return;
      }
      if (event.key === 'Backspace') {
        this.pendingPlayerName = this.pendingPlayerName.slice(0, -1);
        this.updateMenuName();
        return;
      }
      if (event.key.length === 1 && this.pendingPlayerName.length < 16 && /[\p{L}\p{N}_ -]/u.test(event.key)) {
        this.pendingPlayerName += event.key;
        this.updateMenuName();
      }
    }

    returnToMenu() {
      this.scene.restart();
    }

    loadMenuLeaderboard() {
      this.isLeaderboardOpen = true;
      this.leaderboardPanel.setVisible(true);
      this.leaderboardText.setText('загружаю...');
      readLeaderboard(this.playerName)
        .then(({ leaderboard, playerRank }) => {
          this.leaderboardText.setText(formatLeaderboard(leaderboard, this.playerName, playerRank));
        })
        .catch(() => {
          const leaderboard = readLocalLeaderboard();
          this.leaderboardText.setText(`${formatLeaderboard(leaderboard, this.playerName, null)}\nOFFLINE`);
        });
    }

    closeLeaderboard() {
      this.isLeaderboardOpen = false;
      this.leaderboardPanel.setVisible(false);
    }

    createControls() {
      this.mobileControls = this.add.container(0, 0).setDepth(50);
      this.slideButton = createTouchButton(this, 74, VIRTUAL_HEIGHT - 39, 110, 50, 'SLIDE', 0xffb84d);
      this.jumpButton = createTouchButton(this, VIRTUAL_WIDTH - 74, VIRTUAL_HEIGHT - 39, 110, 50, 'JUMP', 0x80ff8f);
      this.gameMenuButton = createMenuButton(this, VIRTUAL_WIDTH - 42, 38, 68, 24, 'МЕНЮ', 0x9fb7ff);
      this.mobileControls.add([
        this.slideButton.bg,
        this.slideButton.label,
        this.jumpButton.bg,
        this.jumpButton.label,
        this.gameMenuButton.bg,
        this.gameMenuButton.label,
      ]);

      this.jumpButton.bg.on('pointerdown', () => this.jump());
      this.slideButton.bg.on('pointerdown', () => this.startSlide());
      this.slideButton.bg.on('pointerup', () => this.requestSlideRelease());
      this.slideButton.bg.on('pointerout', () => this.requestSlideRelease());
      this.gameMenuButton.bg.on('pointerdown', () => this.returnToMenu());
    }

    bindInput() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys({
        w: Phaser.Input.Keyboard.KeyCodes.W,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        r: Phaser.Input.Keyboard.KeyCodes.R,
        l: Phaser.Input.Keyboard.KeyCodes.L,
        n: Phaser.Input.Keyboard.KeyCodes.N,
        one: Phaser.Input.Keyboard.KeyCodes.ONE,
        two: Phaser.Input.Keyboard.KeyCodes.TWO,
        three: Phaser.Input.Keyboard.KeyCodes.THREE,
        enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      });

      this.input.keyboard.on('keydown', (event) => {
        if (this.isEditingName) {
          this.handleNameInput(event);
          return;
        }
        if (this.isMenuOpen) return;
        this.confirmMergeIntro();
      });

      this.input.on('pointerdown', (pointer) => {
        if (this.isMenuOpen) return;
        if (isPointerOnGameMenu(pointer)) {
          this.returnToMenu();
          return;
        }
        if (this.confirmMergeIntro()) return;
        if ((this.isGameOver || this.isFinished) && !isPointerOnControls(pointer)) {
          this.returnToMenu();
        }
      });
    }

    update(time, delta) {
      this.readKeyboard();

      if (this.isMenuOpen) {
        return;
      }

      if (this.isGameOver || this.isShopping || this.isFinished) {
        return;
      }

      if (this.mergeConflict?.waitingForStart) {
        this.updateHud();
        return;
      }

      const dt = delta / 1000;
      this.updateBuffTimers(dt);

      const paceAcceleration = this.buffs.gel > 0 ? 1.2 : 3.8;
      this.gameSpeed = Math.min(MAX_SPEED, this.gameSpeed + paceAcceleration * dt);
      const scrollSpeed = this.getScrollSpeed();

      if (this.mergeConflict?.active) {
        this.scrollWorld(scrollSpeed, dt);
        this.updatePlayerAnimation(time);
        this.updateMergeConflict(delta, scrollSpeed, time);
        this.updateMovingObjects(scrollSpeed);
        this.updateHud();
        return;
      }

      const previousDistance = this.distance;
      const nextDistance = Math.min(RACE_DISTANCE_KM, this.distance + scrollSpeed * dt * KM_PER_SPEED_SECOND);
      const nextShop = SHOP_STOPS[this.visitedShopIndex];

      this.spawnUpcomingShop(nextDistance);

      if (this.shouldStartMergeConflict(nextDistance)) {
        this.distance = nextDistance;
        this.awardCoinsForDistance(previousDistance, this.distance);
        this.startMergeConflict();
        this.updateHud();
        return;
      }

      if (nextShop && nextDistance >= nextShop.km) {
        this.distance = nextShop.km;
        this.awardCoinsForDistance(previousDistance, this.distance);
        this.openShop(nextShop);
        this.updateHud();
        return;
      }

      this.distance = nextDistance;
      this.awardCoinsForDistance(previousDistance, this.distance);
      this.scrollWorld(scrollSpeed, dt);

      this.updatePlayerAnimation(time);
      this.updateSpawning(delta);
      this.updateMovingObjects(scrollSpeed);
      this.updateHud();

      if (this.distance >= RACE_DISTANCE_KM) {
        this.finishRace();
      }
    }

    scrollWorld(scrollSpeed, dt) {
      this.clouds.tilePositionX += scrollSpeed * dt * 0.07;
      this.cityFar.tilePositionX += scrollSpeed * dt * 0.18;
      this.treesMid.tilePositionX += scrollSpeed * dt * 0.42;
      this.road.tilePositionX += scrollSpeed * dt;
      this.updateBackgroundRunners(scrollSpeed, dt);
    }

    updateBackgroundRunners(scrollSpeed, dt) {
      if (!this.backgroundRunners) return;
      if (this.time.now >= this.nextBackgroundRunnerFrameAt) {
        this.backgroundRunnerFrame = (this.backgroundRunnerFrame + 1) % 3;
        this.nextBackgroundRunnerFrameAt = this.time.now + 150;
      }

      this.backgroundRunners.forEach((runner) => {
        runner.x -= (runner.speed + scrollSpeed * 0.16) * dt;
        if (runner.x < -24) {
          runner.x = VIRTUAL_WIDTH + Phaser.Math.Between(16, 86);
        }
        runner.y = runner.baseY + Math.sin((this.time.now + runner.frameOffset * 180) * 0.012) * 1.2;
        runner.setTexture(`runner-bg-${runner.bibIndex}-${(this.backgroundRunnerFrame + runner.frameOffset) % 3}`);
      });
    }

    readKeyboard() {
      if (this.isMenuOpen) {
        if (this.isLeaderboardOpen) {
          return;
        }
        if (this.isEditingName) {
          return;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.enter) || Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
          this.startRun();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.n)) {
          this.changePlayerName();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.l)) {
          this.loadMenuLeaderboard();
        }
        return;
      }

      if (this.mergeConflict?.waitingForStart) {
        return;
      }
      if (this.mergeConflict?.active && this.time.now < this.mergeControlLockUntil) {
        return;
      }

      if (this.isShopping) {
        if (Phaser.Input.Keyboard.JustDown(this.keys.one)) this.buyShopItem(0);
        if (Phaser.Input.Keyboard.JustDown(this.keys.two)) this.buyShopItem(1);
        if (Phaser.Input.Keyboard.JustDown(this.keys.three)) this.buyShopItem(2);
        if (Phaser.Input.Keyboard.JustDown(this.keys.enter) || Phaser.Input.Keyboard.JustDown(this.cursors.space)) this.closeShop();
        return;
      }

      if (this.isGameOver || this.isFinished) {
        const restartPressed =
          Phaser.Input.Keyboard.JustDown(this.keys.r) ||
          Phaser.Input.Keyboard.JustDown(this.keys.w) ||
          Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
          Phaser.Input.Keyboard.JustDown(this.cursors.up);
        if (restartPressed) {
          this.returnToMenu();
        }
        return;
      }

      const jumpPressed =
        Phaser.Input.Keyboard.JustDown(this.keys.w) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.up);
      const slidePressed = Phaser.Input.Keyboard.JustDown(this.keys.s) || Phaser.Input.Keyboard.JustDown(this.cursors.down);

      if (jumpPressed) {
        this.jump();
      }
      if (slidePressed) {
        this.startSlide();
      }
    }

    jump() {
      if (this.isShopping || this.mergeConflict?.waitingForStart) return;
      if (this.mergeConflict?.active && this.time.now < this.mergeControlLockUntil) return;
      if (this.isGameOver || this.isFinished) {
        this.returnToMenu();
        return;
      }
      if (this.isSliding) {
        return;
      }

      const onGround = this.player.body.blocked.down || this.player.body.touching.down;
      if (onGround) {
        this.jumpsLeft = 2;
      }
      if (this.jumpsLeft <= 0) {
        return;
      }

      const jumpPower = this.buffs.shoes > 0 ? { ground: -440, air: -360 } : { ground: -380, air: -320 };
      this.player.setVelocityY(onGround ? jumpPower.ground : jumpPower.air);
      this.jumpsLeft -= 1;
      this.player.setTexture('dino-jump');
      this.setPlayerRunHitbox();
      this.soundBeep(this.buffs.shoes > 0 ? 520 : 420, 0.035);
    }

    startSlide() {
      if (this.isShopping || this.mergeConflict?.waitingForStart || this.mergeConflict?.active && this.time.now < this.mergeControlLockUntil || this.isFinished || this.isGameOver || this.isSliding) {
        return;
      }

      const onGround = this.player.body.blocked.down || this.player.body.touching.down;
      if (!onGround) {
        this.player.setVelocityY(Math.min(this.player.body.velocity.y + 270, 640));
        return;
      }

      this.isSliding = true;
      this.player.setTexture('dino-slide');
      this.player.body.setSize(PLAYER_SLIDE_HITBOX.width, PLAYER_SLIDE_HITBOX.height);
      this.player.body.setOffset(PLAYER_SLIDE_HITBOX.offsetX, PLAYER_SLIDE_HITBOX.offsetY);
      this.soundBeep(220, 0.025);

      if (this.slideTimer) {
        this.slideTimer.remove(false);
      }
      this.slideTimer = this.time.delayedCall(560, () => this.endSlide());
    }

    requestSlideRelease() {
      if (this.isSliding && this.slideTimer && this.slideTimer.getProgress() > 0.35) {
        this.endSlide();
      }
    }

    endSlide() {
      if (!this.isSliding) {
        return;
      }
      this.isSliding = false;
      this.player.setTexture('dino-run-0');
      this.setPlayerRunHitbox();
    }

    setPlayerRunHitbox() {
      if (!this.player || !this.player.body) return;
      this.player.body.setSize(PLAYER_RUN_HITBOX.width, PLAYER_RUN_HITBOX.height);
      this.player.body.setOffset(PLAYER_RUN_HITBOX.offsetX, PLAYER_RUN_HITBOX.offsetY);
    }

    updatePlayerAnimation(time) {
      const onGround = this.player.body.blocked.down || this.player.body.touching.down;
      if (this.isSliding) {
        return;
      }
      if (!onGround) {
        this.player.setTexture('dino-jump');
        return;
      }

      if (time >= this.nextRunFrameAt) {
        const frames = ASSETS.character.run;
        this.runFrame = (this.runFrame + 1) % frames.length;
        this.player.setTexture(frames[this.runFrame].key);
        this.nextRunFrameAt = time + Phaser.Math.Clamp(130 - (this.gameSpeed - BASE_SPEED) * 0.22, 74, 130);
      }
    }

    updateBuffTimers(dt) {
      this.buffs.gel = Math.max(0, this.buffs.gel - dt);
      this.buffs.shoes = Math.max(0, this.buffs.shoes - dt);
      this.buffs.invulnerable = Math.max(0, this.buffs.invulnerable - dt);
      if (this.buffs.invulnerable > 0) {
        this.player.setAlpha(this.time.now % 160 < 80 ? 0.45 : 1);
      } else if (!this.isGameOver && !this.isFinished) {
        this.player.setAlpha(1);
      }
    }

    getScrollSpeed() {
      return this.gameSpeed * (this.buffs.gel > 0 ? 0.74 : 1);
    }

    awardCoinsForDistance(fromKm, toKm) {
      const delta = Math.max(0, toKm - fromKm);
      this.coinCarry += delta * COINS_PER_KM;
      const wholeCoins = Math.floor(this.coinCarry);
      if (wholeCoins > 0) {
        this.coins += wholeCoins;
        this.coinCarry -= wholeCoins;
      }
    }

    updateSpawning(delta) {
      this.nextObstacleAt -= delta;
      this.nextCollectibleAt -= delta;

      if (this.nextObstacleAt <= 0) {
        this.spawnObstacle();
        const difficulty = Phaser.Math.Clamp((this.gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
        const gelBonus = this.buffs.gel > 0 ? 190 : 0;
        this.nextObstacleAt = Phaser.Math.Between(930, 1540) - difficulty * 330 + gelBonus;
      }

      if (this.nextCollectibleAt <= 0) {
        this.spawnBottle();
        this.nextCollectibleAt = Phaser.Math.Between(1700, 3100);
      }
    }

    updateMovingObjects(scrollSpeed) {
      this.obstacles.children.each((obstacle) => {
        obstacle.body.setVelocityX(-scrollSpeed);
        if (obstacle.x < -44) {
          obstacle.destroy();
        }
      });

      this.collectibles.children.each((bottle) => {
        bottle.body.setVelocityX(-scrollSpeed * 0.96);
        bottle.angle = Math.sin((this.time.now + bottle.spawnOffset) * 0.006) * 5;
        if (bottle.x < -32) {
          bottle.destroy();
        }
      });

      this.shops.children.each((shop) => {
        shop.body.setVelocityX(-scrollSpeed);
        if (shop.x < -80) {
          shop.destroy();
        }
      });

      this.playerGitCoins.children.each((coin) => this.updateGitCoinSprite(coin, scrollSpeed, 'player'));
      this.botGitCoins.children.each((coin) => this.updateGitCoinSprite(coin, scrollSpeed, 'bot'));
    }

    updateGitCoinSprite(coin, scrollSpeed, owner) {
      coin.body.setVelocityX(-scrollSpeed * 1.02);
      coin.angle += 5;
      const leftBound = owner === 'bot' ? VIRTUAL_WIDTH / 2 - 8 : -32;
      if (coin.x < leftBound) {
        coin.destroy();
      }
    }

    spawnUpcomingShop(nextDistance) {
      const stop = SHOP_STOPS[this.spawnedShopIndex];
      if (!stop || nextDistance < stop.km - SHOP_SPAWN_LOOKAHEAD_KM) {
        return;
      }

      const shop = this.shops.create(VIRTUAL_WIDTH + 46, GROUND_Y + 2, 'shop-stand');
      shop.setOrigin(0.5, 1);
      shop.setDepth(5);
      shop.body.allowGravity = false;
      shop.body.immovable = true;
      shop.body.setVelocityX(-this.getScrollSpeed());
      shop.body.setSize(42, 34).setOffset(7, 10);
      shop.stopIndex = this.spawnedShopIndex;
      this.currentShopSprite = shop;
      this.spawnedShopIndex += 1;
    }

    shouldStartMergeConflict(nextDistance) {
      const event = this.mergeEvents[this.visitedShopIndex];
      return Boolean(event && !event.triggered && !event.resolved && nextDistance >= event.km);
    }

    startMergeConflict() {
      const event = this.mergeEvents[this.visitedShopIndex];
      if (!event) return;

      event.triggered = true;
      this.gitScore.player = 0;
      this.gitScore.bot = 0;
      this.mergeConflict = {
        active: false,
        waitingForStart: true,
        event,
        timeLeft: Phaser.Math.Between(MERGE_EVENT_MIN_SECONDS, MERGE_EVENT_MAX_SECONDS),
        nextPlayerCoinAt: 0,
        nextBotCoinAt: 0,
        botDecisionAt: 0,
        botTarget: null,
      };

      this.nextObstacleAt = Math.max(this.nextObstacleAt, 1300);
      this.nextCollectibleAt = Math.max(this.nextCollectibleAt, 1000);
      this.obstacles.clear(true, true);
      this.collectibles.clear(true, true);
      this.playerGitCoins.clear(true, true);
      this.botGitCoins.clear(true, true);
      if (this.isSliding) this.endSlide();
      this.jumpsLeft = 2;
      this.mergeInputLockUntil = this.time.now + 180;
      this.physics.pause();
      this.mergeIntroPanel?.setVisible(true);
      this.showMergeUi(false);
      this.updateMergeHud();
      this.startRetroMusic();
      this.soundBeep(180, 0.06);
      this.soundBeep(260, 0.06);
    }

    confirmMergeIntro() {
      const state = this.mergeConflict;
      if (!state?.waitingForStart || this.time.now < this.mergeInputLockUntil) {
        return false;
      }

      state.waitingForStart = false;
      state.active = true;
      state.nextPlayerCoinAt = 0;
      state.nextBotCoinAt = 0;
      state.botDecisionAt = 0;
      state.botTarget = null;
      this.mergeIntroPanel?.setVisible(false);
      this.stopRetroMusic();
      this.physics.resume();
      this.mergeControlLockUntil = this.time.now + 160;
      this.player.setTint(0x80ff8f);
      this.cameras.main.flash(260, 255, 101, 127, false);
      this.showMergeUi(true);
      this.createBotDino();
      this.updateMergeHud();
      this.spawnPopup(VIRTUAL_WIDTH / 2, 88, 'MERGE CONFLICT');
      return true;
    }

    showMergeUi(visible) {
      this.mergeUi?.setVisible(visible);
    }

    createBotDino() {
      if (this.botGitOverlap) {
        this.botGitOverlap.destroy();
        this.botGitOverlap = null;
      }
      if (this.botDino?.active) {
        this.botDino.destroy();
      }
      this.botDino = this.physics.add.sprite(MERGE_BOT_X, MERGE_BOT_GROUND_Y - 2, 'dino-run-0');
      this.botDino.setOrigin(0.5, 1);
      this.botDino.setDepth(8);
      this.botDino.setTint(0xff8fb0);
      this.botDino.body.allowGravity = false;
      this.botDino.body.setSize(PLAYER_RUN_HITBOX.width, PLAYER_RUN_HITBOX.height);
      this.botDino.body.setOffset(PLAYER_RUN_HITBOX.offsetX, PLAYER_RUN_HITBOX.offsetY);
      this.botGitOverlap = this.physics.add.overlap(this.botDino, this.botGitCoins, (bot, coin) => this.collectGitCoin(coin, 'bot'), null, this);
    }

    updateMergeConflict(delta, scrollSpeed, time) {
      const state = this.mergeConflict;
      if (!state?.active) return;

      state.timeLeft -= delta / 1000;
      state.nextPlayerCoinAt -= delta;
      state.nextBotCoinAt -= delta;

      if (state.nextPlayerCoinAt <= 0) {
        this.spawnGitCoin('player');
        state.nextPlayerCoinAt = Phaser.Math.Between(MERGE_GIT_SPAWN_MIN_MS, MERGE_GIT_SPAWN_MAX_MS);
      }
      if (state.nextBotCoinAt <= 0) {
        this.spawnGitCoin('bot');
        state.nextBotCoinAt = Phaser.Math.Between(MERGE_GIT_SPAWN_MIN_MS, MERGE_GIT_SPAWN_MAX_MS);
      }

      this.updateBotRunner(delta, time);
      this.updateMergeHud();

      if (state.timeLeft <= 0) {
        this.finishMergeConflict();
      }
    }

    spawnGitCoin(owner) {
      const isBot = owner === 'bot';
      const offsets = isBot ? MERGE_BOT_COIN_OFFSETS : MERGE_PLAYER_COIN_OFFSETS;
      const groundY = isBot ? MERGE_BOT_GROUND_Y : GROUND_Y;
      const y = groundY - offsets[Phaser.Math.Between(0, offsets.length - 1)];
      const group = isBot ? this.botGitCoins : this.playerGitCoins;
      const spawnX = isBot ? MERGE_BOT_COIN_SPAWN_X : MERGE_PLAYER_COIN_SPAWN_X;
      const coin = group.create(spawnX, y, 'git-token');
      coin.setOrigin(0.5);
      coin.setDepth(9);
      coin.body.allowGravity = false;
      coin.body.immovable = true;
      coin.body.setVelocityX(-this.getScrollSpeed() * 1.02);
      coin.body.setSize(15, 15).setOffset(2, 2);
      coin.value = 1;
      coin.spawnOffset = Phaser.Math.Between(0, 999);
    }

    collectGitCoin(coin, owner) {
      if (!coin?.active || !this.mergeConflict?.active) return;
      if (owner === 'bot') {
        const errorChance = Phaser.Math.Between(MERGE_BOT_COLLECT_ERROR_MIN, MERGE_BOT_COLLECT_ERROR_MAX);
        if (Phaser.Math.Between(1, 100) <= errorChance) {
          coin.destroy();
          this.mergeConflict.botTarget = null;
          return;
        }
      }

      const x = coin.x;
      const y = coin.y;
      coin.destroy();
      this.gitScore[owner] += 1;
      if (owner === 'player') {
        this.soundBeep(880, 0.025);
        this.spawnPopup(x, y, '+1 git');
      }
      this.updateMergeHud();
    }

    updateBotRunner(delta, time) {
      if (!this.botDino?.active) return;
      const state = this.mergeConflict;
      if (time >= state.botDecisionAt) {
        state.botDecisionAt = time + Phaser.Math.Between(160, 260);
        state.botTarget = this.pickBotTargetCoin();
      }

      const scoreLead = this.gitScore.bot - this.gitScore.player;
      const targetY = state.botTarget?.active ? state.botTarget.y : MERGE_BOT_GROUND_Y - 16;
      const botSpeed = MERGE_BOT_VERTICAL_SPEED + Phaser.Math.Clamp(scoreLead, -3, 5) * 12;
      const nextY = this.moveTowards(this.botDino.y, targetY, botSpeed * (delta / 1000));
      this.botDino.setY(Phaser.Math.Clamp(nextY, MERGE_BOT_MIN_Y, MERGE_BOT_GROUND_Y - 2));

      if (time >= this.nextRunFrameAt - 45) {
        const frames = ASSETS.character.run;
        this.botDino.setTexture(frames[(this.runFrame + 1) % frames.length].key);
      }
    }

    pickBotTargetCoin() {
      let bestCoin = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      this.botGitCoins.children.each((coin) => {
        if (!coin.active || coin.x < this.botDino.x || coin.x > this.botDino.x + MERGE_BOT_LOOKAHEAD_X) return;
        const adaptiveMissChance = Phaser.Math.Clamp(MERGE_BOT_MISS_CHANCE + (this.gitScore.bot - this.gitScore.player) * 4, 6, 34);
        if (Phaser.Math.Between(0, 99) < adaptiveMissChance) return;
        const distance = Math.abs(coin.x - this.botDino.x) + Math.abs(coin.y - this.botDino.y) * 1.6;
        if (distance < bestDistance) {
          bestCoin = coin;
          bestDistance = distance;
        }
      });
      return bestCoin;
    }

    moveTowards(current, target, maxDelta) {
      if (Math.abs(target - current) <= maxDelta) {
        return target;
      }
      return current + (target > current ? 1 : -1) * maxDelta;
    }

    updateMergeHud() {
      if (!this.mergeScoreText || !this.mergeConflict?.active) return;
      this.mergeScoreText.setText(
        `TIME ${Math.max(0, Math.ceil(this.mergeConflict.timeLeft))}s\nPLAYER ${this.gitScore.player} git\nBOT ${this.gitScore.bot} git`,
      );
    }

    finishMergeConflict() {
      const state = this.mergeConflict;
      if (!state?.active) return;

      state.active = false;
      state.event.resolved = true;
      this.playerGitCoins.clear(true, true);
      this.botGitCoins.clear(true, true);
      if (this.botGitOverlap) {
        this.botGitOverlap.destroy();
        this.botGitOverlap = null;
      }
      if (this.botDino?.active) {
        this.botDino.destroy();
      }
      this.botDino = null;
      this.showMergeUi(false);
      this.player.clearTint();

      if (this.gitScore.player >= this.gitScore.bot) {
        this.buffs.invulnerable = Math.max(this.buffs.invulnerable, 1);
        this.nextObstacleAt = Math.max(this.nextObstacleAt, 1150);
        this.nextCollectibleAt = Math.max(this.nextCollectibleAt, 900);
        this.cameras.main.flash(240, 128, 255, 143, false);
        this.spawnPopup(VIRTUAL_WIDTH / 2, 92, `MERGE WIN ${this.gitScore.player}:${this.gitScore.bot}`);
        this.soundBeep(920, 0.06);
        this.mergeConflict = null;
        this.updateHud();
        return;
      }

      this.mergeConflict = null;
      this.loseMergeConflict();
    }

    loseMergeConflict() {
      this.isGameOver = true;
      this.physics.pause();
      if (this.isSliding) this.endSlide();
      this.player.setTint(0xff657f);
      this.cameras.main.shake(180, 0.012);
      this.soundBeep(110, 0.08);

      const finalDistance = Math.floor(this.distance * 10) / 10;
      this.saveBestDistance(finalDistance);
      this.saveLeaderboardDistance(finalDistance);
      this.resultTitle.setText('MERGE CONFLICT LOST');
      this.resultTitle.setColor('#ff657f');
      this.resultScore.setText(
        `BOT СОБРАЛ БОЛЬШЕ git-ВАЛЮТЫ\nPLAYER ${this.gitScore.player}   BOT ${this.gitScore.bot}\nДИСТ ${formatKm(finalDistance)} / ${RACE_DISTANCE_KM} КМ\nРЕКОРД ${formatKm(this.bestDistance)} КМ`,
      );
      this.resultPanel.setVisible(true);
    }

    saveLeaderboardDistance(distance) {
      writeLeaderboardDistance(distance, this.playerName)
        .catch(() => {
          writeLocalLeaderboardDistance(distance, this.playerName);
        });
    }

    spawnObstacle() {
      const roll = Phaser.Math.Between(0, 99);
      const key = roll > 74 ? 'hurdle' : roll > 48 ? 'cone' : 'cactus';
      const obstacle = this.obstacles.create(VIRTUAL_WIDTH + 32, GROUND_Y + 1, key);
      obstacle.setOrigin(0.5, 1);
      obstacle.setDepth(7);
      obstacle.body.allowGravity = false;
      obstacle.body.immovable = true;
      obstacle.body.setVelocityX(-this.getScrollSpeed());

      if (key === 'hurdle') {
        obstacle.body.setSize(24, 18).setOffset(2, 4);
      } else if (key === 'cone') {
        obstacle.body.setSize(17, 23).setOffset(3, 5);
      } else {
        obstacle.body.setSize(17, 27).setOffset(2, 3);
      }
    }

    spawnBottle() {
      const y = GROUND_Y - Phaser.Math.Between(52, 100);
      const bottle = this.collectibles.create(VIRTUAL_WIDTH + 26, y, 'h2o-bottle');
      bottle.setOrigin(0.5, 0.5);
      bottle.setDepth(6);
      bottle.body.allowGravity = false;
      bottle.body.immovable = true;
      bottle.body.setVelocityX(-this.getScrollSpeed() * 0.96);
      bottle.body.setSize(13, 17).setOffset(2, 3);
      bottle.spawnOffset = Phaser.Math.Between(0, 999);
    }

    collectBottle(bottle) {
      if (!bottle.active) return;
      const x = bottle.x;
      const y = bottle.y;
      bottle.destroy();
      this.h2o += 1;
      this.coins += H2O_COIN_REWARD;
      this.soundBeep(720, 0.04);
      this.spawnPopup(x, y, `+${H2O_COIN_REWARD} МОНЕТ`);
      this.updateHud();
    }

    spawnPopup(x, y, text) {
      const popup = this.add
        .text(x, y, text, {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#80ffef',
          stroke: '#101330',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(40);

      this.tweens.add({
        targets: popup,
        y: y - 22,
        alpha: 0,
        duration: 620,
        ease: 'Quad.easeOut',
        onComplete: () => popup.destroy(),
      });
    }

    openShop(stop) {
      this.isShopping = true;
      const shopSprite = this.currentShopSprite?.active ? this.currentShopSprite : null;
      if (shopSprite) {
        shopSprite.x = Phaser.Math.Clamp(shopSprite.x, this.player.x + 58, this.player.x + 96);
        shopSprite.y = GROUND_Y + 2;
        shopSprite.body.setVelocityX(0);
      }
      this.visitedShopIndex += 1;
      this.physics.pause();
      if (this.isSliding) this.endSlide();
      this.player.setTexture('dino-run-0');
      this.shopTitle.setText(`${stop.name} — ${formatKm(stop.km)} КМ`);
      this.shopMessage.setText('Нажми товар или клавиши 1/2/3. Потом продолжи бег.');
      this.updateShopPanel();
      this.shopPanel.setVisible(true);
      this.soundBeep(650, 0.06);
    }

    closeShop() {
      if (!this.isShopping) return;
      this.isShopping = false;
      this.shopPanel.setVisible(false);
      this.buffs.invulnerable = 1;
      this.player.setTint(0x80ffef);
      this.time.delayedCall(1000, () => {
        if (!this.isGameOver && !this.isFinished) {
          this.player.clearTint();
          this.player.setAlpha(1);
        }
      });
      this.nextObstacleAt = Math.max(this.nextObstacleAt, 1150);
      this.nextCollectibleAt = Math.max(this.nextCollectibleAt, 900);
      this.physics.resume();
      this.soundBeep(500, 0.035);
      this.spawnPopup(this.player.x + 20, this.player.y - 28, 'НЕУЯЗВИМОСТЬ 1С');
    }

    buyShopItem(index) {
      if (!this.isShopping) return;
      const item = SHOP_ITEMS[index];
      if (!item) return;

      if (this.coins < item.price) {
        this.shopMessage.setText(`Не хватает монет: ${item.price - this.coins}.`);
        this.soundBeep(130, 0.05);
        this.updateShopPanel();
        return;
      }

      this.coins -= item.price;
      if (item.id === 'gel') {
        this.buffs.gel += 12;
      } else if (item.id === 'shoes') {
        this.buffs.shoes += 15;
      } else if (item.id === 'shield') {
        this.buffs.shield += 1;
      }
      this.shopMessage.setText(`${item.name} куплен! ${item.effect}`);
      this.soundBeep(820, 0.045);
      this.updateShopPanel();
      this.updateHud();
    }

    updateShopPanel() {
      if (!this.shopBalance) return;
      this.shopBalance.setText(`БАЛАНС: ${this.coins} МОНЕТ   H2O: ${this.h2o}`);
      this.shopRows.forEach((row) => {
        const canBuy = this.coins >= row.item.price;
        row.box.setFillStyle(canBuy ? 0x193657 : 0x2c2039, 0.95);
        row.box.setStrokeStyle(1, canBuy ? 0x80ff8f : 0xff657f, canBuy ? 0.48 : 0.38);
        row.text.setColor(canBuy ? '#fff6d8' : '#c9adc0');
      });
    }

    hitObstacle(obstacle) {
      if (this.isGameOver || this.isFinished || this.isShopping) return;

      if (this.buffs.invulnerable > 0) {
        const x = obstacle?.x || this.player.x + 20;
        const y = obstacle?.y || this.player.y - 20;
        obstacle?.destroy();
        this.spawnPopup(x, y - 20, 'НЕУЯЗВИМ!');
        return;
      }

      if (this.buffs.shield > 0) {
        this.buffs.shield -= 1;
        const x = obstacle?.x || this.player.x + 20;
        const y = obstacle?.y || this.player.y - 20;
        obstacle?.destroy();
        this.player.setTint(0x80ffef);
        this.time.delayedCall(160, () => this.player.clearTint());
        this.cameras.main.shake(100, 0.006);
        this.soundBeep(960, 0.05);
        this.spawnPopup(x, y - 20, 'ЩИТ!');
        this.updateHud();
        return;
      }

      this.isGameOver = true;
      this.physics.pause();
      this.player.setTint(0xff657f);
      this.cameras.main.shake(180, 0.012);
      this.soundBeep(110, 0.08);

      const finalDistance = Math.floor(this.distance * 10) / 10;
      this.saveBestDistance(finalDistance);
      this.saveLeaderboardDistance(finalDistance);
      this.resultTitle.setText('ТЕМП ПОТЕРЯН!');
      this.resultTitle.setColor('#ff657f');
      this.resultScore.setText(
        `ДИСТ ${formatKm(finalDistance)} / ${RACE_DISTANCE_KM} КМ\nМОНЕТЫ ${this.coins}   H2O ${this.h2o}\nРЕКОРД ${formatKm(this.bestDistance)} КМ`,
      );
      this.resultPanel.setVisible(true);
    }

    finishRace() {
      if (this.isFinished) return;
      this.isFinished = true;
      this.distance = RACE_DISTANCE_KM;
      this.saveBestDistance(RACE_DISTANCE_KM);
      this.saveLeaderboardDistance(RACE_DISTANCE_KM);
      this.physics.pause();
      if (this.isSliding) this.endSlide();
      this.player.setTexture('dino-run-0');
      this.player.setTint(0x80ff8f);
      this.cameras.main.flash(320, 128, 255, 143, false);
      this.soundBeep(920, 0.09);
      this.resultTitle.setText('ФИНИШ!');
      this.resultTitle.setColor('#80ff8f');
      this.resultScore.setText(
        `42 КМ ПРОЙДЕНО!\nМОНЕТЫ ${this.coins}   H2O ${this.h2o}\nМАГАЗИНЫ ${this.visitedShopIndex}/${SHOP_STOPS.length}`,
      );
      this.resultPanel.setVisible(true);
      this.updateHud();
    }

    saveBestDistance(value) {
      if (value > this.bestDistance) {
        this.bestDistance = Math.min(RACE_DISTANCE_KM, value);
        writeBestDistance(this.bestDistance);
      }
    }

    updateHud() {
      const progress = Phaser.Math.Clamp(this.distance / RACE_DISTANCE_KM, 0, 1);
      this.routeFill.setDisplaySize(Math.max(1, this.routeWidth * progress), 6);
      this.routeRunnerMarker.x = this.routeX + this.routeWidth * progress;
      this.routeDistanceText.setText(`${formatKm(this.distance)} / ${RACE_DISTANCE_KM} KM`);

      this.shopRouteMarkers.forEach((entry, index) => {
        const visited = index < this.visitedShopIndex;
        entry.marker.setFillStyle(visited ? 0x80ff8f : 0xffb84d, 1);
        entry.label.setColor(visited ? '#80ff8f' : '#ffdf8a');
      });

      this.hudText.setText(
        `КМ ${formatKm(this.distance)}/${RACE_DISTANCE_KM}   МОНЕТЫ ${this.coins}   H2O ${this.h2o}   ТЕМП ${Math.round(this.getScrollSpeed())}`,
      );
      this.buffText.setText(this.getBuffHudText());
    }

    getBuffHudText() {
      if (this.mergeConflict?.active) {
        return `MERGE CONFLICT ${Math.max(0, Math.ceil(this.mergeConflict.timeLeft))}с   PLAYER ${this.gitScore.player} git   BOT ${this.gitScore.bot} git`;
      }

      const parts = [];
      if (this.buffs.gel > 0) parts.push(`ГЕЛЬ ${Math.ceil(this.buffs.gel)}с`);
      if (this.buffs.shoes > 0) parts.push(`КРОССОВКИ ${Math.ceil(this.buffs.shoes)}с`);
      if (this.buffs.shield > 0) parts.push(`ЩИТ x${this.buffs.shield}`);
      if (this.buffs.invulnerable > 0) parts.push(`НЕУЯЗВИМ ${Math.ceil(this.buffs.invulnerable)}с`);
      const nextShop = SHOP_STOPS[this.visitedShopIndex];
      if (nextShop) {
        parts.push(`СЛЕД. МАГАЗИН ${formatKm(nextShop.km)}К`);
      } else {
        parts.push('ФИНИШ ВПЕРЕДИ');
      }
      return parts.length ? parts.join('   ') : 'БАФОВ НЕТ';
    }

    startRetroMusic() {
      this.stopRetroMusic();
      if (!window.AudioContext && !window.webkitAudioContext) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audio = GameScene.audioContext || new AudioCtx();
        GameScene.audioContext = audio;
        if (audio.state === 'suspended') audio.resume();

        this.retroMusic = {
          melody: [659, 784, 988, 784, 740, 880, 988, 880, 659, 784, 1047, 988, 880, 784, 740, 659],
          bass: [165, 165, 196, 196, 247, 247, 196, 196],
        };
        this.retroMusicStep = 0;
        this.playRetroMusicStep();
        this.retroMusicTimer = this.time.addEvent({ delay: 140, loop: true, callback: () => this.playRetroMusicStep() });
      } catch (error) {
        this.retroMusic = null;
      }
    }

    stopRetroMusic() {
      if (this.retroMusicTimer) {
        this.retroMusicTimer.remove(false);
        this.retroMusicTimer = null;
      }
      this.retroMusic = null;
    }

    playRetroMusicStep() {
      if (!this.retroMusic) return;
      const step = this.retroMusicStep;
      const melody = this.retroMusic.melody[step % this.retroMusic.melody.length];
      const bass = this.retroMusic.bass[Math.floor(step / 2) % this.retroMusic.bass.length];
      this.playRetroTone(melody, 0.09, 0.014);
      if (step % 2 === 0) {
        this.playRetroTone(bass, 0.13, 0.011);
      }
      if (step % 4 === 3) {
        this.playRetroTone(melody * 1.5, 0.045, 0.007);
      }
      this.retroMusicStep += 1;
    }

    playRetroTone(frequency, duration, volume) {
      try {
        const audio = GameScene.audioContext;
        if (!audio) return;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(volume, audio.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration + 0.02);
      } catch (error) {
        // If WebAudio is blocked, the event intro remains playable without music.
      }
    }

    soundBeep(frequency, duration) {
      // Tiny generated SFX keeps the prototype local and asset-free. Real SFX can replace this later.
      if (!window.AudioContext && !window.webkitAudioContext) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audio = GameScene.audioContext || new AudioCtx();
        GameScene.audioContext = audio;
        if (audio.state === 'suspended') audio.resume();

        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'square';
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.018;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration);
      } catch (error) {
        // Audio can be blocked by browser policy before first gesture; gameplay must continue silently.
      }
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    backgroundColor: '#111943',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
        fps: 60,
      },
    },
    render: {
      antialias: false,
      pixelArt: true,
      powerPreference: 'high-performance',
    },
    scene: [GameScene],
  };

  const game = new Phaser.Game(config);
  setupFullscreenButton(game);

  function createTouchButton(scene, x, y, width, height, label, color) {
    const bg = scene.add
      .rectangle(x, y, width, height, 0x070a1e, 0.48)
      .setStrokeStyle(2, color, 0.72)
      .setInteractive({ useHandCursor: true });
    const text = scene.add
      .text(x, y, label, {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
        color: '#fff6d8',
        stroke: '#070a1e',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    bg.on('pointerdown', () => bg.setFillStyle(color, 0.28));
    bg.on('pointerup', () => bg.setFillStyle(0x070a1e, 0.48));
    bg.on('pointerout', () => bg.setFillStyle(0x070a1e, 0.48));
    return { bg, label: text };
  }

  function createMenuButton(scene, x, y, width, height, label, color) {
    const bg = scene.add
      .rectangle(x, y, width, height, 0x070a1e, 0.74)
      .setStrokeStyle(2, color, 0.82)
      .setInteractive({ useHandCursor: true });
    const text = scene.add
      .text(x, y, label, {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '10px',
        color: '#fff6d8',
        stroke: '#070a1e',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    bg.on('pointerdown', () => bg.setFillStyle(color, 0.24));
    bg.on('pointerup', () => bg.setFillStyle(0x070a1e, 0.74));
    bg.on('pointerout', () => bg.setFillStyle(0x070a1e, 0.74));
    return { bg, label: text };
  }

  function isPointerOnControls(pointer) {
    return pointer.y > VIRTUAL_HEIGHT - 72;
  }

  function isPointerOnGameMenu(pointer) {
    return pointer.x > VIRTUAL_WIDTH - 86 && pointer.y < 58;
  }

  function createPlaceholderTextures(scene) {
    makeTexture(scene, 'solid', 4, 4, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 4, 4);
    });

    makeTexture(scene, 'clouds', 160, 64, (ctx) => {
      ctx.clearRect(0, 0, 160, 64);
      drawPixelCloud(ctx, 10, 18, '#d8e8ff');
      drawPixelCloud(ctx, 74, 9, '#ffffff');
      drawPixelCloud(ctx, 128, 27, '#c0d9ff');
    });

    makeTexture(scene, 'city-far', 160, 80, (ctx) => {
      ctx.clearRect(0, 0, 160, 80);
      ctx.fillStyle = '#141a49';
      for (let x = 0; x < 160; x += 16) {
        const h = 18 + ((x * 7) % 36);
        ctx.fillRect(x, 80 - h, 12, h);
        ctx.fillStyle = '#25306f';
        ctx.fillRect(x + 3, 80 - h + 6, 2, 2);
        ctx.fillRect(x + 8, 80 - h + 13, 2, 2);
        ctx.fillStyle = '#141a49';
      }
      ctx.fillStyle = '#0f143b';
      ctx.fillRect(0, 75, 160, 5);
    });

    makeTexture(scene, 'trees-mid', 96, 54, (ctx) => {
      ctx.clearRect(0, 0, 96, 54);
      for (let x = 0; x < 96; x += 24) {
        ctx.fillStyle = '#4b2f39';
        ctx.fillRect(x + 11, 26, 4, 28);
        ctx.fillStyle = '#1f8f58';
        ctx.fillRect(x + 5, 16, 16, 10);
        ctx.fillRect(x + 2, 24, 22, 10);
        ctx.fillStyle = '#80ff8f';
        ctx.fillRect(x + 8, 13, 8, 5);
      }
    });

    makeTexture(scene, 'road-tile', 96, 64, (ctx) => {
      ctx.fillStyle = '#2f2445';
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = '#49345e';
      ctx.fillRect(0, 3, 96, 11);
      ctx.fillStyle = '#fff0a6';
      for (let x = 0; x < 96; x += 24) {
        ctx.fillRect(x + 4, 19, 13, 3);
      }
      ctx.fillStyle = '#201832';
      for (let x = 0; x < 96; x += 12) {
        ctx.fillRect(x, 45, 8, 3);
        ctx.fillRect(x + 5, 57, 5, 2);
      }
    });

    BACKGROUND_RUNNER_BIBS.forEach((bib, bibIndex) => {
      for (let frame = 0; frame < 3; frame += 1) {
        makeTexture(scene, `runner-bg-${bibIndex}-${frame}`, 24, 32, (ctx) => drawBackgroundRunner(ctx, frame, bib, bibIndex));
      }
    });

    makeTexture(scene, 'dino-run-0', 48, 48, (ctx) => drawDino(ctx, 'run0'));
    makeTexture(scene, 'dino-run-1', 48, 48, (ctx) => drawDino(ctx, 'run1'));
    makeTexture(scene, 'dino-run-2', 48, 48, (ctx) => drawDino(ctx, 'run2'));
    makeTexture(scene, 'dino-run-3', 48, 48, (ctx) => drawDino(ctx, 'run3'));
    makeTexture(scene, 'dino-jump', 48, 48, (ctx) => drawDino(ctx, 'jump'));
    makeTexture(scene, 'dino-slide', 56, 34, (ctx) => drawDinoSlide(ctx));
    makeTexture(scene, 'cactus', 22, 32, (ctx) => drawCactus(ctx));
    makeTexture(scene, 'hurdle', 28, 24, (ctx) => drawHurdle(ctx));
    makeTexture(scene, 'cone', 22, 30, (ctx) => drawCone(ctx));
    makeTexture(scene, 'h2o-bottle', 17, 22, (ctx) => drawBottle(ctx));
    makeTexture(scene, 'git-token', 19, 19, (ctx) => drawGitToken(ctx));
    makeTexture(scene, 'shop-stand', 58, 46, (ctx) => drawShopStand(ctx));
  }

  function makeTexture(scene, key, width, height, draw) {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, width, height);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx, width, height);
    texture.refresh();
  }

  function drawPixelCloud(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 8, 28, 8);
    ctx.fillRect(x + 6, y + 3, 10, 8);
    ctx.fillRect(x + 15, y, 12, 11);
    ctx.fillStyle = 'rgba(96, 132, 218, 0.45)';
    ctx.fillRect(x + 3, y + 15, 24, 3);
  }

  function drawBib(ctx, x, y, width, height, number) {
    const text = String(number).slice(0, 2).padStart(2, '0');
    const digitMap = {
      0: ['111', '101', '101', '101', '111'],
      1: ['010', '110', '010', '010', '111'],
      2: ['111', '001', '111', '100', '111'],
      3: ['111', '001', '111', '001', '111'],
      4: ['101', '101', '111', '001', '001'],
      5: ['111', '100', '111', '001', '111'],
      6: ['111', '100', '111', '101', '111'],
      7: ['111', '001', '010', '010', '010'],
      8: ['111', '101', '111', '101', '111'],
      9: ['111', '101', '111', '001', '111'],
    };
    const gap = width >= 9 ? 1 : 0;
    const totalWidth = text.length * 3 + (text.length - 1) * gap;
    let digitX = x + 1 + Math.max(0, Math.floor((width - 2 - totalWidth) / 2));
    const digitY = y + 1;

    ctx.fillStyle = '#102c35';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
    ctx.fillStyle = '#101330';
    for (const char of text) {
      const rows = digitMap[char] || digitMap[0];
      rows.forEach((row, rowIndex) => {
        for (let col = 0; col < row.length; col += 1) {
          if (row[col] === '1') {
            ctx.fillRect(digitX + col, digitY + rowIndex, 1, 1);
          }
        }
      });
      digitX += 3 + gap;
    }
  }

  function drawBackgroundRunner(ctx, frame, bib, paletteIndex) {
    ctx.clearRect(0, 0, 24, 32);
    const shirts = ['#80ffef', '#ffb84d', '#ff657f', '#9fb7ff', '#80ff8f', '#fff0a6', '#c17dff', '#ff8fb0'];
    const shorts = ['#25306f', '#2f2445', '#193657', '#4b2f39'];
    const skin = ['#ffd0a6', '#b97955', '#f1ad78', '#6f4637'][paletteIndex % 4];
    const shirt = shirts[paletteIndex % shirts.length];
    const shortsColor = shorts[paletteIndex % shorts.length];
    const forward = frame === 1;
    const back = frame === 2;

    ctx.fillStyle = 'rgba(7, 10, 30, 0.32)';
    ctx.fillRect(5, 29, 14, 2);

    ctx.fillStyle = '#102c35';
    ctx.fillRect(9, 3, 7, 7);
    ctx.fillRect(8, 10, 10, 11);
    ctx.fillRect(forward ? 5 : 6, 12, 3, 8);
    ctx.fillRect(back ? 18 : 17, 12, 3, 8);
    ctx.fillRect(forward ? 7 : 9, 20, 3, 8);
    ctx.fillRect(forward ? 14 : 13, 20, 3, 8);

    ctx.fillStyle = skin;
    ctx.fillRect(10, 5, 5, 5);
    ctx.fillRect(forward ? 5 : 6, 14, 3, 5);
    ctx.fillRect(back ? 18 : 17, 14, 3, 5);

    ctx.fillStyle = shirt;
    ctx.fillRect(9, 11, 8, 8);
    ctx.fillStyle = shortsColor;
    ctx.fillRect(9, 19, 8, 4);
    drawBib(ctx, 9, 12, 8, 7, bib);

    ctx.fillStyle = skin;
    ctx.fillRect(forward ? 7 : 9, 22, 3, 5);
    ctx.fillRect(forward ? 14 : 13, 22, 3, 5);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(forward ? 5 : 8, 27, 6, 2);
    ctx.fillRect(forward ? 13 : 12, 27, 6, 2);
    ctx.fillStyle = '#101330';
    ctx.fillRect(12, 6, 1, 1);
  }

  function drawDragonBib(ctx, x, y, width, height) {
    ctx.fillStyle = '#102c35';
    ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    ctx.fillStyle = '#7d27e8';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#e078ff';
    ctx.fillRect(x + 1, y + 1, width - 2, 1);
    ctx.fillStyle = '#4a1fb2';
    ctx.fillRect(x + 1, y + height - 2, width - 2, 1);
    ctx.fillStyle = '#ffe66d';
    ctx.fillRect(x + 2, y + 2, 1, 1);
    ctx.fillRect(x + width - 3, y + 2, 1, 1);
    ctx.fillRect(x + 2, y + height - 3, 1, 1);
    ctx.fillRect(x + width - 3, y + height - 3, 1, 1);
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(x + Math.floor(width / 2), y + 2, 1, 5);
    ctx.fillRect(x + Math.floor(width / 2) - 1, y + 3, 1, 1);
    ctx.fillRect(x + Math.floor(width / 2) - 1, y + 7, 4, 1);
  }

  function drawDragonEye(ctx, x, y) {
    ctx.fillStyle = '#102c35';
    ctx.fillRect(x, y, 6, 8);
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(x + 1, y, 4, 7);
    ctx.fillStyle = '#4d35db';
    ctx.fillRect(x + 3, y + 2, 2, 5);
    ctx.fillStyle = '#1f246d';
    ctx.fillRect(x + 4, y + 5, 1, 2);
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(x + 2, y + 1, 2, 2);
  }

  function drawDino(ctx, pose) {
    ctx.clearRect(0, 0, 48, 48);
    const green = '#20df6d';
    const greenLight = '#77ff92';
    const greenMid = '#20b865';
    const greenDark = '#117a4b';
    const outline = '#102c35';
    const belly = '#ffe66d';
    const bellyDark = '#d9a83a';
    const purple = '#9c2cff';
    const purpleLight = '#e078ff';
    const purpleDark = '#4a1fb2';
    const shoe = '#7d27e8';
    const sole = '#fff6d8';
    const jump = pose === 'jump';
    const bounce = pose === 'run1' || pose === 'run3' ? -1 : jump ? -2 : 0;

    ctx.fillStyle = outline;
    ctx.fillRect(4, 34 + bounce, 12, 6);
    ctx.fillRect(7, 31 + bounce, 8, 4);
    ctx.fillStyle = greenMid;
    ctx.fillRect(5, 35 + bounce, 10, 4);
    ctx.fillStyle = greenLight;
    ctx.fillRect(7, 35 + bounce, 6, 1);
    ctx.fillStyle = outline;
    ctx.fillRect(10, 29 + bounce, 4, 4);
    ctx.fillStyle = purple;
    ctx.fillRect(11, 29 + bounce, 2, 3);

    ctx.fillStyle = outline;
    ctx.fillRect(8, 24 + bounce, 8, 14);
    ctx.fillRect(5, 31 + bounce, 8, 6);
    ctx.fillStyle = purpleDark;
    ctx.fillRect(9, 25 + bounce, 6, 12);
    ctx.fillStyle = purple;
    ctx.fillRect(10, 26 + bounce, 5, 9);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(6, 32 + bounce, 6, 3);

    const firstLegForward = pose === 'run1' || pose === 'run3';
    const secondLegForward = pose === 'run2';
    ctx.fillStyle = outline;
    ctx.fillRect(firstLegForward ? 15 : 17, 37 + bounce, 6, firstLegForward ? 6 : 8);
    ctx.fillRect(secondLegForward ? 30 : 28, 37 + bounce, 6, secondLegForward ? 6 : 8);
    ctx.fillStyle = greenDark;
    ctx.fillRect(firstLegForward ? 16 : 18, 38 + bounce, 4, firstLegForward ? 5 : 7);
    ctx.fillRect(secondLegForward ? 31 : 29, 38 + bounce, 4, secondLegForward ? 5 : 7);
    ctx.fillStyle = outline;
    ctx.fillRect(firstLegForward ? 12 : 16, firstLegForward ? 42 + bounce : 44 + bounce, 12, 5);
    ctx.fillRect(secondLegForward ? 31 : 28, secondLegForward ? 42 + bounce : 44 + bounce, 12, 5);
    ctx.fillStyle = shoe;
    ctx.fillRect(firstLegForward ? 13 : 17, firstLegForward ? 43 + bounce : 45 + bounce, 11, 3);
    ctx.fillRect(secondLegForward ? 32 : 29, secondLegForward ? 43 + bounce : 45 + bounce, 11, 3);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(firstLegForward ? 15 : 19, firstLegForward ? 43 + bounce : 45 + bounce, 7, 1);
    ctx.fillRect(secondLegForward ? 34 : 31, secondLegForward ? 43 + bounce : 45 + bounce, 7, 1);
    ctx.fillStyle = sole;
    ctx.fillRect(firstLegForward ? 13 : 17, firstLegForward ? 46 + bounce : 47 + bounce, 11, 1);
    ctx.fillRect(secondLegForward ? 32 : 29, secondLegForward ? 46 + bounce : 47 + bounce, 11, 1);

    ctx.fillStyle = outline;
    ctx.fillRect(15, 22 + bounce, 22, 22);
    ctx.fillRect(13, 27 + bounce, 25, 11);
    ctx.fillRect(18, 19 + bounce, 13, 7);
    ctx.fillStyle = greenDark;
    ctx.fillRect(16, 23 + bounce, 20, 20);
    ctx.fillStyle = greenMid;
    ctx.fillRect(14, 28 + bounce, 22, 9);
    ctx.fillStyle = greenLight;
    ctx.fillRect(19, 20 + bounce, 11, 5);
    ctx.fillStyle = bellyDark;
    ctx.fillRect(23, 25 + bounce, 9, 17);
    ctx.fillStyle = belly;
    ctx.fillRect(22, 25 + bounce, 9, 16);
    ctx.fillStyle = bellyDark;
    ctx.fillRect(23, 30 + bounce, 8, 1);
    ctx.fillRect(23, 36 + bounce, 8, 1);
    drawDragonBib(ctx, 23, 31 + bounce, 10, 10);

    ctx.fillStyle = outline;
    ctx.fillRect(34, jump ? 22 + bounce : 26 + bounce, 5, 5);
    ctx.fillRect(38, jump ? 21 + bounce : 24 + bounce, 5, 5);
    ctx.fillStyle = greenMid;
    ctx.fillRect(35, jump ? 23 + bounce : 27 + bounce, 4, 3);
    ctx.fillStyle = green;
    ctx.fillRect(38, jump ? 22 + bounce : 25 + bounce, 5, 3);
    ctx.fillStyle = greenLight;
    ctx.fillRect(41, jump ? 23 + bounce : 26 + bounce, 2, 2);

    ctx.fillStyle = outline;
    ctx.fillRect(15, 11 + bounce, 8, 4);
    ctx.fillRect(11, 16 + bounce, 10, 5);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(16, 12 + bounce, 7, 2);
    ctx.fillStyle = purple;
    ctx.fillRect(12, 17 + bounce, 8, 3);

    ctx.fillStyle = outline;
    ctx.fillRect(23, 8 + bounce, 19, 17);
    ctx.fillRect(20, 13 + bounce, 8, 9);
    ctx.fillRect(35, 14 + bounce, 10, 11);
    ctx.fillRect(39, 18 + bounce, 7, 7);
    ctx.fillRect(24, 5 + bounce, 7, 5);
    ctx.fillStyle = greenMid;
    ctx.fillRect(24, 9 + bounce, 17, 15);
    ctx.fillRect(21, 14 + bounce, 6, 7);
    ctx.fillRect(35, 15 + bounce, 9, 9);
    ctx.fillRect(39, 19 + bounce, 5, 5);
    ctx.fillStyle = greenLight;
    ctx.fillRect(25, 10 + bounce, 13, 5);
    ctx.fillRect(36, 16 + bounce, 7, 4);
    ctx.fillRect(26, 6 + bounce, 3, 3);

    ctx.fillStyle = outline;
    ctx.fillRect(22, 10 + bounce, 20, 5);
    ctx.fillStyle = purple;
    ctx.fillRect(23, 11 + bounce, 18, 3);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(24, 11 + bounce, 12, 1);
    ctx.fillRect(39, 12 + bounce, 2, 2);

    drawDragonEye(ctx, 29, 12 + bounce);
    ctx.fillStyle = outline;
    ctx.fillRect(42, 19 + bounce, 2, 2);
    ctx.fillRect(37, 24 + bounce, 6, 1);
    ctx.fillStyle = '#58e887';
    ctx.fillRect(21, 21 + bounce, 3, 2);
  }

  function drawDinoSlide(ctx) {
    ctx.clearRect(0, 0, 56, 34);
    const outline = '#102c35';
    const greenMid = '#20b865';
    const greenLight = '#77ff92';
    const greenDark = '#117a4b';
    const belly = '#ffe66d';
    const purple = '#9c2cff';
    const purpleLight = '#e078ff';
    const shoe = '#7d27e8';
    const sole = '#fff6d8';

    ctx.fillStyle = outline;
    ctx.fillRect(3, 23, 13, 4);
    ctx.fillRect(8, 20, 5, 4);
    ctx.fillStyle = greenMid;
    ctx.fillRect(5, 24, 10, 2);
    ctx.fillStyle = purple;
    ctx.fillRect(9, 20, 3, 3);

    ctx.fillStyle = outline;
    ctx.fillRect(8, 16, 10, 10);
    ctx.fillRect(5, 22, 9, 5);
    ctx.fillStyle = purple;
    ctx.fillRect(9, 17, 8, 8);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(6, 23, 7, 2);

    ctx.fillStyle = outline;
    ctx.fillRect(11, 16, 27, 11);
    ctx.fillRect(16, 12, 18, 8);
    ctx.fillStyle = greenDark;
    ctx.fillRect(12, 17, 25, 9);
    ctx.fillStyle = greenMid;
    ctx.fillRect(16, 14, 18, 6);
    ctx.fillStyle = belly;
    ctx.fillRect(19, 16, 11, 7);
    drawDragonBib(ctx, 23, 17, 10, 10);

    ctx.fillStyle = outline;
    ctx.fillRect(31, 8, 18, 15);
    ctx.fillRect(44, 13, 10, 9);
    ctx.fillRect(32, 5, 7, 5);
    ctx.fillStyle = greenMid;
    ctx.fillRect(32, 9, 16, 13);
    ctx.fillRect(44, 14, 8, 7);
    ctx.fillStyle = greenLight;
    ctx.fillRect(34, 10, 12, 4);
    ctx.fillRect(45, 15, 6, 3);
    ctx.fillRect(34, 6, 3, 3);

    ctx.fillStyle = outline;
    ctx.fillRect(24, 9, 9, 4);
    ctx.fillRect(22, 14, 10, 5);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(26, 10, 7, 2);
    ctx.fillStyle = purple;
    ctx.fillRect(24, 15, 8, 3);
    ctx.fillStyle = outline;
    ctx.fillRect(31, 10, 20, 5);
    ctx.fillStyle = purple;
    ctx.fillRect(32, 11, 18, 3);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(33, 11, 12, 1);

    drawDragonEye(ctx, 39, 12);
    ctx.fillStyle = outline;
    ctx.fillRect(50, 17, 2, 2);
    ctx.fillRect(45, 22, 6, 1);

    ctx.fillStyle = outline;
    ctx.fillRect(15, 26, 14, 5);
    ctx.fillRect(34, 26, 14, 5);
    ctx.fillStyle = shoe;
    ctx.fillRect(16, 27, 13, 3);
    ctx.fillRect(35, 27, 13, 3);
    ctx.fillStyle = purpleLight;
    ctx.fillRect(18, 27, 8, 1);
    ctx.fillRect(37, 27, 8, 1);
    ctx.fillStyle = sole;
    ctx.fillRect(16, 30, 13, 1);
    ctx.fillRect(35, 30, 13, 1);

    ctx.fillStyle = outline;
    ctx.fillRect(35, 22, 6, 4);
    ctx.fillStyle = greenMid;
    ctx.fillRect(36, 22, 5, 3);
  }


  function drawCactus(ctx) {
    ctx.clearRect(0, 0, 22, 32);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(8, 4, 8, 28);
    ctx.fillRect(3, 13, 7, 5);
    ctx.fillRect(13, 9, 7, 5);
    ctx.fillStyle = '#1f8f58';
    ctx.fillRect(9, 5, 6, 27);
    ctx.fillRect(4, 13, 5, 4);
    ctx.fillRect(14, 10, 5, 4);
    ctx.fillStyle = '#80ff8f';
    ctx.fillRect(11, 7, 2, 21);
    ctx.fillRect(5, 14, 3, 2);
  }

  function drawHurdle(ctx) {
    ctx.clearRect(0, 0, 28, 24);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(1, 6, 26, 7);
    ctx.fillRect(4, 10, 5, 14);
    ctx.fillRect(19, 10, 5, 14);
    ctx.fillStyle = '#ff657f';
    ctx.fillRect(2, 7, 24, 4);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(6, 7, 5, 4);
    ctx.fillRect(17, 7, 5, 4);
    ctx.fillStyle = '#ffb84d';
    ctx.fillRect(5, 12, 3, 12);
    ctx.fillRect(20, 12, 3, 12);
  }

  function drawCone(ctx) {
    ctx.clearRect(0, 0, 22, 30);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(7, 4, 8, 4);
    ctx.fillRect(6, 8, 10, 6);
    ctx.fillRect(4, 14, 14, 6);
    ctx.fillRect(2, 20, 18, 7);
    ctx.fillRect(0, 26, 22, 4);
    ctx.fillStyle = '#ff8a30';
    ctx.fillRect(8, 5, 6, 4);
    ctx.fillRect(7, 9, 8, 5);
    ctx.fillRect(5, 15, 12, 5);
    ctx.fillRect(3, 21, 16, 5);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(6, 16, 10, 2);
    ctx.fillRect(4, 23, 14, 2);
  }

  function drawBottle(ctx) {
    ctx.clearRect(0, 0, 17, 22);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(5, 1, 7, 4);
    ctx.fillRect(3, 5, 11, 16);
    ctx.fillStyle = '#80ffef';
    ctx.fillRect(6, 2, 5, 3);
    ctx.fillRect(4, 6, 9, 14);
    ctx.fillStyle = '#278ddb';
    ctx.fillRect(5, 11, 7, 6);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(6, 7, 5, 2);
    ctx.fillRect(6, 13, 5, 1);
    ctx.fillStyle = '#ff657f';
    ctx.fillRect(7, 0, 3, 2);
  }

  function drawGitToken(ctx) {
    ctx.clearRect(0, 0, 19, 19);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(7, 1, 5, 5);
    ctx.fillRect(11, 5, 5, 5);
    ctx.fillRect(3, 5, 5, 5);
    ctx.fillRect(7, 9, 5, 5);
    ctx.fillRect(7, 13, 5, 5);
    ctx.fillStyle = '#ff657f';
    ctx.fillRect(8, 2, 3, 3);
    ctx.fillRect(12, 6, 3, 3);
    ctx.fillRect(4, 6, 3, 3);
    ctx.fillRect(8, 10, 3, 3);
    ctx.fillRect(8, 14, 3, 3);
    ctx.fillStyle = '#fff6d8';
    ctx.fillRect(9, 3, 1, 12);
    ctx.fillRect(6, 7, 7, 1);
    ctx.fillRect(9, 11, 4, 1);
  }

  function drawShopStand(ctx) {
    ctx.clearRect(0, 0, 58, 46);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(7, 15, 44, 27);
    ctx.fillRect(3, 12, 52, 9);
    ctx.fillRect(10, 5, 38, 11);
    ctx.fillRect(12, 39, 7, 7);
    ctx.fillRect(39, 39, 7, 7);

    ctx.fillStyle = '#ff657f';
    ctx.fillRect(5, 13, 50, 6);
    ctx.fillStyle = '#fff6d8';
    for (let x = 7; x < 52; x += 10) {
      ctx.fillRect(x, 13, 5, 6);
    }

    ctx.fillStyle = '#ffb84d';
    ctx.fillRect(11, 20, 36, 18);
    ctx.fillStyle = '#2f2445';
    ctx.fillRect(16, 25, 8, 13);
    ctx.fillRect(30, 25, 12, 8);
    ctx.fillStyle = '#80ffef';
    ctx.fillRect(32, 27, 8, 3);
    ctx.fillStyle = '#80ff8f';
    ctx.fillRect(13, 6, 32, 8);
    ctx.fillStyle = '#101330';
    ctx.fillRect(17, 8, 4, 2);
    ctx.fillRect(24, 8, 4, 2);
    ctx.fillRect(31, 8, 4, 2);
    ctx.fillRect(38, 8, 4, 2);
    ctx.fillStyle = '#fff0a6';
    ctx.fillRect(21, 34, 20, 3);
  }

  function setupFullscreenButton(game) {
    const button = document.getElementById('fullscreen-button');
    const shell = document.getElementById('game-shell');
    if (!button || !shell) return;

    button.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await shell.requestFullscreen?.();
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => undefined);
          }
        } else {
          await document.exitFullscreen?.();
        }
        game.scale.refresh();
      } catch (error) {
        showFallback('Fullscreen может быть заблокирован браузером. На мобильном откройте страницу и нажмите кнопку ⛶ после первого тапа.');
      }
    });

    window.addEventListener('resize', () => game.scale.refresh());
    window.addEventListener('orientationchange', () => window.setTimeout(() => game.scale.refresh(), 250));
  }

  function formatKm(value) {
    return Number(value).toFixed(1).padStart(4, '0');
  }

  function readBestDistance() {
    try {
      return Number(window.localStorage.getItem('dino-pace-run-best') || 0);
    } catch (error) {
      return 0;
    }
  }

  function writeBestDistance(value) {
    try {
      window.localStorage.setItem('dino-pace-run-best', String(value));
    } catch (error) {
      // Local storage can be unavailable in private mode; score still works for the session.
    }
  }

  function readPlayerName() {
    try {
      return normalizePlayerName(window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'PLAYER');
    } catch (error) {
      return 'PLAYER';
    }
  }

  function writePlayerName(name) {
    try {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, normalizePlayerName(name));
    } catch (error) {
      // Local storage can be unavailable in private mode; the in-memory name still works.
    }
  }

  function normalizePlayerName(name) {
    const normalized = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    return normalized || 'PLAYER';
  }

  async function readLeaderboard(playerName) {
    const query = new URLSearchParams({ player: normalizePlayerName(playerName) });
    const response = await window.fetch(`${LEADERBOARD_API_URL}?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Leaderboard API failed: ${response.status}`);
    }
    const payload = await response.json();
    return {
      leaderboard: normalizeLeaderboard(payload.leaderboard),
      playerRank: normalizeRank(payload.playerRank),
    };
  }

  async function writeLeaderboardDistance(distance, playerName) {
    const response = await window.fetch(LEADERBOARD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ km: distance, playerName: normalizePlayerName(playerName) }),
    });
    if (!response.ok) {
      throw new Error(`Leaderboard API failed: ${response.status}`);
    }
    return response.json();
  }

  function readLocalLeaderboard() {
    try {
      const records = JSON.parse(window.localStorage.getItem('dino-pace-run-leaderboard') || '[]');
      return normalizeLeaderboard(records);
    } catch (error) {
      return [];
    }
  }

  function writeLocalLeaderboardDistance(distance) {
    const nextRecord = {
      km: Math.min(RACE_DISTANCE_KM, Math.max(0, Number(distance) || 0)),
      playerName: readPlayerName(),
      finishedAt: Date.now(),
    };
    const leaderboard = [...readLocalLeaderboard(), nextRecord].sort(sortLeaderboard).slice(0, LEADERBOARD_LIMIT);
    try {
      window.localStorage.setItem('dino-pace-run-leaderboard', JSON.stringify(leaderboard));
    } catch (error) {
      // Local storage can be unavailable in private mode; leaderboard still works for the current result.
    }
    return leaderboard;
  }

  function normalizeLeaderboard(records) {
    if (!Array.isArray(records)) return [];
    return records
      .map((record) => ({
        rank: Number(record.rank) || 0,
        playerName: normalizePlayerName(record.playerName || record.player_name || 'PLAYER'),
        km: Math.min(RACE_DISTANCE_KM, Math.max(0, Number(record.km) || 0)),
        finishedAt: Number(record.finishedAt) || 0,
      }))
      .filter((record) => record.km > 0)
      .sort(sortLeaderboard)
      .slice(0, LEADERBOARD_LIMIT);
  }

  function normalizeRank(rank) {
    const value = Number(rank);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function sortLeaderboard(a, b) {
    return b.km - a.km || b.finishedAt - a.finishedAt;
  }

  function formatLeaderboard(leaderboard, playerName, playerRank) {
    if (!leaderboard.length) return 'ЛИДЕРБОРД: пока пусто';
    const currentName = normalizePlayerName(playerName);
    const rows = leaderboard.map((record, index) => {
      const rank = record.rank || index + 1;
      const marker = record.playerName === currentName ? ' <' : '';
      return `${rank}. ${record.playerName}  ${formatKm(record.km)} КМ${marker}`;
    });
    const rankLine = playerRank ? `ТВОЕ МЕСТО: ${playerRank}` : 'ТВОЕ МЕСТО: нет результата';
    return `ЛИДЕРБОРД ТОП-10\n${rows.join('\n')}\n${rankLine}`;
  }
})();
