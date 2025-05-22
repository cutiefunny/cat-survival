'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import ShopModal from './shopModal'; // ShopModal.tsx 파일 경로에 맞게 수정해주세요.
import { SkillsProvider, useSkills } from './SkillsContext'; // SkillsContext 임포트


function getGameDimensions() {
    if (typeof window !== 'undefined') {
        const maxWidth = 2400;
        const maxHeight = 1600;
        const minWidth = 400;
        const minHeight = 800;
        let width = Math.max(minWidth, Math.min(window.innerWidth, maxWidth));
        let height = Math.max(minHeight, Math.min(window.innerHeight, maxHeight));

        const minWidthApplied = (width === minWidth);
        return { width, height, minWidthApplied };
    }
    return { width: 800, height: 600, minWidthApplied: false };
}

interface CustomGameConfig extends Phaser.Types.Core.GameConfig {
    // initialSceneData?: { ... };
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
        key: 'MainScene', // 씬의 고유 키
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
const DOG_CHASE_SPEED = BASE_PLAYER_SPEED * 0.3;

const MOUSE_SPAWN_INTERVAL_MS = 1000;
const MAX_ACTIVE_MICE = 30;

const DOG_SPAWN_INTERVAL_MS = 2000;
const MAX_ACTIVE_DOGS = 20;

const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;

// let skills: number[] = []; // skills 변수 유지
//skills.push(1); // 기본값으로 1 추가 (테스트용)


function preload(this: Phaser.Scene) {
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
    this.load.image('cat_punch', '/images/cat_punch.png'); // cat_punch 이미지 로드
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
}

function create(this: Phaser.Scene) {
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    this.cameras.main.setBackgroundColor('#ffffff');
    generateBackground.call(this);

    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;

    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;

    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    player.setCollideWorldBounds(true);
    player.setDrag(500);

    let finalPlayerScale;
    if (minWidthApplied) {
        finalPlayerScale = 0.5 * (isMobile ? 0.7 : 1.0);
    } else {
        finalPlayerScale = 0.5 * (isMobile ? 0.7 : 1.0);
    }
    player.setScale(finalPlayerScale);


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

    this.data.set('isKnockedBack', false);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('energyBarBg', energyBarBg);
    this.data.set('energyBarFill', energyBarFill);
    this.data.set('shopOpened', false); // 상점 팝업 플래그 초기화
    this.data.set('skills', []); // skills 배열을 씬 데이터에 저장


    this.cameras.main.startFollow(player, true, 0.05, 0.05);

    const { width, height } = getGameDimensions();
    this.physics.world.setBounds(0, 0, width, height);

    const worldBorder = this.add.graphics();
    // worldBorder.lineStyle(4, 0xff0000, 1);
    worldBorder.strokeRect(0, 0, width, height);
    this.data.set('worldBorder', worldBorder);
    
    // D-Pad 컨트롤러 생성 로직 (현재는 제거된 상태)
    // if (isMobile) { ... }

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
        // currentWorldBorder.lineStyle(4, 0xff0000, 1);
        currentWorldBorder.strokeRect(0, 0, newWidth, newHeight);

        this.physics.world.setBounds(0, 0, newWidth, newHeight);

        // D-Pad 버튼 위치 조정 로직 (현재는 제거된 상태)
        // if (isMobile) { ... }
    });

    console.log('Initial Scale Factors:', this.scale.displayScale.x, this.scale.displayScale.y);
}

function generateBackground(this: Phaser.Scene) {
    const width = this.game.config.width as number;
    const height = this.game.config.height as number;

    for (let x = 0; x < width; x += 32) {
        for (let y = 0; y < height; y += 32) {
            const hue = Phaser.Math.FloatBetween(0.25, 0.40); // 녹색 범위: 0.25 ~ 0.40
            const saturation = Phaser.Math.FloatBetween(0.1, 0.3); // 채도 감소
            const lightness = Phaser.Math.FloatBetween(0.3, 0.4); // 명도 감소
            
            const color = Phaser.Display.Color.HSLToColor(hue, saturation, lightness).color;
            this.add.rectangle(x, y, 32, 32, color);
        }
    }
}

// CustomDogSprite 인터페이스 (dog에 isKnockedBack 속성 추가를 위함)
interface CustomDogSprite extends Phaser.Physics.Arcade.Sprite {
    isKnockedBack?: boolean; // 넉백 상태를 추적하는 속성
}

