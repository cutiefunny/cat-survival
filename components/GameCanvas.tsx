'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import ShopModal from './shopModal';
import { SkillsProvider, useSkills } from './SkillsContext';
import levelExperience from '../public/levelSetting.json';
import GameOverModal from './GameOverModal';

// --- [최적화] 거리 계산 비용 절감을 위한 제곱 상수 정의 ---
const FLEE_RADIUS = 200;
const FLEE_RADIUS_SQ = FLEE_RADIUS * FLEE_RADIUS;
const GATHERING_RADIUS = 700;
const GATHERING_RADIUS_SQ = GATHERING_RADIUS * GATHERING_RADIUS;
const CHUNK_CLEANUP_THRESHOLD = 3; // 화면 밖 몇 개 청크부터 삭제할지

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

const baseConfig: Omit<Phaser.Types.Core.GameConfig, 'width' | 'height'> = {
    type: Phaser.AUTO,
    roundPixels: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    scene: {
        key: 'MainScene',
        preload: preload,
        create: create,
        update: update
    },
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.RESIZE,
    }
};

//#region 상수 정의
let gameOver = false;
let elapsedTime = 0;

let initialPinchDistance = 0;
let lastCameraZoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

const PLAYER_PUSH_BACK_FORCE = 300;
const KNOCKBACK_DURATION_MS = 250;

let INITIAL_PLAYER_ENERGY = 3;

const BASE_PLAYER_SPEED = 200;
const DOG_CHASE_SPEED = BASE_PLAYER_SPEED * 0.3;

const MOUSE_SPAWN_INTERVAL_MS = 1000;
const MAX_ACTIVE_MICE = 30;

const DOG_SPAWN_INTERVAL_MS = 2000;
const MAX_ACTIVE_DOGS = 20;

const FISH_SPAWN_INTERVAL_MS = 5000;
const FISH_SPAWN_PROBABILITY = 0.3;
const MAX_ACTIVE_FISH = 2;

const BUTTERFLY_SPAWN_INTERVAL_MS = 1000;
const BUTTERFLY_SPAWN_PROBABILITY = 0.1;
const MAX_ACTIVE_BUTTERFLIES = 1;
const BUTTERFLY_REPEL_DISTANCE = 150;
const BUTTERFLY_REPEL_FORCE = 100;

const PLAYER_INVINCIBILITY_DURATION_MS = 500;

const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;

const SHOCKWAVE_SKILL_ID = 51;
const SHOCKWAVE_INTERVAL_MS = 10000;
const SHOCKWAVE_RADIUS_START = 20;
const SHOCKWAVE_RADIUS_END = 300;
const SHOCKWAVE_DURATION_MS = 500;
const SHOCKWAVE_PUSH_FORCE = 500;
const SHOCKWAVE_COLOR = 0xADD8E6;
const SHOCKWAVE_LINE_WIDTH = 10;
const SHOCKWAVE_TRIGGER_DISTANCE = 50;

// 무한 맵 관련 상수
const WORLD_BOUNDS_SIZE = 100000;
const TILE_SIZE = 32;
const CHUNK_DIMENSIONS = 20;
const CHUNK_SIZE_PX = CHUNK_DIMENSIONS * TILE_SIZE;
const GENERATION_BUFFER_CHUNKS = 2;

const TILE_COLORS: number[] = [];
for (let i = 0; i < 10; i++) {
    const hue = Phaser.Math.FloatBetween(0.25, 0.40);
    const saturation = Phaser.Math.FloatBetween(0.1, 0.3);
    const lightness = Phaser.Math.FloatBetween(0.3, 0.4);
    TILE_COLORS.push(Phaser.Display.Color.HSLToColor(hue, saturation, lightness).color);
}
//#endregion

