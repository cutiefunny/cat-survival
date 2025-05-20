'use client';

import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';

function getGameDimensions() {
    if (typeof window !== 'undefined') {
        const maxWidth = 2400;
        const maxHeight = 1600;
        const minWidth = 1200;
        const minHeight = 1600;
        let width = Math.max(minWidth, Math.min(window.innerWidth, maxWidth));
        let height = Math.max(minHeight, Math.min(window.innerHeight, maxHeight));
        return { width, height };
    }
    return { width: 800, height: 600 };
}

const baseConfig: Omit<Phaser.Types.Core.GameConfig, 'width' | 'height'> = {
    type: Phaser.AUTO,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    parent: 'game-container',
    // !!! 변경된 부분: orientation 속성을 scale 밖으로 이동 !!!
    orientation: Phaser.Scale.LANDSCAPE, // GameConfig의 직접 속성

    scale: {
        mode: Phaser.Scale.RESIZE,
        // orientation: Phaser.Scale.LANDSCAPE, // 이곳에서는 삭제됨
    }
};

let gameOver = false;
let elapsedTime = 0;

let initialPinchDistance = 0;
let lastCameraZoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

const PLAYER_PUSH_BACK_FORCE = 300;
const KNOCKBACK_DURATION_MS = 250;

const INITIAL_PLAYER_ENERGY = 3;

const BASE_PLAYER_SPEED = 200;
const DOG_CHASE_SPEED = BASE_PLAYER_SPEED * 0.5;

const MOUSE_SPAWN_INTERVAL_MS = 1000;
const MAX_ACTIVE_MICE = 30;

const DOG_SPAWN_INTERVAL_MS = 2000;
const MAX_ACTIVE_DOGS = 20;

const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;

const DPAD_BUTTON_SIZE = 50;
const DPAD_PADDING = 30;
const DPAD_ALPHA_IDLE = 0.5;
const DPAD_ALPHA_PRESSED = 0.9;
const DPAD_COLOR = 0x555555;


function preload(this: Phaser.Scene) {
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet('animation_sprite', 'https://phaser.io/examples/assets/sprites/metalslug_mummy37x45.png', { frameWidth: 37, frameHeight: 45 });
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
}