function spawnMouseVillain(this: Phaser.Scene) {
    if (gameOver) return;

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeMice = mice.countActive(true);

    if (activeMice >= MAX_ACTIVE_MICE) {
        // console.log(`Max mice (${MAX_ACTIVE_MICE}) reached. Skipping mouse spawn.`);
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
        //console.log(`Max dogs (${MAX_ACTIVE_DOGS}) reached. Skipping dog spawn.`);
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
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
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

    const dog = dogs.create(x, y, 'dog_enemy_sprite') as CustomDogSprite; // CustomDogSprite로 캐스팅
    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false);
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    dog.setScale(0.5 * spriteScaleFactor);
    dog.play('dog_walk');
    dog.isKnockedBack = false; // 기본적으로 넉백 상태가 아님
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
    dogObject: Phaser.Physics.Arcade.Sprite // dogObject로 이름 변경하여 CustomDogSprite로 캐스팅
) {
    if (gameOver) return;

    console.log('Collision detected! Player hit by dog!');

    const dog = dogObject as CustomDogSprite; // CustomDogSprite로 캐스팅
    // 플레이어가 개를 바라보는 방향을 향하고 있는지 확인
    const dotProduct = (dog.x - player.x) * (player.flipX ? -1 : 1);
    // !!! MODIFIED START: Conditional knockback based on skills !!!
    // skills 배열이 number[] 타입이므로 1을 숫자로 사용합니다.
    let skills = this.data.get('skills') as number[]; // skills 배열을 씬 데이터에서 가져옴
    if (skills.includes(1) && dotProduct < 0) { // FIX: Changed skills.includes('1') to skills.includes(1) for number array
        // Skill '1' active: knock back the dog, not the player
        if (player.body && dog.body) {
            const direction = new Phaser.Math.Vector2(dog.x - player.x, dog.y - player.y).normalize();
            dog.setVelocity(direction.x * PLAYER_PUSH_BACK_FORCE, direction.y * PLAYER_PUSH_BACK_FORCE);

            console.log(`Dog knocked back by player with force: ${PLAYER_PUSH_BACK_FORCE} (Skill 1 active)`);

            dog.isKnockedBack = true; // 개 넉백 상태 설정
            dog.stop(); // 개 애니메이션 정지
            dog.body.checkCollision.none = true; // 넉백 중 충돌 비활성화
            this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
            dog.isKnockedBack = false; // 개 넉백 상태 해제
                dog.play('dog_walk', true); // 개 애니메이션 다시 시작
                if (dog.body) {
                    dog.body.checkCollision.none = false; // 넉백 후 충돌 다시 활성화
                }
                console.log('Dog knockback ended.');
            }, [], this);

            // 플레이어 스프라이트 변경 후 원상 복귀
            player.setTexture('cat_punch'); // cat_punch 이미지 로드되어 있어야 함
            this.time.delayedCall(300, () => {
                player.setTexture('player_sprite'); // 원래 스프라이트 시트로 복귀
                player.play('cat_walk', true); // 원래 애니메이션 재생
            }, [], this);
        }
    } else {
        // Skill '1' not active: player gets knocked back (original logic)
        if (player.body && dog.body) {
            const direction = new Phaser.Math.Vector2(player.x - dog.x, player.y - dog.y).normalize();
            player.setVelocity(direction.x * PLAYER_PUSH_BACK_FORCE, direction.y * PLAYER_PUSH_BACK_FORCE);
            console.log(`Player pushed back by dog with force: ${PLAYER_PUSH_BACK_FORCE} (Skill 1 inactive)`);

            this.data.set('isKnockedBack', true);
            this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
                this.data.set('isKnockedBack', false);
                console.log('Knockback ended (player)');
            }, [], this);
        }
        
        let energy = this.data.get('energy');
        energy--;
        this.data.set('energy', energy);

        // energyText는 이제 energyBarFill로 대체되었으므로 관련 코드 수정
        const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
        const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

        energyBarFill.clear();
        energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
        energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);

        if (energy <= 0) {
            console.log('Energy dropped to 0 or below. Game Over!');
            endGame.call(this);
        }
        // !!! MODIFIED END: 에너지 감소 로직 이동 !!!
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
    const isKnockedBack = this.data.get('isKnockedBack') as boolean;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const skills = this.data.get('skills') as number[]; // skills 배열을 씬 데이터에서 가져옴

    if (!player || !cursors) {
        return;
    }

    const playerSpeed = BASE_PLAYER_SPEED;
    let isMovingForAnimation = false;

    const score = this.data.get('score') as number;
    const shopOpened = this.data.get('shopOpened') as boolean;
    const openShopModal = this.data.get('openShopModal') as (score: number, skills: number[]) => void; // React에서 전달된 콜백 함수
    
    if (score >= 50 && !shopOpened) { 
        this.data.set('shopOpened', true);
        
        if (openShopModal) {
            console.log("Phaser Scene Update: Calling openShopModal callback. Score:", score); 
            openShopModal(score, skills);
        } else {
            console.error("Phaser Scene Update: openShopModal callback is UNDEFINED in scene data! This indicates a failure in passing the callback from React to Phaser."); 
        }
    }


    if (!isKnockedBack) {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
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
        }
        else if (this.input.activePointer.isDown) {
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
        }
        else if (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown) {
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
        }
        else {
            if (player.body && Math.abs(player.body.velocity.x) < 10 && Math.abs(player.body.velocity.y) < 10) {
                player.setVelocity(0);
                isMovingForAnimation = false;
            } else {
                isMovingForAnimation = true; // 넉백 잔여 속도 등으로 계속 움직이는 경우
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
        //const dog = dogObject as Phaser.Physics.Arcade.Sprite;
        const dog = dogObject as CustomDogSprite; // CustomDogSprite로 캐스팅
        if (dog.active && dog.body && !dog.isKnockedBack) {
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
    const gameSceneRef = useRef<Phaser.Scene | null>(null); // gameScene ref 생성
    const gameRef = useRef<Phaser.Game | null>(null);
    const [showShopModal, setShowShopModal] = useState(false);
    const [currentScore, setCurrentScore] = useState(0);
    const { skills } = useSkills(); // skills 배열을 React Context에서 가져옴
    console.log('GameCanvas: skills from context:', skills); // skills 배열 확인

    useEffect(() => {
        const isClient = typeof window !== 'undefined';

        if (isClient && gameContainerRef.current && !gameRef.current) {
            console.log('Initializing Phaser game on client...');
            const { width, height, minWidthApplied } = getGameDimensions();
            
            const initialDataForScene: {
                minWidthApplied: boolean;
                openShopModal: (score: number, skills: number[], closeShop: () => void) => void; // closeShop 추가
            } = {
                minWidthApplied: minWidthApplied,
                openShopModal: (score: number, skills: number[], closeShop: () => void) => { // closeShop 받음
                    console.log("React: openShopModal callback called from Phaser. Score:", score);
                    setShowShopModal(true);
                    setCurrentScore(score);
                    if (gameRef.current) {
                        gameRef.current.scene.pause('MainScene');
                    }
                },
            };

            // const sceneConfigWithData: MySceneConfig = { 
            //     ...(baseConfig.scene as MySceneConfig), // baseConfig.scene을 MySceneConfig로 캐스팅하고 복사
            //     data: initialDataForScene // data 속성 추가
            // };

            const currentConfig: Phaser.Types.Core.GameConfig = { 
                ...baseConfig,
                width: width,
                height: height,
                // scene: sceneConfigWithData, // 수정된 scene 객체를 할당
            };
            
            currentConfig.parent = gameContainerRef.current.id;
            const newGame = new Phaser.Game(currentConfig);
            gameRef.current = newGame;

            newGame.events.on(Phaser.Core.Events.READY, () => {
                console.log("Phaser Game is READY. Attempting to get scene 'MainScene' and set data.");
                const gameScene = newGame.scene.getScene('MainScene'); // 씬 키로 씬 가져오기
                gameSceneRef.current = gameScene; // gameScene ref에 저장

                if (gameScene) {
                    console.log("Successfully retrieved 'MainScene'. Setting data directly on scene.data.");
                    // minWidthApplied와 openShopModal 콜백을 씬의 data manager에 직접 설정
                    gameScene.data.set('minWidthApplied', initialDataForScene.minWidthApplied);
                    gameScene.data.set('openShopModal', initialDataForScene.openShopModal);
                    gameScene.data.set('skills', skills); // 초기 skills 값 저장 (React 컴포넌트의 skills)
                    console.log("Scene data for shop modal set successfully.");
                } else {
                    console.error("CRITICAL ERROR: 'MainScene' not found after game ready event. Shop modal will not function.");
                }
            });


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
    }, []); // 의존성 배열에 아무것도 없으므로 컴포넌트 마운트 시 한 번만 실행됩니다.

    useEffect(() => {
        if (gameSceneRef.current) {
            gameSceneRef.current.data.set('skills', skills);
            console.log('Phaser scene skills updated:', skills);
        }
    }, [skills]);

    const closeShopModal = () => {
        setShowShopModal(false);
        if (gameRef.current) {
            gameRef.current.scene.resume('MainScene'); // 씬 키 'MainScene' 사용
        }
    };

    return (
        <div id="game-container" ref={gameContainerRef} style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <ShopModal isVisible={showShopModal} onClose={closeShopModal} score={currentScore} />
        </div>
    );
};

export default GameCanvas;