function preload(this: Phaser.Scene) {
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
    this.load.image('cat_punch', '/images/cat_punch.png');
    this.load.image('cat_hit', '/images/cat_hit.png');
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet('fish_item_sprite', '/images/fish_sprite_2frame.png', { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet('butterfly_sprite_3frame', '/images/butterfly_sprite_3frame.png', { frameWidth: 100, frameHeight: 83 });
    this.load.image('cat_cry', '/images/cat_cry.png');
    this.load.image('cat_haak', '/images/cat_haak.png');
}

function create(this: Phaser.Scene) {
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    this.cameras.main.setBackgroundColor('#ffffff');
    this.physics.world.setBounds(0, 0, WORLD_BOUNDS_SIZE, WORLD_BOUNDS_SIZE);

    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    this.data.set('isMobile', isMobile);
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;

    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    player.setDrag(500);
    player.setDepth(1);

    player.setData('level', 1);
    player.setData('experience', 0);

    const playerLevelText = this.add.text(0, 0, 'Level: 1', {
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 2, fill: true }
    });
    playerLevelText.setOrigin(0.5);
    playerLevelText.setDepth(2);

    const shockwaveCooldownText = this.add.text(player.x, player.y, '', {
        fontSize: '18px', color: '#FFFF00', stroke: '#000000', strokeThickness: 4, align: 'center', fontStyle: 'bold'
    });
    shockwaveCooldownText.setOrigin(0.5, 1.5);
    shockwaveCooldownText.setDepth(player.depth + 1);
    shockwaveCooldownText.setVisible(false);
    this.data.set('shockwaveCooldownText', shockwaveCooldownText);

    const expBarWidth = ENERGY_BAR_WIDTH;
    const expBarHeight = ENERGY_BAR_HEIGHT;
    const expBarBg = this.add.graphics();
    expBarBg.fillStyle(0x666666, 0.8);
    expBarBg.fillRect(0, 0, expBarWidth, expBarHeight);
    expBarBg.setDepth(2);

    const expBarFill = this.add.graphics();
    expBarFill.fillStyle(0xffd700, 1);
    expBarFill.fillRect(0, 0, 0, expBarHeight);
    expBarFill.setDepth(2);

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

    this.anims.create({
        key: 'fish_swim',
        frames: this.anims.generateFrameNumbers('fish_item_sprite', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1
    });

    this.anims.create({
        key: 'butterfly_fly',
        frames: this.anims.generateFrameNumbers('butterfly_sprite_3frame', { start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1
    });

    const mice = this.physics.add.group();
    const dogs = this.physics.add.group();
    const fishItems = this.physics.add.group();
    const butterflies = this.physics.add.group();

    this.time.addEvent({ delay: MOUSE_SPAWN_INTERVAL_MS, callback: spawnMouseVillain, callbackScope: this, loop: true });
    this.time.addEvent({ delay: DOG_SPAWN_INTERVAL_MS, callback: spawnDogVillain, callbackScope: this, loop: true });
    this.time.addEvent({ delay: FISH_SPAWN_INTERVAL_MS, callback: spawnFishItem, callbackScope: this, loop: true });
    this.time.addEvent({ delay: BUTTERFLY_SPAWN_INTERVAL_MS, callback: spawnButterflyVillain, callbackScope: this, loop: true });

    const cursors = this.input.keyboard?.createCursorKeys();
    this.data.set('spaceKey', this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE));
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(1);
    this.input.addPointer(2);

    this.physics.add.collider(player, mice, hitMouse as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(player, dogs, hitDog as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(player, fishItems, collectFish as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(player, butterflies, collectButterfly as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    this.physics.add.collider(mice, mice);
    this.physics.add.collider(dogs, dogs);
    this.physics.add.collider(mice, dogs);

    let playerLevel = 1;

    const scoreText = this.add.text(0, 0, 'Score: 0', {
        fontSize: '24px', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 2, fill: true }
    });
    scoreText.setOrigin(0.5);
    scoreText.setDepth(2);

    const timerText = this.add.text(0, 0, 'Time: 0s', { fontSize: '16px', color: '#000000' });
    timerText.setOrigin(0.5);
    timerText.setVisible(false);
    timerText.setDepth(2);

    const energyBarBg = this.add.graphics();
    energyBarBg.fillStyle(ENERGY_BAR_COLOR_BG, 0.8);
    energyBarBg.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarBg.setDepth(2);

    const energyBarFill = this.add.graphics();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarFill.setDepth(2);

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

    const gameOverText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, 'Game Over', {
        fontSize: '64px', color: '#ff0000', stroke: '#000000', strokeThickness: 8,
        shadow: { offsetX: 5, offsetY: 5, color: '#000', blur: 5, fill: true }
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setScrollFactor(0);
    gameOverText.setVisible(false);
    gameOverText.setDepth(3);

    const restartButton = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY + 100, 'Try again', {
        fontSize: '32px', color: '#ffffff', backgroundColor: '#000000', padding: { x: 20, y: 10 },
        stroke: '#ffffff', strokeThickness: 4,
        shadow: { offsetX: 2, offsetY: 2, color: '#cccccc', blur: 3, fill: true },
    });
    restartButton.setOrigin(0.5);
    restartButton.setScrollFactor(0);
    restartButton.setInteractive();
    restartButton.setVisible(false);
    restartButton.on('pointerdown', () => restartGame.call(this));
    restartButton.setDepth(3);

    this.data.set('player', player);
    this.data.set('mice', mice);
    this.data.set('dogs', dogs);
    this.data.set('fishItems', fishItems);
    this.data.set('butterflies', butterflies);
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('playerLevel', playerLevel);
    this.data.set('playerLevelText', playerLevelText);
    this.data.set('playerLevelValue', 1);
    this.data.set('scoreText', scoreText);
    this.data.set('timerText', timerText);
    this.data.set('gameOverText', gameOverText);
    this.data.set('restartButton', restartButton);

    this.data.set('skills', []);
    this.data.set('isKnockedBack', false);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('energyBarBg', energyBarBg);
    this.data.set('energyBarFill', energyBarFill);
    this.data.set('expBarBg', expBarBg);
    this.data.set('expBarFill', expBarFill);
    this.data.set('shopOpened', false);
    this.data.set('skills', []);
    this.data.set('isInvincible', false);
    this.data.set('shockwaveArmed', false);
    this.data.set('wasTwoFingerDown', false);
    this.data.set('isHaak', false);
    this.data.set('shockwaveCooldown', false);

    // --- [최적화] 청크 관리 그룹 및 Set 초기화 ---
    this.data.set('generatedChunks', new Set<string>());
    const chunkGroup = this.add.group(); // 청크 렌더 텍스처들을 담을 그룹
    this.data.set('chunkGroup', chunkGroup);
    
    generateSurroundingChunks.call(this, player.x, player.y);

    this.cameras.main.startFollow(player, true, 0.05, 0.05);

    this.scale.on('resize', (gameSize: Phaser.Structs.Size, baseSize: Phaser.Structs.Size, displaySize: Phaser.Structs.Size, previousWidth: number, previousHeight: number) => {
        const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
        if (gameOverText) gameOverText.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
        const restartButton = this.data.get('restartButton') as Phaser.GameObjects.Text;
        if (restartButton) restartButton.setPosition(this.cameras.main.centerX, this.cameras.main.centerY + 100);
    });
}

/**
 * [최적화] 400개의 사각형 오브젝트 대신 1개의 RenderTexture를 사용합니다.
 * Draw Call이 1회로 줄어들어 성능이 비약적으로 상승합니다.
 */
function generateTileChunk(this: Phaser.Scene, chunkX: number, chunkY: number) {
    const generatedChunks = this.data.get('generatedChunks') as Set<string>;
    const chunkKey = `${chunkX}_${chunkY}`;

    if (generatedChunks.has(chunkKey)) {
        return;
    }
    generatedChunks.add(chunkKey);

    const startWorldX = chunkX * CHUNK_SIZE_PX;
    const startWorldY = chunkY * CHUNK_SIZE_PX;

    // RenderTexture 생성 (단일 텍스처)
    const rt = this.add.renderTexture(
        startWorldX, 
        startWorldY, 
        CHUNK_SIZE_PX + 2, // 너비 + 2
        CHUNK_SIZE_PX + 2  // 높이 + 2
    );
    rt.setOrigin(0, 0);
    rt.setDepth(0); // 배경이므로 가장 아래

    // RenderTexture에 타일 그리기 (fill 사용)
    for (let x = 0; x < CHUNK_DIMENSIONS; x++) {
        for (let y = 0; y < CHUNK_DIMENSIONS; y++) {
            const colorIndex = Phaser.Math.Between(0, TILE_COLORS.length - 1);
            const color = TILE_COLORS[colorIndex];
            
            // [수정] TILE_SIZE 대신 TILE_SIZE + 1을 사용하여 
            // 타일끼리 1픽셀씩 겹치게 그립니다. (빈틈 제거)
            rt.fill(
                color, 
                1, 
                x * TILE_SIZE, 
                y * TILE_SIZE, 
                TILE_SIZE + 1, // 너비 + 1
                TILE_SIZE + 1  // 높이 + 1
            );
        }
    }

    // 청크 그룹에 추가하여 관리
    const chunkGroup = this.data.get('chunkGroup') as Phaser.GameObjects.Group;
    if (chunkGroup) {
        chunkGroup.add(rt);
        rt.setData('chunkKey', chunkKey); // 삭제 시 Set 업데이트를 위해 키 저장
    }
}

/**
 * [최적화] 화면에서 멀어진 청크를 제거하여 메모리 누수를 방지합니다.
 */
function cleanupFarChunks(this: Phaser.Scene, playerX: number, playerY: number) {
    const chunkGroup = this.data.get('chunkGroup') as Phaser.GameObjects.Group;
    const generatedChunks = this.data.get('generatedChunks') as Set<string>;
    
    // 청크 크기 * (버퍼 + 1) 거리보다 멀어지면 삭제
    const cleanupDistance = CHUNK_SIZE_PX * (GENERATION_BUFFER_CHUNKS + 2); 

    if (chunkGroup) {
        chunkGroup.getChildren().forEach((child: any) => {
            // RenderTexture의 중심점 대략 계산 (width/2) 혹은 그냥 원점 기준
            const distance = Phaser.Math.Distance.Between(playerX, playerY, child.x + CHUNK_SIZE_PX/2, child.y + CHUNK_SIZE_PX/2);
            
            if (distance > cleanupDistance) {
                const key = child.getData('chunkKey');
                if (key) {
                    generatedChunks.delete(key);
                }
                chunkGroup.killAndHide(child); // 그룹에서 비활성화
                child.destroy(); // 메모리에서 완전 제거
            }
        });
    }
}

function generateSurroundingChunks(this: Phaser.Scene, worldX: number, worldY: number) {
    const currentChunkX = Math.floor(worldX / CHUNK_SIZE_PX);
    const currentChunkY = Math.floor(worldY / CHUNK_SIZE_PX);

    for (let i = currentChunkX - GENERATION_BUFFER_CHUNKS; i <= currentChunkX + GENERATION_BUFFER_CHUNKS; i++) {
        for (let j = currentChunkY - GENERATION_BUFFER_CHUNKS; j <= currentChunkY + GENERATION_BUFFER_CHUNKS; j++) {
            generateTileChunk.call(this, i, j);
        }
    }
    
    // [최적화] 청크 정리 함수 호출
    cleanupFarChunks.call(this, worldX, worldY);
}

interface CustomDogSprite extends Phaser.Physics.Arcade.Sprite {
    isKnockedBack?: boolean;
    isStunned?: boolean;
}

function spawnMouseVillain(this: Phaser.Scene) {
    if (gameOver) return;

    let playerLevel = this.data.get('playerLevel') as number;
    const maxActiveMice = MAX_ACTIVE_MICE + (playerLevel * 2);

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeMice = mice.countActive(true);

    if (activeMice >= maxActiveMice) {
        return;
    }

    spawnMouse.call(this, mice, player);
}

function spawnDogVillain(this: Phaser.Scene) {
    if (gameOver) return;

    let playerLevel = this.data.get('playerLevel') as number;
    const maxActiveDogs = MAX_ACTIVE_DOGS + playerLevel;

    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeDogs = dogs.countActive(true);

    if (activeDogs >= maxActiveDogs) {
        return;
    }

    spawnDog.call(this, dogs, player);
}

function spawnFishItem(this: Phaser.Scene) {
    if (gameOver) return;

    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    const activeFish = fishItems.countActive(true);

    if (activeFish >= MAX_ACTIVE_FISH) {
        return;
    }

    if (Math.random() < FISH_SPAWN_PROBABILITY) {
        const camera = this.cameras.main;
        const x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right);
        const y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom);

        // [최적화] create 대신 get 사용 (오브젝트 풀링)
        const fish = fishItems.get(x, y, 'fish_item_sprite') as Phaser.Physics.Arcade.Sprite;
        if (!fish) return;

        fish.setActive(true).setVisible(true); // 활성화
        fish.enableBody(true, x, y, true, true); // 바디 활성화

        fish.setCollideWorldBounds(false);
        fish.setImmovable(true);
        fish.setScale(0.4);
        fish.play('fish_swim');
        fish.setDepth(1);
    }
}

function spawnButterflyVillain(this: Phaser.Scene) {
    if (gameOver) return;
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;
    if (butterflies.countActive(true) >= MAX_ACTIVE_BUTTERFLIES) {
        return;
    }
    if (Math.random() < BUTTERFLY_SPAWN_PROBABILITY) {
        spawnButterfly.call(this, butterflies);
    }
}

function spawnButterfly(this: Phaser.Scene, butterflies: Phaser.Physics.Arcade.Group) {
    const camera = this.cameras.main;
    const x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right);
    const y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom);

    // [최적화] create 대신 get 사용
    const butterfly = butterflies.get(x, y, 'butterfly_sprite_3frame') as Phaser.Physics.Arcade.Sprite;
    if(!butterfly) return;

    butterfly.setActive(true).setVisible(true);
    butterfly.enableBody(true, x, y, true, true);

    butterfly.setCollideWorldBounds(true);
    butterfly.setBounce(1);
    butterfly.setScale(0.5);
    butterfly.play('butterfly_fly', true);
    butterfly.setDepth(1);

    const angle = Phaser.Math.Between(0, 360);
    const speed = Phaser.Math.Between(50, 150);
    const butterflyBody = butterfly.body as Phaser.Physics.Arcade.Body;
    this.physics.velocityFromAngle(angle, speed, butterflyBody.velocity);

    butterfly.setData('moveTimer', 0);
    butterfly.setData('nextMoveTime', Phaser.Math.Between(200, 800));
}

function spawnMouse(this: Phaser.Scene, mice: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const camera = this.cameras.main;
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const buffer = 50;

    switch (edge) {
        case 0: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.top - buffer; break;
        case 1: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.bottom + buffer; break;
        case 2: x = camera.worldView.left - buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break;
        case 3: x = camera.worldView.right + buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break;
        default: x = 0; y = 0; break;
    }

    // [최적화] get 사용 및 상태 리셋
    const mouse = mice.get(x, y, 'mouse_enemy_sprite') as Phaser.Physics.Arcade.Sprite;
    if (!mouse) return;

    mouse.setActive(true).setVisible(true);
    mouse.enableBody(true, x, y, true, true);

    mouse.setBounce(0.2);
    mouse.setCollideWorldBounds(true);
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    mouse.setScale((32 / 100) * spriteScaleFactor);
    mouse.play('mouse_walk');
    mouse.setDepth(1);
    this.physics.moveToObject(mouse, player, 50);
}

function spawnDog(this: Phaser.Scene, dogs: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const camera = this.cameras.main;
    let x: number, y: number;
    let attempts = 0;
    const maxAttempts = 10;
    const separationDistance = 120;

    do {
        const edge = Phaser.Math.Between(0, 3);
        const buffer = 100;
        switch (edge) {
            case 0: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.top - buffer; break;
            case 1: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.bottom + buffer; break;
            case 2: x = camera.worldView.left - buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break;
            case 3: x = camera.worldView.right + buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break;
            default: x = 0; y = 0; break;
        }
        attempts++;
        if (attempts > maxAttempts) break;

    } while (isDogOverlapping(this, x, y, separationDistance));

    // [최적화] get 사용
    const dog = dogs.get(x, y, 'dog_enemy_sprite') as CustomDogSprite;
    if (!dog) return;

    dog.setActive(true).setVisible(true);
    dog.enableBody(true, x, y, true, true);

    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false);
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    dog.setScale(0.5 * spriteScaleFactor);
    dog.play('dog_walk');
    dog.isKnockedBack = false;
    dog.isStunned = false;
    
    // AI 상태도 초기화
    dog.setData('aiState', 0);
    dog.setData('strategicTimer', 0);
    
    dog.setDepth(1);
}

function isDogOverlapping(scene: Phaser.Scene, x: number, y: number, separationDistance: number): boolean {
    const dogs = scene.data.get('dogs') as Phaser.Physics.Arcade.Group;
    let overlapping = false;

    dogs.getChildren().forEach((existingDogObject) => {
        const existingDog = existingDogObject as Phaser.Physics.Arcade.Sprite;
        if (existingDog.active) {
            const distance = Phaser.Math.Distance.Between(x, y, existingDog.x, existingDog.y);
            if (distance < separationDistance) {
                overlapping = true;
            }
        }
    });

    return overlapping;
}

function hitMouse(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, mouse: Phaser.Physics.Arcade.Sprite) {
    if (gameOver) return;

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    
    // [최적화] killAndHide 사용
    mice.killAndHide(mouse);
    if(mouse.body) mouse.body.enable = false;

    let score = this.data.get('score');
    score += 10;
    this.data.set('score', score);
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text;
    scoreText.setText('Score: ' + score);

    let experience = player.getData('experience') as number;
    experience += 10;
    player.setData('experience', experience);
    checkLevelUp.call(this, player);
}

function checkLevelUp(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite) {
    const currentLevel = player.getData('level') as number;
    const currentExperience = player.getData('experience') as number;
    const levelThresholds: { [key: string]: number } = levelExperience.levelExperience;
    const levelKeys = Object.keys(levelThresholds).map(Number).sort((a, b) => a - b);
    let newLevel = currentLevel;

    for (const level of levelKeys) {
        if (currentExperience >= levelThresholds[String(level)]) {
            newLevel = Math.max(newLevel, level);
        }
    }

    if (newLevel > currentLevel) {
        player.setData('level', newLevel);
        const playerLevelText = this.data.get('playerLevelText') as Phaser.GameObjects.Text;
        playerLevelText.setText('Level: ' + newLevel);
        this.data.set('playerLevelValue', newLevel);
        const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
        expBarFill.clear();
        expBarFill.fillStyle(0xffd700, 1);
        expBarFill.fillRect(0, 0, 0, 10);

        const shopOpened = this.data.get('shopOpened') as boolean;
        const openShopModal = this.data.get('openShopModal') as (level: number, score: number, skills: number[]) => void;
        if (!shopOpened && openShopModal) {
            this.data.set('shopOpened', true);
            openShopModal(newLevel, this.data.get('score') as number, this.data.get('skills') as number[]);
        }

        player.setData('experience', 0);
    }
}

function hitDog(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, dogObject: Phaser.Physics.Arcade.Sprite) {
    if (gameOver) return;
    if (player.getData('isInvincible')) return;

    const dog = dogObject as CustomDogSprite;
    const dotProduct = (dog.x - player.x) * (player.flipX ? -1 : 1);
    
    let skills = this.data.get('skills') as number[];
    const isMovingForAnimation = this.data.get('isMovingForAnimation') as boolean;
    
    if (skills.some(skill => skill >= 11 && skill <= 19) && dotProduct < 0 && isMovingForAnimation) {
        let skillLevel = skills.filter(skill => skill >= 11 && skill <= 19).sort((a, b) => b - a)[0];
        skillLevel = skillLevel - 10;
        
        if (player.body && dog.body) {
            const direction = new Phaser.Math.Vector2(dog.x - player.x, dog.y - player.y).normalize();
            dog.setVelocity(direction.x * PLAYER_PUSH_BACK_FORCE, direction.y * PLAYER_PUSH_BACK_FORCE);

            dog.isKnockedBack = true;
            dog.stop();
            dog.body.checkCollision.none = true;
            this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
                dog.isKnockedBack = false;
                dog.play('dog_walk', true);
                if (dog.body) {
                    dog.body.checkCollision.none = false;
                }
                if (skillLevel >= 2) {
                    dog.isStunned = true;
                    dog.setTint(0x0000ff);
                    dog.setVelocity(0, 0);
                    this.time.delayedCall(skillLevel * 1000, () => {
                        dog.isStunned = false;
                        dog.clearTint();
                    }, [], this);
                }
            }, [], this);

            player.setTexture('cat_punch');
            this.time.delayedCall(300, () => {
                player.setTexture('player_sprite');
                player.play('cat_walk', true);
            }, [], this);
        }
    } else {
        if (player.body && dog.body) {
            const direction = new Phaser.Math.Vector2(player.x - dog.x, player.y - dog.y).normalize();
            player.setVelocity(direction.x * PLAYER_PUSH_BACK_FORCE, direction.y * PLAYER_PUSH_BACK_FORCE);

            this.data.set('isKnockedBack', true);
            this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
                this.data.set('isKnockedBack', false);
                player.setTexture('player_sprite');
                player.play('cat_walk', true);
            }, [], this);
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
            endGame.call(this);
        }

        player.setData('isInvincible', true);

        this.time.delayedCall(PLAYER_INVINCIBILITY_DURATION_MS, () => {
            player.setData('isInvincible', false);
            const currentTween = player.getData('invincibilityTween');
            if (currentTween) {
                currentTween.stop();
            }
            player.setAlpha(1);
        }, [], this);
    }
}