function create(this: Phaser.Scene) {
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    this.cameras.main.setBackgroundColor('#ffffff');

    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = isMobile ? 0.7 : 1.0;

    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    player.setCollideWorldBounds(true);
    player.setScale(0.5 * spriteScaleFactor);
    player.setDrag(500);

    this.anims.create({
        key: 'cat_walk',
        frames: this.anims.generateFrameNumbers('player_sprite', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1
    });
    player.setFrame(0);

    this.anims.create({
        key: 'mouse_walk',
        frames: this.anims.generateFrameNumbers('mouse_enemy_sprite', { start: 0, end: 1 }),
        frameRate: 8,
        repeat: -1
    });

    this.anims.create({
        key: 'dog_walk',
        frames: this.anims.generateFrameNumbers('dog_enemy_sprite', { start: 0, end: 1 }),
        frameRate: 6,
        repeat: -1
    });

    const mice = this.physics.add.group();
    const dogs = this.physics.add.group();

    this.time.addEvent({
        delay: MOUSE_SPAWN_INTERVAL_MS,
        callback: spawnMouseVillain,
        callbackScope: this,
        loop: true
    });

    this.time.addEvent({
        delay: DOG_SPAWN_INTERVAL_MS,
        callback: spawnDogVillain,
        callbackScope: this,
        loop: true
    });

    const cursors = this.input.keyboard?.createCursorKeys();
    this.input.addPointer(1);
    this.input.addPointer(2);

    this.physics.add.collider(player, mice, hitMouse as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(player, dogs, hitDog as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    this.physics.add.collider(mice, mice);
    this.physics.add.collider(dogs, dogs);
    this.physics.add.collider(mice, dogs);

    const scoreText = this.add.text(0, 0, 'Score: 0', { fontSize: '16px', color: '#000000' });
    scoreText.setOrigin(0.5);

    const timerText = this.add.text(
        0, 0,
        'Time: 0s',
        { fontSize: '16px', color: '#000000' }
    );
    timerText.setOrigin(0.5);
    timerText.setVisible(false);

    const energyBarBg = this.add.graphics();
    energyBarBg.fillStyle(ENERGY_BAR_COLOR_BG, 0.8);
    energyBarBg.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);

    const energyBarFill = this.add.graphics();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);

    this.time.addEvent({
        delay: 1000,
        callback: () => {
            if (!gameOver) {
                elapsedTime++;
                timerText.setText('Time: ' + elapsedTime + 's');
            }
        },
        callbackScope: this,
        loop: true
    });

    const gameOverText = this.add.text(
        this.cameras.main.centerX,
        this.cameras.main.centerY,
        'Game Over',
        { fontSize: '64px', color: '#ff0000' }
    );
    gameOverText.setOrigin(0.5);
    gameOverText.setScrollFactor(0);
    gameOverText.setVisible(false);

    this.data.set('player', player);
    this.data.set('mice', mice);
    this.data.set('dogs', dogs);
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('scoreText', scoreText);
    this.data.set('timerText', timerText);
    this.data.set('gameOverText', gameOverText);
    this.data.set('spriteScaleFactor', spriteScaleFactor);

    this.data.set('isKnockedBack', false);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('energyBarBg', energyBarBg);
    this.data.set('energyBarFill', energyBarFill);

    this.cameras.main.startFollow(player, true, 0.05, 0.05);

    const { width, height } = getGameDimensions();
    this.physics.world.setBounds(0, 0, width, height);

    const worldBorder = this.add.graphics();
    worldBorder.lineStyle(4, 0xff0000, 1);
    worldBorder.strokeRect(0, 0, width, height);
    this.data.set('worldBorder', worldBorder);

    if (isMobile) {
        this.data.set('dPadStates', { up: false, down: false, left: false, right: false });

        const buttonSize = DPAD_BUTTON_SIZE;
        const padding = DPAD_PADDING;

        const dPadCenterX = (this.game.config.width as number) - padding - (buttonSize / 2) - buttonSize;
        const dPadCenterY = (this.game.config.height as number) - padding - (buttonSize / 2) - buttonSize;

        const upButton = this.add.graphics()
            .fillStyle(DPAD_COLOR, DPAD_ALPHA_IDLE)
            .fillRect(dPadCenterX - buttonSize / 2, dPadCenterY - buttonSize - padding / 2, buttonSize, buttonSize)
            .setInteractive(new Phaser.Geom.Rectangle(dPadCenterX - buttonSize / 2, dPadCenterY - buttonSize - padding / 2, buttonSize, buttonSize), Phaser.Geom.Rectangle.Contains)
            .setScrollFactor(0)
            .on('pointerdown', () => { this.data.get('dPadStates').up = true; upButton.alpha = DPAD_ALPHA_PRESSED; })
            .on('pointerup', () => { this.data.get('dPadStates').up = false; upButton.alpha = DPAD_ALPHA_IDLE; })
            .on('pointerout', () => { this.data.get('dPadStates').up = false; upButton.alpha = DPAD_ALPHA_IDLE; });

        const downButton = this.add.graphics()
            .fillStyle(DPAD_COLOR, DPAD_ALPHA_IDLE)
            .fillRect(dPadCenterX - buttonSize / 2, dPadCenterY + padding / 2, buttonSize, buttonSize)
            .setInteractive(new Phaser.Geom.Rectangle(dPadCenterX - buttonSize / 2, dPadCenterY + padding / 2, buttonSize, buttonSize), Phaser.Geom.Rectangle.Contains)
            .setScrollFactor(0)
            .on('pointerdown', () => { this.data.get('dPadStates').down = true; downButton.alpha = DPAD_ALPHA_PRESSED; })
            .on('pointerup', () => { this.data.get('dPadStates').down = false; downButton.alpha = DPAD_ALPHA_IDLE; })
            .on('pointerout', () => { this.data.get('dPadStates').down = false; downButton.alpha = DPAD_ALPHA_IDLE; });

        const leftButton = this.add.graphics()
            .fillStyle(DPAD_COLOR, DPAD_ALPHA_IDLE)
            .fillRect(dPadCenterX - buttonSize - padding / 2, dPadCenterY - buttonSize / 2, buttonSize, buttonSize)
            .setInteractive(new Phaser.Geom.Rectangle(dPadCenterX - buttonSize - padding / 2, dPadCenterY - buttonSize / 2, buttonSize, buttonSize), Phaser.Geom.Rectangle.Contains)
            .setScrollFactor(0)
            .on('pointerdown', () => { this.data.get('dPadStates').left = true; leftButton.alpha = DPAD_ALPHA_PRESSED; })
            .on('pointerup', () => { this.data.get('dPadStates').left = false; leftButton.alpha = DPAD_ALPHA_IDLE; })
            .on('pointerout', () => { this.data.get('dPadStates').left = false; leftButton.alpha = DPAD_ALPHA_IDLE; });

        const rightButton = this.add.graphics()
            .fillStyle(DPAD_COLOR, DPAD_ALPHA_IDLE)
            .fillRect(dPadCenterX + padding / 2, dPadCenterY - buttonSize / 2, buttonSize, buttonSize)
            .setInteractive(new Phaser.Geom.Rectangle(dPadCenterX + padding / 2, dPadCenterY - buttonSize / 2, buttonSize, buttonSize), Phaser.Geom.Rectangle.Contains)
            .setScrollFactor(0)
            .on('pointerdown', () => { this.data.get('dPadStates').right = true; rightButton.alpha = DPAD_ALPHA_PRESSED; })
            .on('pointerup', () => { this.data.get('dPadStates').right = false; rightButton.alpha = DPAD_ALPHA_IDLE; })
            .on('pointerout', () => { this.data.get('dPadStates').right = false; rightButton.alpha = DPAD_ALPHA_IDLE; });

        this.data.set('dPadButtons', [upButton, downButton, leftButton, rightButton]);
    }


    this.scale.on('resize', (gameSize: Phaser.Structs.Size, baseSize: Phaser.Structs.Size, displaySize: Phaser.Structs.Size, previousWidth: number, previousHeight: number) => {
        console.log('Canvas Resized!');
        console.log('Game Size (Logical):', gameSize.width, gameSize.height);
        console.log('Display Size (Actual Canvas):', displaySize.width, displaySize.height);
        console.log('Previous Size:', previousWidth, previousHeight);
        console.log('Current Scale Factors:', this.scale.displayScale.x, this.scale.displayScale.y);

        const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
        if (gameOverText) {
            gameOverText.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
        }

        const currentWorldBorder = this.data.get('worldBorder') as Phaser.GameObjects.Graphics;
        const { width: newWidth, height: newHeight } = getGameDimensions();

        currentWorldBorder.clear();
        currentWorldBorder.lineStyle(4, 0xff0000, 1);
        currentWorldBorder.strokeRect(0, 0, newWidth, newHeight);

        this.physics.world.setBounds(0, 0, newWidth, newHeight);

        if (isMobile) {
            const dPadButtons = this.data.get('dPadButtons') as Phaser.GameObjects.Graphics[];
            const buttonSize = DPAD_BUTTON_SIZE;
            const padding = DPAD_PADDING;

            const dPadCenterX = (newWidth as number) - padding - (buttonSize / 2) - buttonSize;
            const dPadCenterY = (newHeight as number) - padding - (buttonSize / 2) - buttonSize;

            if (dPadButtons && dPadButtons.length > 0) {
                // 각 버튼의 위치를 새롭게 계산하여 설정
                // 상단 버튼
                dPadButtons[0].setPosition(dPadCenterX - buttonSize / 2, dPadCenterY - buttonSize - padding / 2);
                if (dPadButtons[0].input) {
                    (dPadButtons[0].input.hitArea as Phaser.Geom.Rectangle).setPosition(dPadButtons[0].x, dPadButtons[0].y);
                }
                // 하단 버튼
                dPadButtons[1].setPosition(dPadCenterX - buttonSize / 2, dPadCenterY + padding / 2);
                if (dPadButtons[1].input) {
                    (dPadButtons[1].input.hitArea as Phaser.Geom.Rectangle).setPosition(dPadButtons[1].x, dPadButtons[1].y);
                }
                // 좌측 버튼
                dPadButtons[2].setPosition(dPadCenterX - buttonSize - padding / 2, dPadCenterY - buttonSize / 2);
                if (dPadButtons[2].input) {
                    (dPadButtons[2].input.hitArea as Phaser.Geom.Rectangle).setPosition(dPadButtons[2].x, dPadButtons[2].y);
                }
                // 우측 버튼
                dPadButtons[3].setPosition(dPadCenterX + padding / 2, dPadCenterY - buttonSize / 2);
                if (dPadButtons[3].input) {
                    (dPadButtons[3].input.hitArea as Phaser.Geom.Rectangle).setPosition(dPadButtons[3].x, dPadButtons[3].y);
                }
            }
        }
    });

    console.log('Initial Scale Factors:', this.scale.displayScale.x, this.scale.displayScale.y);
}

function spawnMouseVillain(this: Phaser.Scene) {
    if (gameOver) return;

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeMice = mice.countActive(true);

    if (activeMice >= MAX_ACTIVE_MICE) {
        console.log(`Max mice (${MAX_ACTIVE_MICE}) reached. Skipping mouse spawn.`);
        return;
    }

    spawnMouse.call(this, mice, player);
}

function spawnDogVillain(this: Phaser.Scene) {
    if (gameOver) return;

    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeDogs = dogs.countActive(true);

    if (activeDogs >= MAX_ACTIVE_DOGS) {
        console.log(`Max dogs (${MAX_ACTIVE_DOGS}) reached. Skipping dog spawn.`);
        return;
    }

    spawnDog.call(this, dogs, player);
}

function spawnMouse(this: Phaser.Scene, mice: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const gameWidth = this.physics.world.bounds.width;
    const gameHeight = this.physics.world.bounds.height;

    switch (edge) {
        case 0: x = Phaser.Math.Between(0, gameWidth); y = -50; break;
        case 1: x = Phaser.Math.Between(0, gameWidth); y = gameHeight + 50; break;
        case 2: x = -50; y = Phaser.Math.Between(0, gameHeight); break;
        case 3: x = gameWidth + 50; y = Phaser.Math.Between(0, gameHeight); break;
        default: x = 0; y = 0; break;
    }

    const mouse = mice.create(x, y, 'mouse_enemy_sprite') as Phaser.Physics.Arcade.Sprite;
    mouse.setBounce(0.2);
    mouse.setCollideWorldBounds(false);
    const spriteScaleFactor = this.data.get('spriteScaleFactor') as number;
    mouse.setScale((32 / 100) * spriteScaleFactor);
    mouse.play('mouse_walk');
    this.physics.moveToObject(mouse, player, 50);
}

function spawnDog(this: Phaser.Scene, dogs: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const gameWidth = this.physics.world.bounds.width;
    const gameHeight = this.physics.world.bounds.height;

    switch (edge) {
        case 0: x = Phaser.Math.Between(0, gameWidth); y = -50; break;
        case 1: x = Phaser.Math.Between(0, gameWidth); y = gameHeight + 50; break;
        case 2: x = -50; y = Phaser.Math.Between(0, gameHeight); break;
        case 3: x = gameWidth + 50; y = Phaser.Math.Between(0, gameHeight); break;
        default: x = 0; y = 0; break;
    }

    const dog = dogs.create(x, y, 'dog_enemy_sprite') as Phaser.Physics.Arcade.Sprite;
    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false);
    const spriteScaleFactor = this.data.get('spriteScaleFactor') as number;
    dog.setScale(0.5 * spriteScaleFactor);
    dog.play('dog_walk');
}

