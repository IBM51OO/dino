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

  // Asset manifest. Later replace placeholders by switching USE_GENERATED_PLACEHOLDERS to false
  // and placing real pixel-art files into assets/. The rest of the game uses only these keys.
  const USE_GENERATED_PLACEHOLDERS = true;
  const ASSETS = {
    character: {
      run: [
        { key: 'dino-run-0', path: 'assets/sprites/dino-run-0.png' },
        { key: 'dino-run-1', path: 'assets/sprites/dino-run-1.png' },
        { key: 'dino-run-2', path: 'assets/sprites/dino-run-2.png' },
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
      if (!USE_GENERATED_PLACEHOLDERS) {
        ASSETS.character.run.forEach((asset) => this.load.image(asset.key, asset.path));
        this.load.image(ASSETS.character.jump.key, ASSETS.character.jump.path);
        this.load.image(ASSETS.character.slide.key, ASSETS.character.slide.path);
        ASSETS.obstacles.forEach((asset) => this.load.image(asset.key, asset.path));
        ASSETS.collectibles.forEach((asset) => this.load.image(asset.key, asset.path));
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
      this.runFrame = 0;
      this.nextRunFrameAt = 0;
      this.nextObstacleAt = 720;
      this.nextCollectibleAt = 1300;
      this.jumpsLeft = 2;
      this.isSliding = false;
      this.isGameOver = false;
      this.isShopping = false;
      this.isFinished = false;
      this.bestDistance = Math.min(RACE_DISTANCE_KM, readBestDistance());

      this.createWorld();
      this.createPlayer();
      this.createGroups();
      this.createHud();
      this.createControls();
      this.bindInput();
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

      this.physics.add.overlap(this.player, this.obstacles, (player, obstacle) => this.hitObstacle(obstacle), null, this);
      this.physics.add.overlap(this.player, this.collectibles, (player, bottle) => this.collectBottle(bottle), null, this);
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
      const panelBg = this.add.rectangle(0, 0, 338, 150, 0x101330, 0.94).setStrokeStyle(2, 0xfff6d8, 0.45);
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
        .text(0, 45, 'Тап / Space / R — заново', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#9fb7ff',
        })
        .setOrigin(0.5);
      this.resultPanel.add([panelBg, this.resultTitle, this.resultScore, panelHint]);
    }

    createControls() {
      this.mobileControls = this.add.container(0, 0).setDepth(50);
      this.slideButton = createTouchButton(this, 74, VIRTUAL_HEIGHT - 39, 110, 50, 'SLIDE', 0xffb84d);
      this.jumpButton = createTouchButton(this, VIRTUAL_WIDTH - 74, VIRTUAL_HEIGHT - 39, 110, 50, 'JUMP', 0x80ff8f);
      this.mobileControls.add([this.slideButton.bg, this.slideButton.label, this.jumpButton.bg, this.jumpButton.label]);

      this.jumpButton.bg.on('pointerdown', () => this.jump());
      this.slideButton.bg.on('pointerdown', () => this.startSlide());
      this.slideButton.bg.on('pointerup', () => this.requestSlideRelease());
      this.slideButton.bg.on('pointerout', () => this.requestSlideRelease());
    }

    bindInput() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys({
        w: Phaser.Input.Keyboard.KeyCodes.W,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        r: Phaser.Input.Keyboard.KeyCodes.R,
        one: Phaser.Input.Keyboard.KeyCodes.ONE,
        two: Phaser.Input.Keyboard.KeyCodes.TWO,
        three: Phaser.Input.Keyboard.KeyCodes.THREE,
        enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      });

      this.input.on('pointerdown', (pointer) => {
        if ((this.isGameOver || this.isFinished) && !isPointerOnControls(pointer)) {
          this.scene.restart();
        }
      });
    }

    update(time, delta) {
      this.readKeyboard();

      if (this.isGameOver || this.isShopping || this.isFinished) {
        return;
      }

      const dt = delta / 1000;
      this.updateBuffTimers(dt);

      const paceAcceleration = this.buffs.gel > 0 ? 1.2 : 3.8;
      this.gameSpeed = Math.min(MAX_SPEED, this.gameSpeed + paceAcceleration * dt);
      const scrollSpeed = this.getScrollSpeed();
      const previousDistance = this.distance;
      const nextDistance = Math.min(RACE_DISTANCE_KM, this.distance + scrollSpeed * dt * KM_PER_SPEED_SECOND);
      const nextShop = SHOP_STOPS[this.visitedShopIndex];

      this.spawnUpcomingShop(nextDistance);

      if (nextShop && nextDistance >= nextShop.km) {
        this.distance = nextShop.km;
        this.awardCoinsForDistance(previousDistance, this.distance);
        this.openShop(nextShop);
        this.updateHud();
        return;
      }

      this.distance = nextDistance;
      this.awardCoinsForDistance(previousDistance, this.distance);

      this.clouds.tilePositionX += scrollSpeed * dt * 0.07;
      this.cityFar.tilePositionX += scrollSpeed * dt * 0.18;
      this.treesMid.tilePositionX += scrollSpeed * dt * 0.42;
      this.road.tilePositionX += scrollSpeed * dt;

      this.updatePlayerAnimation(time);
      this.updateSpawning(delta);
      this.updateMovingObjects(scrollSpeed);
      this.updateHud();

      if (this.distance >= RACE_DISTANCE_KM) {
        this.finishRace();
      }
    }

    readKeyboard() {
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
          this.scene.restart();
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
      if (this.isShopping) return;
      if (this.isGameOver || this.isFinished) {
        this.scene.restart();
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

      const jumpPower = this.buffs.shoes > 0 ? { ground: -480, air: -410 } : { ground: -410, air: -350 };
      this.player.setVelocityY(onGround ? jumpPower.ground : jumpPower.air);
      this.jumpsLeft -= 1;
      this.player.setTexture('dino-jump');
      this.setPlayerRunHitbox();
      this.soundBeep(this.buffs.shoes > 0 ? 520 : 420, 0.035);
    }

    startSlide() {
      if (this.isShopping || this.isFinished || this.isGameOver || this.isSliding) {
        return;
      }

      const onGround = this.player.body.blocked.down || this.player.body.touching.down;
      if (!onGround) {
        this.player.setVelocityY(Math.min(this.player.body.velocity.y + 270, 640));
        return;
      }

      this.isSliding = true;
      this.player.setTexture('dino-slide');
      this.player.body.setSize(31, 13);
      this.player.body.setOffset(5, 8);
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
      this.player.body.setSize(24, 27);
      this.player.body.setOffset(6, 4);
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
      const parts = [];
      if (this.buffs.gel > 0) parts.push(`ГЕЛЬ ${Math.ceil(this.buffs.gel)}с`);
      if (this.buffs.shoes > 0) parts.push(`КРОССОВКИ ${Math.ceil(this.buffs.shoes)}с`);
      if (this.buffs.shield > 0) parts.push(`ЩИТ x${this.buffs.shield}`);
      if (this.buffs.invulnerable > 0) parts.push(`НЕУЯЗВИМ ${Math.ceil(this.buffs.invulnerable)}с`);
      const nextShop = SHOP_STOPS[this.visitedShopIndex];
      if (nextShop) parts.push(`СЛЕД. МАГАЗИН ${formatKm(nextShop.km)}К`);
      return parts.length ? parts.join('   ') : 'БАФОВ НЕТ   СЛЕД. МАГАЗИН 5.0К';
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

  function isPointerOnControls(pointer) {
    return pointer.y > VIRTUAL_HEIGHT - 72;
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

    makeTexture(scene, 'dino-run-0', 36, 32, (ctx) => drawDino(ctx, 'run0'));
    makeTexture(scene, 'dino-run-1', 36, 32, (ctx) => drawDino(ctx, 'run1'));
    makeTexture(scene, 'dino-run-2', 36, 32, (ctx) => drawDino(ctx, 'run2'));
    makeTexture(scene, 'dino-jump', 36, 32, (ctx) => drawDino(ctx, 'jump'));
    makeTexture(scene, 'dino-slide', 40, 22, (ctx) => drawDinoSlide(ctx));
    makeTexture(scene, 'cactus', 22, 32, (ctx) => drawCactus(ctx));
    makeTexture(scene, 'hurdle', 28, 24, (ctx) => drawHurdle(ctx));
    makeTexture(scene, 'cone', 22, 30, (ctx) => drawCone(ctx));
    makeTexture(scene, 'h2o-bottle', 17, 22, (ctx) => drawBottle(ctx));
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

  function drawDino(ctx, pose) {
    ctx.clearRect(0, 0, 36, 32);
    const green = '#80ff8f';
    const greenMid = '#47c86b';
    const greenDark = '#21834f';
    const outline = '#102c35';
    const belly = '#fff0a6';
    const shoe = '#ffb84d';

    ctx.fillStyle = outline;
    ctx.fillRect(6, 12, 20, 15);
    ctx.fillRect(2, 16, 10, 7);
    ctx.fillRect(22, 4, 11, 12);
    ctx.fillRect(28, 10, 7, 7);

    ctx.fillStyle = greenDark;
    ctx.fillRect(3, 17, 8, 4);
    ctx.fillRect(8, 11, 17, 14);
    ctx.fillRect(23, 5, 9, 10);
    ctx.fillRect(28, 11, 5, 4);

    ctx.fillStyle = green;
    ctx.fillRect(10, 10, 13, 13);
    ctx.fillRect(22, 6, 8, 8);
    ctx.fillRect(27, 11, 5, 3);

    ctx.fillStyle = belly;
    ctx.fillRect(17, 15, 6, 7);
    ctx.fillStyle = '#111943';
    ctx.fillRect(26, 7, 2, 2);
    ctx.fillStyle = '#ff8fb0';
    ctx.fillRect(27, 12, 2, 1);
    ctx.fillStyle = greenMid;
    ctx.fillRect(20, 17, 3, 5);

    if (pose === 'jump') {
      ctx.fillStyle = greenDark;
      ctx.fillRect(10, 23, 4, 5);
      ctx.fillRect(19, 23, 4, 5);
      ctx.fillStyle = shoe;
      ctx.fillRect(8, 27, 8, 3);
      ctx.fillRect(18, 27, 8, 3);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(4, 10, 3, 3);
      return;
    }

    const raised = pose === 'run1';
    const swapped = pose === 'run2';
    ctx.fillStyle = greenDark;
    if (raised) {
      ctx.fillRect(10, 23, 4, 4);
      ctx.fillRect(20, 22, 4, 7);
      ctx.fillStyle = shoe;
      ctx.fillRect(7, 26, 8, 3);
      ctx.fillRect(20, 29, 8, 3);
    } else if (swapped) {
      ctx.fillRect(11, 22, 4, 7);
      ctx.fillRect(20, 23, 4, 4);
      ctx.fillStyle = shoe;
      ctx.fillRect(9, 29, 8, 3);
      ctx.fillRect(20, 26, 8, 3);
    } else {
      ctx.fillRect(11, 23, 4, 6);
      ctx.fillRect(20, 23, 4, 6);
      ctx.fillStyle = shoe;
      ctx.fillRect(9, 29, 8, 3);
      ctx.fillRect(19, 29, 8, 3);
    }
  }

  function drawDinoSlide(ctx) {
    ctx.clearRect(0, 0, 40, 22);
    ctx.fillStyle = '#102c35';
    ctx.fillRect(4, 9, 25, 9);
    ctx.fillRect(25, 5, 10, 9);
    ctx.fillRect(0, 12, 8, 5);
    ctx.fillStyle = '#47c86b';
    ctx.fillRect(5, 10, 23, 7);
    ctx.fillRect(25, 6, 9, 7);
    ctx.fillRect(1, 13, 7, 3);
    ctx.fillStyle = '#80ff8f';
    ctx.fillRect(8, 9, 17, 5);
    ctx.fillRect(25, 6, 7, 4);
    ctx.fillStyle = '#fff0a6';
    ctx.fillRect(16, 13, 7, 3);
    ctx.fillStyle = '#111943';
    ctx.fillRect(30, 7, 2, 2);
    ctx.fillStyle = '#ffb84d';
    ctx.fillRect(9, 18, 11, 3);
    ctx.fillRect(23, 18, 10, 3);
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
})();