function triggerShockwave(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite) {
    if (!player || !player.active) return;

    player.setTexture('cat_haak');
    this.data.set('isHaak', true);
    this.time.delayedCall(500, () => {
        this.data.set('isHaak', false);
        player.setTexture('player_sprite');
        player.play('cat_walk', true);
    }, [], this);

    const shockwaveCircle = this.add.circle(player.x, player.y, SHOCKWAVE_RADIUS_START, SHOCKWAVE_COLOR, 0.7);
    shockwaveCircle.setStrokeStyle(SHOCKWAVE_LINE_WIDTH, SHOCKWAVE_COLOR, 0.9);
    shockwaveCircle.setDepth(player.depth - 1);

    this.tweens.add({
        targets: shockwaveCircle,
        radius: SHOCKWAVE_RADIUS_END,
        alpha: { from: 0.7, to: 0 },
        lineWidth: { from: SHOCKWAVE_LINE_WIDTH, to: 0 },
        duration: SHOCKWAVE_DURATION_MS,
        ease: 'Quad.easeOut',
        onComplete: () => {
            shockwaveCircle.destroy();
        }
    });

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    
    const enemiesToCheck: Phaser.Physics.Arcade.Sprite[] = [];
    if (mice) enemiesToCheck.push(...mice.getChildren() as Phaser.Physics.Arcade.Sprite[]);
    if (dogs) enemiesToCheck.push(...dogs.getChildren() as Phaser.Physics.Arcade.Sprite[]);

    enemiesToCheck.forEach((enemySprite) => {
        if (enemySprite.active && enemySprite.body) {
            const dx = enemySprite.x - player.x;
            const dy = enemySprite.y - player.y;

            if (dx === 0 && dy === 0) {
                enemySprite.body.velocity.setTo(0, -SHOCKWAVE_PUSH_FORCE);
            } else {
                const directionVector = new Phaser.Math.Vector2(dx, dy).normalize();
                enemySprite.body.velocity.setTo(0, 0);
                enemySprite.body.velocity.x = directionVector.x * SHOCKWAVE_PUSH_FORCE;
                enemySprite.body.velocity.y = directionVector.y * SHOCKWAVE_PUSH_FORCE;
            }

            const enemyCustom = enemySprite as CustomDogSprite;
            if (typeof enemyCustom.isKnockedBack !== 'undefined') {
                enemyCustom.isKnockedBack = true;
                this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
                    if (enemyCustom.active) {
                        enemyCustom.isKnockedBack = false;
                    }
                });
            }
        }
    });
}