function hitMouse(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    mouse: Phaser.Physics.Arcade.Sprite
) {
    if (gameOver) return;

    console.log('Collision detected! Player hit by mouse!');

    if (mouse && mouse.body && (mouse as any).disableBody) {
        console.log('Disabling mouse body.');
        (mouse as any).disableBody(true, true);
    } else {
        console.warn('Attempted to disable body on an object without a physics body or disableBody method:', mouse);
    }

    let score = this.data.get('score');
    score += 10;
    this.data.set('score', score);
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text;
    scoreText.setText('Score: ' + score);
}

function hitDog(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    dog: Phaser.Physics.Arcade.Sprite
) {
    if (gameOver) return;

    console.log('Collision detected! Player hit by dog!');

    if (player.body && dog.body) {
        const direction = new Phaser.Math.Vector2(player.x - dog.x, player.y - dog.y).normalize();
        player.setVelocity(direction.x * PLAYER_PUSH_BACK_FORCE, direction.y * PLAYER_PUSH_BACK_FORCE);
        console.log(`Player pushed back by dog with force: ${PLAYER_PUSH_BACK_FORCE}`);

        this.data.set('isKnockedBack', true);
        this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
            this.data.set('isKnockedBack', false);
            console.log('Knockback ended (dog)');
        }, [], this);
    }

    if (dog && dog.body && (dog as any).disableBody) {
        console.log('Disabling dog body.');
        (dog as any).disableBody(true, true);
    } else {
        console.warn('Attempted to disable body on an object without a physics body or disableBody method:', dog);
    }

    let energy = this.data.get('energy');
    energy--;
    this.data.set('energy', energy);

    const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
    const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

    energyBarFill.clear();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);

    if (energy <= 0) {
        console.log('Energy dropped to 0 or below. Game Over!');
        endGame.call(this);
    }
}

