'use client';

import React, { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';

function getGameDimensions() {
    if (typeof window !== 'undefined') {
        const maxWidth = 2400;
        const maxHeight = 1600;
        const minWidth = 300;
        const minHeight = 400;
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
    scale: {
        mode: Phaser.Scale.RESIZE,
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

// !!! 변경된 상수: 쥐와 개 생성 규칙 분리 !!!
const MOUSE_SPAWN_INTERVAL_MS = 1000; // 1초마다 쥐 생성
const MAX_ACTIVE_MICE = 30; // 화면에 존재할 수 있는 최대 쥐 수

const DOG_SPAWN_INTERVAL_MS = 2000; // 2초마다 개 생성
const MAX_ACTIVE_DOGS = 20; // 화면에 존재할 수 있는 최대 개 수 (기존 MAX_ACTIVE_VILLAINS 역할)


const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;


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

    // !!! 변경된 부분: 쥐 전용 생성 타이머 추가 !!!
    this.time.addEvent({
        delay: MOUSE_SPAWN_INTERVAL_MS,
        callback: spawnMouseVillain, // 쥐 생성 관리 함수 호출
        callbackScope: this,
        loop: true
    });

    // !!! 변경된 부분: 개 전용 생성 타이머 추가 (기존 통합 빌런 타이머 역할) !!!
    this.time.addEvent({
        delay: DOG_SPAWN_INTERVAL_MS,
        callback: spawnDogVillain, // 개 생성 관리 함수 호출
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
    });

    console.log('Initial Scale Factors:', this.scale.displayScale.x, this.scale.displayScale.y);

    if (isMobile) {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                initialPinchDistance = Phaser.Math.Distance.Between(
                    this.input.pointer1.x, this.input.pointer1.y,
                    this.input.pointer2.x, this.input.pointer2.y
                );
                lastCameraZoom = this.cameras.main.zoom;
                console.log('Two pointers down. Initial pinch distance:', initialPinchDistance);
            }
        });
    }
}

// !!! 삭제된 함수: spawnVillain (이제 쥐와 개가 개별 함수로 관리) !!!
// function spawnVillain(this: Phaser.Scene) { /* ... */ }


// !!! 새로운 쥐 생성 관리 함수 !!!
function spawnMouseVillain(this: Phaser.Scene) {
    if (gameOver) return;

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeMice = mice.countActive(true);

    if (activeMice >= MAX_ACTIVE_MICE) { // 쥐 최대 개수 확인
        console.log(`Max mice (${MAX_ACTIVE_MICE}) reached. Skipping mouse spawn.`);
        return;
    }

    spawnMouse.call(this, mice, player); // 실제 쥐 생성 함수 호출
    // console.log('Spawning a mouse (1s interval).'); // 이미 내부에서 로그를 남기므로 제거 또는 조정
}

// !!! 새로운 개 생성 관리 함수 (기존 spawnVillain의 개 생성 부분 분리) !!!
function spawnDogVillain(this: Phaser.Scene) {
    if (gameOver) return;

    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeDogs = dogs.countActive(true);

    if (activeDogs >= MAX_ACTIVE_DOGS) { // 개 최대 개수 확인
        console.log(`Max dogs (${MAX_ACTIVE_DOGS}) reached. Skipping dog spawn.`);
        return;
    }

    spawnDog.call(this, dogs, player); // 실제 개 생성 함수 호출
    // console.log('Spawning a dog (2s interval).'); // 이미 내부에서 로그를 남기므로 제거 또는 조정
}


function spawnMouse(this: Phaser.Scene, mice: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const gameWidth = this.game.config.width as number;
    const gameHeight = this.game.config.height as number;

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
    const gameWidth = this.game.config.width as number;
    const gameHeight = this.game.config.height as number;

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
                newZoom = Phaser.Math.Clamp(newZoom, MIN_ZOOM, MAX_MAX_ACTIVE_DOGS);
                this.cameras.main.setZoom(newZoom);
            }
            player.setVelocity(0);
            isMovingForAnimation = false;

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