function collectFish(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, fish: Phaser.Physics.Arcade.Sprite) {
    if (gameOver) return;

    // [최적화] killAndHide
    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    fishItems.killAndHide(fish);
    if(fish.body) fish.body.enable = false;

    let energy = this.data.get('energy');
    if (energy < INITIAL_PLAYER_ENERGY) {
        energy++;
        this.data.set('energy', energy);

        const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
        const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

        energyBarFill.clear();
        energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
        energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);
    }
}

function collectButterfly(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, butterfly: Phaser.Physics.Arcade.Sprite) {
    if (gameOver) return;

    // [최적화] killAndHide
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;
    butterflies.killAndHide(butterfly);
    if(butterfly.body) butterfly.body.enable = false;

    let energy = INITIAL_PLAYER_ENERGY;
    this.data.set('energy', energy);

    const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
    const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

    energyBarFill.clear();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);
}

function endGame(this: Phaser.Scene) {
    if (gameOver) return;
    gameOver = true;
    this.physics.pause();
    this.time.removeAllEvents();

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const score = this.data.get('score') as number;
    const triggerGameOverModal = this.data.get('triggerGameOverModal') as (score: number) => void;

    if (player) {
        player.stop();
        player.setTexture('cat_hit');
    }

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;

    if (mice) mice.getChildren().forEach((mouse) => (mouse.body as any)?.stop());
    if (dogs) dogs.getChildren().forEach((dog) => (dog.body as any)?.stop());
    if (fishItems) fishItems.getChildren().forEach((fish) => (fish.body as any)?.stop());
    if (butterflies) butterflies.getChildren().forEach((butterfly) => (butterfly.body as any)?.stop());

    if (triggerGameOverModal) {
        triggerGameOverModal(score);
    }
}