function endGame(this: Phaser.Scene) {
    if (gameOver) return;
    gameOver = true;
    console.log('Game Over!');
    this.physics.pause();
    this.time.removeAllEvents();

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    if (player) {
        player.stop();
    }

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    if (mice) mice.getChildren().forEach((mouse) => (mouse.body as any)?.stop());
    if (dogs) dogs.getChildren().forEach((dog) => (dog.body as any)?.stop());

    const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
    if (gameOverText) {
        gameOverText.setVisible(true);
    }
}

function update(this: Phaser.Scene) {
    if (gameOver) {
        return;
    }

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const cursors = this.data.get('cursors') as Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const isKnockedBack = this.data.get('isKnockedBack') as boolean;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;

    if (!player || !cursors) {
        return;
    }

    const playerSpeed = BASE_PLAYER_SPEED;
    let isMovingForAnimation = false;

    const dPadStates = isMobile ? (this.data.get('dPadStates') as { up: boolean, down: boolean, left: boolean, right: boolean }) : undefined;


    if (!isKnockedBack) {
        if (isMobile && this.input.pointer1.isDown && this.input.pointer2.isDown) {
            const currentPinchDistance = Phaser.Math.Distance.Between(
                this.input.pointer1.x, this.input.pointer1.y,
                this.input.pointer2.x, this.input.pointer2.y
            );

            if (initialPinchDistance === 0) {
                initialPinchDistance = currentPinchDistance;
                lastCameraZoom = this.cameras.main.zoom;
            } else {
                let zoomFactor = currentPinchDistance / initialPinchDistance;
                let newZoom = lastCameraZoom * zoomFactor;
                newZoom = Phaser.Math.Clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
                this.cameras.main.setZoom(newZoom);
            }
            player.setVelocity(0);
            isMovingForAnimation = false;

        } else if (isMobile && dPadStates && (dPadStates.up || dPadStates.down || dPadStates.left || dPadStates.right)) {
            player.setVelocity(0);
            if (dPadStates.up) player.setVelocityY(-playerSpeed);
            if (dPadStates.down) player.setVelocityY(playerSpeed);
            if (dPadStates.left) player.setVelocityX(-playerSpeed);
            if (dPadStates.right) player.setVelocityX(playerSpeed);

            if (player.body instanceof Phaser.Physics.Arcade.Body) {
                player.body.velocity.normalize().scale(playerSpeed);
            }
            isMovingForAnimation = true;

        } else if (this.input.activePointer.isDown) {
            const canvas = this.game.canvas;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.clientWidth / (this.game.config.width as number);
            const scaleY = canvas.clientHeight / (this.game.config.height as number);

            const pointerCanvasX = this.input.activePointer.x - rect.left;
            const pointerCanvasY = this.input.activePointer.y - rect.top;

            const targetWorldX = pointerCanvasX / scaleX + this.cameras.main.scrollX;
            const targetWorldY = pointerCanvasY / scaleY + this.cameras.main.scrollY;

            this.physics.moveToObject(player, { x: targetWorldX, y: targetWorldY }, playerSpeed);

            if (targetWorldX < player.x) {
                player.setFlipX(false);
            } else if (targetWorldX > player.x) {
                player.setFlipX(true);
            }

            const distance = Phaser.Math.Distance.Between(player.x, player.y, targetWorldX, targetWorldY);
            if (distance < 5) {
                if (player.body) {
                    player.body.stop();
                }
                isMovingForAnimation = false;
            } else {
                isMovingForAnimation = true;
            }

        } else if (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown) {
            player.setVelocity(0);
            if (cursors.left.isDown) {
                player.setVelocityX(-playerSpeed);
                player.setFlipX(false);
            } else if (cursors.right.isDown) {
                player.setVelocityX(playerSpeed);
                player.setFlipX(true);
            }
            if (cursors.up.isDown) {
                player.setVelocityY(-playerSpeed);
            } else if (cursors.down.isDown) {
                player.setVelocityY(playerSpeed);
            }
            if (player.body instanceof Phaser.Physics.Arcade.Body) {
                player.body.velocity.normalize().scale(playerSpeed);
            }
            isMovingForAnimation = true;

        } else {
            if (player.body && Math.abs(player.body.velocity.x) < 10 && Math.abs(player.body.velocity.y) < 10) {
                player.setVelocity(0);
                isMovingForAnimation = false;
            } else {
                isMovingForAnimation = true;
            }
        }
    } else {
        if (player.body && (Math.abs(player.body.velocity.x) > 10 || Math.abs(player.body.velocity.y) > 10)) {
            isMovingForAnimation = true;
        } else {
            isMovingForAnimation = false;
        }
    }

    if (isMovingForAnimation) {
        player.play('cat_walk', true);
    } else {
        player.stop();
        player.setFrame(0);
    }

    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text;
    const timerText = this.data.get('timerText') as Phaser.GameObjects.Text;
    const energyBarBg = this.data.get('energyBarBg') as Phaser.GameObjects.Graphics;
    const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;

    const playerBottomY = player.y + (player.displayHeight / 2) + 5;
    const textSpacing = 20;

    scoreText.setPosition(player.x, playerBottomY);
    energyBarBg.x = player.x - (ENERGY_BAR_WIDTH / 2);
    energyBarBg.y = playerBottomY + textSpacing;
    energyBarFill.x = energyBarBg.x;
    energyBarFill.y = energyBarBg.y;

    mice.getChildren().forEach((mouseObject) => {
        const mouse = mouseObject as Phaser.Physics.Arcade.Sprite;
        if (mouse.body instanceof Phaser.Physics.Arcade.Body) {
            if (mouse.body.velocity.x < 0) {
                mouse.setFlipX(false);
            } else if (mouse.body.velocity.x > 0) {
                mouse.setFlipX(true);
            }
        }
    });

    dogs.getChildren().forEach((dogObject) => {
        const dog = dogObject as Phaser.Physics.Arcade.Sprite;
        if (dog.active && dog.body) {
            this.physics.moveToObject(dog, player, DOG_CHASE_SPEED);
            if (dog.body.velocity.x < 0) {
                dog.setFlipX(false);
            } else if (dog.body.velocity.x > 0) {
                dog.setFlipX(true);
            }
        }
    });
}

const GameCanvas: React.FC = () => {
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);

    useEffect(() => {
        const isClient = typeof window !== 'undefined';

        if (isClient && gameContainerRef.current && !gameRef.current) {
            console.log('Initializing Phaser game on client...');
            const { width, height } = getGameDimensions();
            const currentConfig: Phaser.Types.Core.GameConfig = {
                ...baseConfig,
                width: width,
                height: height,
            };
            currentConfig.parent = gameContainerRef.current.id;
            const newGame = new Phaser.Game(currentConfig);
            gameRef.current = newGame;

            const handleResize = () => {
                console.log('Window resized. Current window size:', window.innerWidth, window.innerHeight);
            };
            window.addEventListener('resize', handleResize);

            return () => {
                console.log('Removing resize listener.');
                window.removeEventListener('resize', handleResize);
            };
        } else if (!isClient) {
            console.log('Running on server, skipping Phaser initialization.');
        }

        return () => {
            if (gameRef.current) {
                console.log('Destroying Phaser game...');
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    return (
        <div id="game-container" ref={gameContainerRef} style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        </div>
    );
};

export default GameCanvas;