(() => {
  'use strict';

  const VIRTUAL_WIDTH = 480;
  const VIRTUAL_HEIGHT = 270;
  const BASE_SPEED = 150;
  const MAX_SPEED = 320;
  const GRAVITY_Y = 920;
  const GROUND_Y = 218;

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
      this.runFrame = 0;
      this.nextRunFrameAt = 0;
      this.nextObstacleAt = 720;
      this.nextCollectibleAt = 1300;
      this.jumpsLeft = 2;
      this.isSliding = false;
      this.isGameOver = false;
      this.bestDistance = readBestDistance();

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

      this.physics.add.overlap(this.player, this.obstacles, () => this.hitObstacle(), null, this);
      this.physics.add.overlap(this.player, this.collectibles, (player, bottle) => this.collectBottle(bottle), null, this);
    }

    createHud() {
      const textStyle = {
        fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '13px',
        color: '#fff6d8',
        stroke: '#101330',
        strokeThickness: 3,
      };

      this.hudText = this.add.text(10, 10, '', textStyle).setDepth(30);
      this.tipText = this.add
        .text(VIRTUAL_WIDTH / 2, 34, 'Dino Pace Run', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '16px',
          color: '#80ff8f',
          stroke: '#101330',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(30);

      this.time.delayedCall(2200, () => {
        if (this.tipText) {
          this.tweens.add({ targets: this.tipText, alpha: 0, duration: 450 });
        }
      });

      this.gameOverPanel = this.add.container(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2).setDepth(60).setVisible(false);
      const panelBg = this.add.rectangle(0, 0, 328, 142, 0x101330, 0.94).setStrokeStyle(2, 0xfff6d8, 0.45);
      const panelTitle = this.add
        .text(0, -48, 'PACE LOST!', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '24px',
          color: '#ff657f',
          stroke: '#070a1e',
          strokeThickness: 4,
        })
        .setOrigin(0.5);
      this.gameOverScore = this.add
        .text(0, -10, '', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '13px',
          color: '#fff6d8',
          align: 'center',
        })
        .setOrigin(0.5);
      const panelHint = this.add
        .text(0, 39, 'Tap / Space / R — restart', {
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '12px',
          color: '#9fb7ff',
        })
        .setOrigin(0.5);
      this.gameOverPanel.add([panelBg, panelTitle, this.gameOverScore, panelHint]);

      this.updateHud();
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
      });

      this.input.on('pointerdown', (pointer) => {
        if (this.isGameOver && !isPointerOnControls(pointer)) {
          this.scene.restart();
        }
      });
    }

    update(time, delta) {
      this.readKeyboard();

      if (this.isGameOver) {
        return;
      }

      const dt = delta / 1000;
      this.gameSpeed = Math.min(MAX_SPEED, this.gameSpeed + 3.8 * dt);
      this.distance += this.gameSpeed * dt * 0.075;

      this.clouds.tilePositionX += this.gameSpeed * dt * 0.07;
      this.cityFar.tilePositionX += this.gameSpeed * dt * 0.18;
      this.treesMid.tilePositionX += this.gameSpeed * dt * 0.42;
      this.road.tilePositionX += this.gameSpeed * dt;

      this.updatePlayerAnimation(time);
      this.updateSpawning(delta);
      this.updateMovingObjects();
      this.updateHud();
    }

    readKeyboard() {
      if (this.isGameOver) {
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
      if (this.isGameOver) {
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

      this.player.setVelocityY(onGround ? -410 : -350);
      this.jumpsLeft -= 1;
      this.player.setTexture('dino-jump');
      this.setPlayerRunHitbox();
      this.soundBeep(420, 0.035);
    }

    startSlide() {
      if (this.isGameOver || this.isSliding) {
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

    updateSpawning(delta) {
      this.nextObstacleAt -= delta;
      this.nextCollectibleAt -= delta;

      if (this.nextObstacleAt <= 0) {
        this.spawnObstacle();
        const difficulty = Phaser.Math.Clamp((this.gameSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
        this.nextObstacleAt = Phaser.Math.Between(930, 1540) - difficulty * 330;
      }

      if (this.nextCollectibleAt <= 0) {
        this.spawnBottle();
        this.nextCollectibleAt = Phaser.Math.Between(1700, 3100);
      }
    }

    updateMovingObjects() {
      this.obstacles.children.each((obstacle) => {
        obstacle.body.setVelocityX(-this.gameSpeed);
        if (obstacle.x < -44) {
          obstacle.destroy();
        }
      });

      this.collectibles.children.each((bottle) => {
        bottle.body.setVelocityX(-this.gameSpeed * 0.96);
        bottle.angle = Math.sin((this.time.now + bottle.spawnOffset) * 0.006) * 5;
        if (bottle.x < -32) {
          bottle.destroy();
        }
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
      obstacle.body.setVelocityX(-this.gameSpeed);

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
      bottle.body.setVelocityX(-this.gameSpeed * 0.96);
      bottle.body.setSize(13, 17).setOffset(2, 3);
      bottle.spawnOffset = Phaser.Math.Between(0, 999);
    }

    collectBottle(bottle) {
      if (!bottle.active) return;
      const x = bottle.x;
      const y = bottle.y;
      bottle.destroy();
      this.h2o += 1;
      this.distance += 8;
      this.soundBeep(720, 0.04);
      this.spawnPopup(x, y, '+H2O');
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

    hitObstacle() {
      if (this.isGameOver) return;
      this.isGameOver = true;
      this.physics.pause();
      this.player.setTint(0xff657f);
      this.cameras.main.shake(180, 0.012);
      this.soundBeep(110, 0.08);

      const finalDistance = Math.floor(this.distance);
      if (finalDistance > this.bestDistance) {
        this.bestDistance = finalDistance;
        writeBestDistance(this.bestDistance);
      }
      this.gameOverScore.setText(`DIST ${pad(finalDistance, 4)}   H2O ${this.h2o}\nBEST ${pad(this.bestDistance, 4)}`);
      this.gameOverPanel.setVisible(true);
    }

    updateHud() {
      this.hudText.setText(
        `DIST ${pad(Math.floor(this.distance), 4)}   H2O ${this.h2o}   BEST ${pad(this.bestDistance, 4)}   PACE ${Math.round(this.gameSpeed)}`,
      );
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

  function pad(value, length) {
    return String(value).padStart(length, '0');
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