function restartGame(this: Phaser.Scene) {
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    this.data.set('score', 0);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('isKnockedBack', false);
    this.data.set('shopOpened', false);
    this.data.set('skills', []);
    this.data.get('generatedChunks').clear();
    
    // [최적화] 청크 그룹 정리
    const chunkGroup = this.data.get('chunkGroup') as Phaser.GameObjects.Group;
    if(chunkGroup) chunkGroup.clear(true, true);

    this.data.set('shockwaveArmed', false);
    this.data.set('shockwaveCooldown', false);

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    if (player) {
        player.setData('level', 1);
        player.setData('experience', 0);
    }
    this.data.set('playerLevelValue', 1);
    const playerLevelText = this.data.get('playerLevelText') as Phaser.GameObjects.Text;
    if (playerLevelText) {
        playerLevelText.setText('Level: 1');
    }

    const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
    if (expBarFill) {
        expBarFill.clear();
        expBarFill.fillStyle(0xffd700, 1);
        expBarFill.fillRect(0, 0, 0, 10);
    }

    const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
    const restartButton = this.data.get('restartButton') as Phaser.GameObjects.Text;
    if (gameOverText) gameOverText.setVisible(false);
    if (restartButton) restartButton.setVisible(false);

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;

    if (mice) mice.clear(true, true);
    if (dogs) dogs.clear(true, true);
    if (fishItems) fishItems.clear(true, true);
    if (butterflies) butterflies.clear(true, true);

    this.scene.restart();
}

function update(this: Phaser.Scene, time: number, delta: number) {
    if (gameOver) {
        return;
    }

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const cursors = this.data.get('cursors') as Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    const isKnockedBack = this.data.get('isKnockedBack') as boolean;
    const isInvincible = player.getData('isInvincible') as boolean;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const skills = this.data.get('skills') as number[];
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;
    let playerLevel = this.data.get('playerLevel') as number;
    const experience = player.getData('experience') as number;
    const levelThresholds: { [key: string]: number } = levelExperience.levelExperience;
    const nextLevelThreshold = levelThresholds[String(playerLevel + 1)] || Infinity;
    const shockwaveCooldownText = this.data.get('shockwaveCooldownText') as Phaser.GameObjects.Text;
    const shockwavePhaserEvent = this.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;
    let isShockwaveArmed = this.data.get('shockwaveArmed') as boolean;

    if (!player || !cursors) {
        return;
    }

    let currentPlayerSpeed = BASE_PLAYER_SPEED;
    if (skills.some(skill => skill >= 21 && skill <= 29)) {
        let skillLevel = skills.filter(skill => skill >= 21 && skill <= 29).sort((a, b) => b - a)[0];
        skillLevel = skillLevel - 20;
        let speedIncreaseFactor = 1 + (skillLevel * 0.1);
        currentPlayerSpeed = BASE_PLAYER_SPEED * speedIncreaseFactor;
    }

    const playerSpeed = currentPlayerSpeed;
    let isMovingForAnimation = false;

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
            this.data.set('isMovingForAnimation', false);
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
                this.data.set('isMovingForAnimation', false);
            } else {
                isMovingForAnimation = true;
                this.data.set('isMovingForAnimation', true);
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
            this.data.set('isMovingForAnimation', true);
        }
        else {
            if (player.body && Math.abs(player.body.velocity.x) < 10 && Math.abs(player.body.velocity.y) < 10) {
                player.setVelocity(0);
                isMovingForAnimation = false;
                this.data.set('isMovingForAnimation', false);
            } else {
                isMovingForAnimation = true;
                this.data.set('isMovingForAnimation', true);
            }
        }
    } else {
        if (player.body && (Math.abs(player.body.velocity.x) > 10 || Math.abs(player.body.velocity.y) > 10)) {
            isMovingForAnimation = true;
            this.data.set('isMovingForAnimation', true);
        } else {
            isMovingForAnimation = false;
            this.data.set('isMovingForAnimation', false);
        }
    }

    if (isInvincible) {
        player.setTexture('cat_hit');
    }

    if (this.data.get('isHaak')) {
        player.setTexture('cat_haak');
    }

    if (isMovingForAnimation) {
        player.play('cat_walk', true);
    } else {
        player.stop();
        player.setFrame(0);
    }

    const playerLevelText = this.data.get('playerLevelText') as Phaser.GameObjects.Text;
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text;
    const timerText = this.data.get('timerText') as Phaser.GameObjects.Text;
    const energyBarBg = this.data.get('energyBarBg') as Phaser.GameObjects.Graphics;
    const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
    const playerLevelValue = this.data.get('playerLevelValue') as number;
    const expBarBg = this.data.get('expBarBg') as Phaser.GameObjects.Graphics;
    const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
    const expBarWidth = ENERGY_BAR_WIDTH;
    const expBarHeight = ENERGY_BAR_HEIGHT;

    const playerBottomY = player.y + (player.displayHeight / 2) + 5;

    scoreText.setScrollFactor(0);
    playerLevelText.setScrollFactor(0);
    timerText.setScrollFactor(0);

    scoreText.setPosition(this.cameras.main.width / 2, 20);
    playerLevelText.setPosition(this.cameras.main.width / 2, 50);
    playerLevelText.setText('Level: ' + playerLevelValue);
    timerText.setPosition(this.cameras.main.width / 2, 80);

    energyBarBg.x = player.x - (ENERGY_BAR_WIDTH / 2);
    energyBarBg.y = playerBottomY;
    energyBarFill.x = energyBarBg.x;
    energyBarFill.y = energyBarBg.y;

    expBarBg.x = player.x - (expBarWidth / 2);
    expBarBg.y = energyBarBg.y + expBarHeight + 5;
    expBarFill.x = expBarBg.x;
    expBarFill.y = expBarBg.y;

    const fillRatio = Math.min(1, experience / nextLevelThreshold);
    const fillWidth = fillRatio * expBarWidth;

    expBarFill.clear();
    expBarFill.fillStyle(0xffd700, 1);
    expBarFill.fillRect(0, 0, fillWidth, expBarHeight);

    if (player && shockwaveCooldownText) {
        const hasShockwaveSkill = skills.includes(SHOCKWAVE_SKILL_ID);

        if (hasShockwaveSkill) {
            shockwaveCooldownText.setPosition(player.x, player.y - (player.displayHeight / 2) * player.scaleY - 10);
            
            if (isShockwaveArmed) {
                shockwaveCooldownText.setText('⚡');
                shockwaveCooldownText.setVisible(true);

                let triggerInputDetected = false;
                const isMobileDevice = this.data.get('isMobile') as boolean;
                const spaceKey = this.data.get('spaceKey') as Phaser.Input.Keyboard.Key;

                if (isMobileDevice) {
                    const pointer1Down = this.input.pointer1.isDown;
                    const pointer2Down = this.input.pointer2.isDown;
                    const isTwoFingerCurrentlyDown = pointer1Down && pointer2Down;
                    const wasTwoFingerDown = this.data.get('wasTwoFingerDown') as boolean;

                    if (isTwoFingerCurrentlyDown && !wasTwoFingerDown) {
                        triggerInputDetected = true;
                    }
                    this.data.set('wasTwoFingerDown', isTwoFingerCurrentlyDown);
                
                } else {
                    if (Phaser.Input.Keyboard.JustDown(spaceKey)) {
                        triggerInputDetected = true;
                    }
                    if (this.input.activePointer.rightButtonDown()) { 
                        triggerInputDetected = true;
                    }
                }

                if (triggerInputDetected) {
                    triggerShockwave.call(this, player); 
                    this.data.set('shockwaveArmed', false); 
                    isShockwaveArmed = false;
                    
                    const shockwavePhaserEvent = this.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;
                    if (shockwavePhaserEvent) {
                        shockwavePhaserEvent.elapsed = 0;
                    }

                    if (isMobileDevice) {
                        this.data.set('wasTwoFingerDown', false);
                    }
                }
            } else if (shockwavePhaserEvent) {
                const remainingCooldownMs = shockwavePhaserEvent.getRemaining();
                if (remainingCooldownMs > 0) {
                    const remainingSeconds = Math.ceil(remainingCooldownMs / 1000);
                    shockwaveCooldownText.setText(`${remainingSeconds}`);
                    shockwaveCooldownText.setVisible(true);
                } else {
                    shockwaveCooldownText.setText('⚡ 준비 중...');
                    shockwaveCooldownText.setVisible(true); 
                }
            } else { 
                shockwaveCooldownText.setVisible(false);
            }
        } else { 
            if (shockwaveCooldownText.visible) shockwaveCooldownText.setVisible(false);
            if (isShockwaveArmed) { 
                this.data.set('shockwaveArmed', false);
            }
        }
    }

    // [최적화] 거리 제곱 비교를 사용한 Update 루프
    mice.getChildren().forEach((mouseObject) => {
        const mouse = mouseObject as Phaser.Physics.Arcade.Sprite;
        if (mouse.active && mouse.body) {
            // Distance Squared 사용
            const distanceToPlayerSq = Phaser.Math.Distance.Squared(player.x, player.y, mouse.x, mouse.y);
            
            const gatheringSpeed = 70;

            if (distanceToPlayerSq < FLEE_RADIUS_SQ) {
                const fleeX = mouse.x - (player.x - mouse.x);
                const fleeY = mouse.y - (player.y - mouse.y);
                this.physics.moveToObject(mouse, { x: fleeX, y: fleeY }, gatheringSpeed);
            } else if (distanceToPlayerSq > GATHERING_RADIUS_SQ) {
                this.physics.moveToObject(mouse, player, gatheringSpeed);
            }

            if (mouse.body.velocity.x < 0) {
                mouse.setFlipX(false);
            } else if (mouse.body.velocity.x > 0) {
                mouse.setFlipX(true);
            }
        }
    });

    dogs.getChildren().forEach((dogObject) => {

        let dogChaseSpeed = DOG_CHASE_SPEED * (1 + (playerLevel - 1) * 0.10);
        const wanderSpeed = dogChaseSpeed * 1.3;

        const dog = dogObject as CustomDogSprite;
        if (dog.active && dog.body && !dog.isKnockedBack && !dog.isStunned) {
            let aiState = dog.getData('aiState') || 0;
            let strategicTimer = dog.getData('strategicTimer') || 0;

            if (aiState === 0 && Math.random() < 0.001) {
                dog.setData('aiState', 1);
                dog.setData('wanderTarget', new Phaser.Math.Vector2(dog.x + Phaser.Math.Between(-200, 200), dog.y + Phaser.Math.Between(-200, 200)));
                dog.setData('strategicTimer', 0);
            }

            if (aiState === 0) {
                this.physics.moveToObject(dog, player, dogChaseSpeed);
            } else if (aiState === 1) {
                const wanderTarget = dog.getData('wanderTarget') as Phaser.Math.Vector2;

                if (Phaser.Math.Distance.Between(dog.x, dog.y, wanderTarget.x, wanderTarget.y) < 20) {
                    dog.setData('aiState', 2);
                    dog.setData('strategicTimer', 0);
                    dog.setVelocity(0);
                    dog.body.checkCollision.none = false;
                } else {
                    this.physics.moveToObject(dog, wanderTarget, wanderSpeed);
                }
            } else if (aiState === 2) {
                strategicTimer += delta;
                dog.setData('strategicTimer', strategicTimer);
                if (strategicTimer > 2000) {
                    dog.setData('aiState', 0);
                } else {
                    return;
                }
            }

            dogs.getChildren().forEach((otherDogObject) => {
                if (dogObject !== otherDogObject) {
                    const otherDog = otherDogObject as CustomDogSprite;
                    if (otherDog.active && otherDog.body && !otherDog.isStunned && !otherDog.isKnockedBack) {
                        const distance = Phaser.Math.Distance.Between(dog.x, dog.y, otherDog.x, otherDog.y);
                        const overlapThreshold = 60;
                        const pushForce = 50;

                        if (distance < overlapThreshold) {
                            const pushDirection = new Phaser.Math.Vector2(dog.x - otherDog.x, dog.y - otherDog.y).normalize();
                            if (dog.body) {
                                dog.setVelocityX(dog.body.velocity.x + pushDirection.x * pushForce);
                                dog.setVelocityY(dog.body.velocity.y + pushDirection.y * pushForce);
                            }
                            if (otherDog.body) {
                                otherDog.setVelocityX(otherDog.body.velocity.x - pushDirection.x * pushForce);
                                otherDog.setVelocityY(otherDog.body.velocity.y - pushDirection.y * pushForce);
                            }
                        }
                    }
                }
            });

            if (dog.body.velocity.x < 0) {
                dog.setFlipX(false);
            } else if (dog.body.velocity.x > 0) {
                dog.setFlipX(true);
            }
        }
    });

    butterflies.getChildren().forEach((butterflyObject) => {
        const butterfly = butterflyObject as Phaser.Physics.Arcade.Sprite;
        if (butterfly.active && butterfly.body) {
            const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
            const distanceToPlayer = Phaser.Math.Distance.Between(player.x, player.y, butterfly.x, butterfly.y);

            if (distanceToPlayer < BUTTERFLY_REPEL_DISTANCE) {
                const direction = new Phaser.Math.Vector2(butterfly.x - player.x, butterfly.y - player.y).normalize();
                butterfly.body.velocity.x = direction.x * BUTTERFLY_REPEL_FORCE;
                butterfly.body.velocity.y = direction.y * BUTTERFLY_REPEL_FORCE;
                butterfly.setData('moveTimer', 0);
            } else {
                let moveTimer = butterfly.getData('moveTimer') as number;
                let nextMoveTime = butterfly.getData('nextMoveTime') as number;

                moveTimer += this.game.loop.delta;

                if (moveTimer >= nextMoveTime) {
                    const angle = Phaser.Math.Between(0, 360);
                    const speed = Phaser.Math.Between(50, 150);
                    this.physics.velocityFromAngle(angle, speed, butterfly.body.velocity);
                    
                    butterfly.setData('moveTimer', 0);
                    butterfly.setData('nextMoveTime', Phaser.Math.Between(200, 800));
                }
            }
            if (butterfly.body.velocity.x < 0) {
                butterfly.setFlipX(false);
            }
        }
    });

    generateSurroundingChunks.call(this, player.x, player.y);
}

const GameCanvas: React.FC = () => {
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const gameSceneRef = useRef<Phaser.Scene | null>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const [showShopModal, setShowShopModal] = useState(false);
    const [currentScore, setCurrentScore] = useState(0);
    const { skills, clearSkills } = useSkills();
    const [currentLevel, setCurrentLevel] = useState(1);
    const [showGameOverModal, setShowGameOverModal] = useState(false);
    const [finalScore, setFinalScore] = useState(0);

    useEffect(() => {
        const isClient = typeof window !== 'undefined';

        if (isClient && gameContainerRef.current && !gameRef.current) {
            const { width, height, minWidthApplied } = getGameDimensions();
            
            const initialDataForScene = {
                minWidthApplied: minWidthApplied,
                openShopModal: (level: number, score: number, skills: number[], closeShop: () => void) => {
                    setShowShopModal(true);
                    setCurrentScore(score);
                    setCurrentLevel(level);
                    if (gameRef.current) {
                        gameRef.current.scene.pause('MainScene');
                    }
                },
                triggerGameOverModal: (score: number) => {
                    setShowGameOverModal(true);
                    setFinalScore(score);
                    if (gameRef.current) {
                        gameRef.current.scene.pause('MainScene');
                    }
                },
            };

            const currentConfig: Phaser.Types.Core.GameConfig = { 
                ...baseConfig,
                width: width,
                height: height,
            };
            
            currentConfig.parent = gameContainerRef.current.id;
            const newGame = new Phaser.Game(currentConfig);
            gameRef.current = newGame;

            newGame.events.on(Phaser.Core.Events.READY, () => {
                const gameScene = newGame.scene.getScene('MainScene');
                gameSceneRef.current = gameScene;

                if (gameScene) {
                    gameScene.data.set('minWidthApplied', initialDataForScene.minWidthApplied);
                    gameScene.data.set('openShopModal', initialDataForScene.openShopModal);
                    gameScene.data.set('triggerGameOverModal', initialDataForScene.triggerGameOverModal);
                    gameScene.data.set('skills', skills);
                }
            });


            const handleResize = () => {
                // 리사이즈 로직 필요시 추가
            };
            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
            };
        } else if (!isClient) {
            // Server side
        }

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (gameSceneRef.current) {
            const scene = gameSceneRef.current;
            scene.data.set('skills', skills);
            scene.data.set('playerLevel', currentLevel); 
            scene.data.set('shopOpened', false); 

            if (skills.some(skill => skill >= 31 && skill <= 39)) {
                let skillLevel = skills.filter(skill => skill >= 31 && skill <= 39).sort((a, b) => b - a)[0];
                skillLevel = skillLevel - 30;
                const newMaxEnergy = 3 + skillLevel;
                scene.data.set('energy', newMaxEnergy);
                INITIAL_PLAYER_ENERGY = newMaxEnergy;
            } else {
                INITIAL_PLAYER_ENERGY = 3;
            }

            const hasShockwaveSkill = skills.includes(SHOCKWAVE_SKILL_ID);
            let shockwavePhaserEvent = scene.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;

            if (hasShockwaveSkill && !shockwavePhaserEvent) {
                scene.data.set('shockwaveArmed', false);
                shockwavePhaserEvent = scene.time.addEvent({
                    delay: SHOCKWAVE_INTERVAL_MS,
                    callback: () => {
                        const player = scene.data.get('player') as Phaser.Physics.Arcade.Sprite;
                        const isGameOver = scene.data.get('gameOver') as boolean;
                        if (player && player.active && !isGameOver && (scene.data.get('skills') as number[]).includes(SHOCKWAVE_SKILL_ID)) {
                            scene.data.set('shockwaveArmed', true);
                        }
                    },
                    loop: true
                });
                scene.data.set('shockwavePhaserEvent', shockwavePhaserEvent);
            } else if (!hasShockwaveSkill && shockwavePhaserEvent) {
                shockwavePhaserEvent.remove();
                scene.data.remove('shockwavePhaserEvent');
                scene.data.set('shockwaveArmed', false);
            }
        }
    }, [skills]);

    const closeShopModal = () => {
        setShowShopModal(false);
        if (gameRef.current && gameSceneRef.current) {
            gameRef.current.scene.resume('MainScene');
            gameSceneRef.current.data.set('shopOpened', false);
        }
    };

    const handleRestartGame = () => {
        if (clearSkills) {
            clearSkills();
        }

        if (gameSceneRef.current && gameSceneRef.current.scene) {
            const scene = gameSceneRef.current;
            const shockwavePhaserEvent = scene.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;
            if (shockwavePhaserEvent) {
                shockwavePhaserEvent.remove();
                scene.data.remove('shockwavePhaserEvent');
            }
            scene.data.set('shockwaveArmed', false);
            const shockwaveCooldownText = scene.data.get('shockwaveCooldownText') as Phaser.GameObjects.Text | undefined;
            if (shockwaveCooldownText) {
                shockwaveCooldownText.setVisible(false);
            }
            scene.data.set('wasTwoFingerDown', false);
            
            if (gameSceneRef.current.data) {
                 gameSceneRef.current.data.set('skills', []);
                 gameSceneRef.current.data.set('playerLevel', 1);
                 gameSceneRef.current.data.set('score', 0);
                 gameSceneRef.current.data.set('energy', INITIAL_PLAYER_ENERGY);
                 gameSceneRef.current.data.set('shopOpened', false);
                 const generatedChunks = gameSceneRef.current.data.get('generatedChunks');
                 if (generatedChunks && typeof generatedChunks.clear === 'function') {
                    generatedChunks.clear();
                 }
                 gameOver = false;
                 elapsedTime = 0;
            }

            setShowGameOverModal(false);
            gameSceneRef.current.scene.restart();
        }
    };

    return (
        <div id="game-container" ref={gameContainerRef} style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <ShopModal isVisible={showShopModal} onClose={closeShopModal} level={currentLevel} skills={skills} />
            <GameOverModal
            isVisible={showGameOverModal}
            onClose={() => {
                handleRestartGame();
            }}
            score={finalScore}
            onSave={(name: string) => {
                console.log(`Saving score with name: ${name}`);
            }}
            />
        </div>
    );
};

export default GameCanvas;