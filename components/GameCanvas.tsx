'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import ShopModal from './shopModal'; // ShopModal.tsx 파일 경로에 맞게 수정해주세요.
import { SkillsProvider, useSkills } from './SkillsContext'; // SkillsContext 임포트
import levelExperience from '../public/levelSetting.json'; // 레벨 경험치 설정을 가져옵니다.

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

const FISH_SPAWN_INTERVAL_MS = 5000; // 5초마다 물고기 아이템 생성
const FISH_SPAWN_PROBABILITY = 0.3; // 30% 확률로 물고기 아이템 생성
const MAX_ACTIVE_FISH = 2; // 최대 물고기 아이템 수

const BUTTERFLY_SPAWN_INTERVAL_MS = 1000; // 1초마다 나비 생성 시도
const BUTTERFLY_SPAWN_PROBABILITY = 0.1; // 10% 확률로 나비 생성
const MAX_ACTIVE_BUTTERFLIES = 1; // 화면에 표시될 최대 나비 수
const BUTTERFLY_REPEL_DISTANCE = 150; // 플레이어가 나비에게 다가갈 때 나비가 멀어지는 거리
const BUTTERFLY_REPEL_FORCE = 100; // 나비가 멀어지는 힘 (속도)

const PLAYER_INVINCIBILITY_DURATION_MS = 2000; // 플레이어 무적 시간 (2초)

const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;

// 무한 맵 관련 상수
const WORLD_BOUNDS_SIZE = 100000; // 물리 세계의 매우 큰 경계
const TILE_SIZE = 32; // 개별 배경 타일의 크기
const CHUNK_DIMENSIONS = 20; // 한 청크에 포함될 타일의 개수 (20x20 타일)
const CHUNK_SIZE_PX = CHUNK_DIMENSIONS * TILE_SIZE; // 한 청크의 실제 픽셀 크기
const GENERATION_BUFFER_CHUNKS = 2; // 플레이어 주변 몇 개의 청크를 미리 생성할지 (예: 2는 5x5 청크 그리드를 생성)

// 배경 타일 색상 배열 (기존 generateBackground 로직 활용)
const TILE_COLORS: number[] = [];
for (let i = 0; i < 10; i++) { // 10가지 색상 변형
    const hue = Phaser.Math.FloatBetween(0.25, 0.40); // 녹색 범위
    const saturation = Phaser.Math.FloatBetween(0.1, 0.3); // 채도 감소
    const lightness = Phaser.Math.FloatBetween(0.3, 0.4); // 명도 감소
    TILE_COLORS.push(Phaser.Display.Color.HSLToColor(hue, saturation, lightness).color);
}


function preload(this: Phaser.Scene) {
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
    this.load.image('cat_punch', '/images/cat_punch.png'); // cat_punch 이미지 로드
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
    // 물고기 아이템 스프라이트 로드 (frameWidth, frameHeight 조정)
    this.load.spritesheet('fish_item_sprite', '/images/fish_sprite_2frame.png', { frameWidth: 100, frameHeight: 100 }); // frameHeight를 100으로 수정
    // 나비 아이템 스프라이트 로드 (사용자 수정 반영: frameHeight를 83으로 수정)
    this.load.spritesheet('butterfly_sprite_3frame', '/images/butterfly_sprite_3frame.png', { frameWidth: 100, frameHeight: 83 });
}

function create(this: Phaser.Scene) {
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    this.cameras.main.setBackgroundColor('#ffffff');
    // generateBackground.call(this); // 무한 맵으로 대체되므로 제거

    // 물리 세계 경계를 매우 크게 설정하여 무한 맵처럼 작동하도록 함
    this.physics.world.setBounds(0, 0, WORLD_BOUNDS_SIZE, WORLD_BOUNDS_SIZE);


    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;

    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;

    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    // player.setCollideWorldBounds(true); // 플레이어가 월드 경계에 닿으면 멈추도록 -> 무한 이동을 위해 제거
    player.setDrag(500);
    player.setDepth(1); // 플레이어 depth 설정

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

    // 물고기 아이템 애니메이션 추가
    this.anims.create({
        key: 'fish_swim',
        frames: this.anims.generateFrameNumbers('fish_item_sprite', { start: 0, end: 1 }),
        frameRate: 4, // 물고기 움직임 속도
        repeat: -1
    });

    // 나비 아이템 애니메이션 추가
    this.anims.create({
        key: 'butterfly_fly',
        frames: this.anims.generateFrameNumbers('butterfly_sprite_3frame', { start: 0, end: 2 }),
        frameRate: 8, // 나비 움직임 속도
        repeat: -1
    });

    const mice = this.physics.add.group();
    const dogs = this.physics.add.group();
    const fishItems = this.physics.add.group(); // 물고기 아이템 그룹 생성
    const butterflies = this.physics.add.group(); // 나비 아이템 그룹 생성

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

    // 물고기 아이템 생성 이벤트 추가
    this.time.addEvent({
        delay: FISH_SPAWN_INTERVAL_MS,
        callback: spawnFishItem,
        callbackScope: this,
        loop: true
    });

    // 나비 아이템 생성 이벤트 추가
    this.time.addEvent({
        delay: BUTTERFLY_SPAWN_INTERVAL_MS,
        callback: spawnButterflyVillain,
        callbackScope: this,
        loop: true
    });

    const cursors = this.input.keyboard?.createCursorKeys();
    this.input.addPointer(1);
    this.input.addPointer(2);

    this.physics.add.collider(player, mice, hitMouse as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(player, dogs, hitDog as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(player, fishItems, collectFish as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // 물고기 아이템 충돌 처리
    this.physics.add.overlap(player, butterflies, collectButterfly as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // 나비 아이템 충돌 처리

    this.physics.add.collider(mice, mice);
    this.physics.add.collider(dogs, dogs);
    this.physics.add.collider(mice, dogs);

    const playerLevel = this.add.text(0, 0, 'Level: 1', { fontSize: '16px', color: '#000000' });
    playerLevel.setOrigin(0.5);
    playerLevel.setDepth(2); // UI는 가장 위에 표시

    const scoreText = this.add.text(0, 0, 'Score: 0', { fontSize: '16px', color: '#000000' });
    scoreText.setOrigin(0.5);
    scoreText.setDepth(2); // UI는 가장 위에 표시

    const timerText = this.add.text(
        0, 0,
        'Time: 0s',
        { fontSize: '16px', color: '#000000' }
    );
    timerText.setOrigin(0.5);
    timerText.setVisible(false);
    timerText.setDepth(2); // UI는 가장 위에 표시

    const energyBarBg = this.add.graphics();
    energyBarBg.fillStyle(ENERGY_BAR_COLOR_BG, 0.8);
    energyBarBg.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarBg.setDepth(2); // UI는 가장 위에 표시

    const energyBarFill = this.add.graphics();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarFill.setDepth(2); // UI는 가장 위에 표시

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
    gameOverText.setDepth(3); // 게임 오버 UI는 최상단

    // 재시작 버튼 생성
    const restartButton = this.add.text(
        this.cameras.main.centerX,
        this.cameras.main.centerY + 100, // 게임 오버 텍스트 아래에 위치
        'Restart Game',
        { fontSize: '32px', color: '#0000ff', backgroundColor: '#cccccc', padding: { x: 20, y: 10 } }
    );
    restartButton.setOrigin(0.5);
    restartButton.setScrollFactor(0);
    restartButton.setInteractive(); // 클릭 가능하도록 설정
    restartButton.setVisible(false); // 초기에는 보이지 않도록 설정
    restartButton.on('pointerdown', () => restartGame.call(this)); // 클릭 시 restartGame 호출
    restartButton.setDepth(3); // 재시작 버튼도 최상단

    this.data.set('player', player);
    this.data.set('mice', mice);
    this.data.set('dogs', dogs);
    this.data.set('fishItems', fishItems); // 물고기 아이템 그룹 씬 데이터에 저장
    this.data.set('butterflies', butterflies); // 나비 아이템 그룹 씬 데이터에 저장
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('playerLevel', playerLevel);
    this.data.set('playerLevelText', playerLevel);
    this.data.set('scoreText', scoreText);
    this.data.set('timerText', timerText);
    this.data.set('gameOverText', gameOverText);
    this.data.set('restartButton', restartButton); // 재시작 버튼 씬 데이터에 저장

    this.data.set('isKnockedBack', false);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('energyBarBg', energyBarBg);
    this.data.set('energyBarFill', energyBarFill);
    this.data.set('shopOpened', false); // 상점 팝업 플래그 초기화
    this.data.set('skills', []); // skills 배열을 씬 데이터에 저장
    this.data.set('isInvincible', false); // 무적 상태 플래그 초기화

    // generatedChunks Set을 먼저 초기화합니다.
    this.data.set('generatedChunks', new Set<string>());
    // 초기 맵 청크 생성
    generateSurroundingChunks.call(this, player.x, player.y);


    this.cameras.main.startFollow(player, true, 0.05, 0.05);

    const { width, height } = getGameDimensions();
    // this.physics.world.setBounds(0, 0, width, height); // 무한 맵으로 대체되므로 제거

    // worldBorder도 무한 맵에서는 의미가 없으므로 제거
    // const worldBorder = this.add.graphics();
    // worldBorder.strokeRect(0, 0, width, height);
    // this.data.set('worldBorder', worldBorder);
    
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
        const restartButton = this.data.get('restartButton') as Phaser.GameObjects.Text;
        if (restartButton) {
            restartButton.setPosition(this.cameras.main.centerX, this.cameras.main.centerY + 100);
        }

        // 월드 경계는 고정되어 있으므로 리사이즈 시 업데이트할 필요 없음
        // const currentWorldBorder = this.data.get('worldBorder') as Phaser.GameObjects.Graphics;
        // const { width: newWidth, height: newHeight } = getGameDimensions();
        // currentWorldBorder.clear();
        // currentWorldBorder.strokeRect(0, 0, newWidth, newHeight);
        // this.physics.world.setBounds(0, 0, newWidth, newHeight);

        // D-Pad 버튼 위치 조정 로직 (현재는 제거된 상태)
        // if (isMobile) { ... }
    });

    console.log('Initial Scale Factors:', this.scale.displayScale.x, this.scale.displayScale.y);
}

/**
 * 특정 청크 좌표에 배경 타일을 생성하는 함수.
 * 이미 생성된 청크는 다시 생성하지 않습니다.
 */
function generateTileChunk(this: Phaser.Scene, chunkX: number, chunkY: number) {
    const generatedChunks = this.data.get('generatedChunks') as Set<string>;
    const chunkKey = `${chunkX}_${chunkY}`;

    if (generatedChunks.has(chunkKey)) {
        return; // 이미 생성된 청크
    }
    generatedChunks.add(chunkKey);

    const startWorldX = chunkX * CHUNK_SIZE_PX;
    const startWorldY = chunkY * CHUNK_SIZE_PX;

    for (let x = 0; x < CHUNK_DIMENSIONS; x++) {
        for (let y = 0; y < CHUNK_DIMENSIONS; y++) {
            const worldX = startWorldX + x * TILE_SIZE;
            const worldY = startWorldY + y * TILE_SIZE;
            
            // 랜덤 색상 선택
            const colorIndex = Phaser.Math.Between(0, TILE_COLORS.length - 1);
            const color = TILE_COLORS[colorIndex];
            this.add.rectangle(worldX, worldY, TILE_SIZE, TILE_SIZE, color).setOrigin(0, 0).setDepth(0); // depth 설정
        }
    }
}

/**
 * 플레이어 주변의 청크들을 생성하는 함수.
 * 플레이어가 이동함에 따라 호출되어 새로운 맵 영역을 동적으로 로드합니다.
 */
function generateSurroundingChunks(this: Phaser.Scene, worldX: number, worldY: number) {
    const currentChunkX = Math.floor(worldX / CHUNK_SIZE_PX);
    const currentChunkY = Math.floor(worldY / CHUNK_SIZE_PX);

    for (let i = currentChunkX - GENERATION_BUFFER_CHUNKS; i <= currentChunkX + GENERATION_BUFFER_CHUNKS; i++) {
        for (let j = currentChunkY - GENERATION_BUFFER_CHUNKS; j <= currentChunkY + GENERATION_BUFFER_CHUNKS; j++) {
            generateTileChunk.call(this, i, j);
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

// 물고기 아이템 생성 함수
function spawnFishItem(this: Phaser.Scene) {
    if (gameOver) return;

    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    const activeFish = fishItems.countActive(true);

    if (activeFish >= MAX_ACTIVE_FISH) {
        // console.log(`Max fish items (${MAX_ACTIVE_FISH}) reached. Skipping fish item spawn.`);
        return;
    }

    // 30% 확률로 물고기 아이템 생성
    if (Math.random() < FISH_SPAWN_PROBABILITY) {
        const gameWidth = this.physics.world.bounds.width;
        const gameHeight = this.physics.world.bounds.height;

        // 랜덤 위치 선정 (현재 카메라 뷰 내에서)
        const camera = this.cameras.main;
        const x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right);
        const y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom);

        const fish = fishItems.create(x, y, 'fish_item_sprite') as Phaser.Physics.Arcade.Sprite;
        fish.setCollideWorldBounds(false); // 월드 바운드 충돌 비활성화 (맵 밖으로 나가지 않도록)
        fish.setImmovable(true); // 움직이지 않도록 설정
        fish.setScale(0.4); // 크기 조정
        fish.play('fish_swim'); // 물고기 애니메이션 재생
        fish.setDepth(1); // 물고기 depth 설정
    }
}

// 나비 아이템 생성 시도 함수
function spawnButterflyVillain(this: Phaser.Scene) {
    if (gameOver) return;
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;
    // 화면에 나비가 MAX_ACTIVE_BUTTERFLIES (1개) 이상 있으면 생성하지 않음
    if (butterflies.countActive(true) >= MAX_ACTIVE_BUTTERFLIES) {
        return;
    }
    // 10% 확률로 나비 생성
    if (Math.random() < BUTTERFLY_SPAWN_PROBABILITY) {
        spawnButterfly.call(this, butterflies);
    }
}

// 나비 아이템 생성 함수
function spawnButterfly(this: Phaser.Scene, butterflies: Phaser.Physics.Arcade.Group) {
    const camera = this.cameras.main;
    // 나비를 현재 카메라 뷰 내에서 랜덤 위치에 생성
    const x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right);
    const y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom);

    const butterfly = butterflies.create(x, y, 'butterfly_sprite_3frame') as Phaser.Physics.Arcade.Sprite;
    butterfly.setCollideWorldBounds(true); // 월드 경계에 닿으면 튕기도록 설정
    butterfly.setBounce(1); // 완전 반사
    butterfly.setScale(0.5); // 크기 조정
    butterfly.play('butterfly_fly', true); // 나비 애니메이션 재생
    butterfly.setDepth(1); // 나비 depth 설정

    // 초기 랜덤 속도 설정
    const angle = Phaser.Math.Between(0, 360);
    const speed = Phaser.Math.Between(50, 150); // 랜덤 속도 범위
    const butterflyBody = butterfly.body as Phaser.Physics.Arcade.Body;
    this.physics.velocityFromAngle(angle, speed, butterflyBody.velocity);

    // 나비의 불규칙한 움직임을 위한 타이머 데이터 설정
    butterfly.setData('moveTimer', 0);
    butterfly.setData('nextMoveTime', Phaser.Math.Between(200, 800)); // 0.2초에서 0.8초 사이마다 방향 변경
}


function spawnMouse(this: Phaser.Scene, mice: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const camera = this.cameras.main;
    // 쥐를 현재 카메라 뷰 밖의 랜덤 위치에 생성
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const buffer = 50; // 화면 밖으로 좀 더 떨어진 곳에 생성

    switch (edge) {
        case 0: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.top - buffer; break; // 상단
        case 1: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.bottom + buffer; break; // 하단
        case 2: x = camera.worldView.left - buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break; // 좌측
        case 3: x = camera.worldView.right + buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break; // 우측
        default: x = 0; y = 0; break;
    }

    const mouse = mice.create(x, y, 'mouse_enemy_sprite') as Phaser.Physics.Arcade.Sprite;
    mouse.setBounce(0.2);
    mouse.setCollideWorldBounds(false); // 월드 경계 충돌 비활성화 (화면 밖으로 나갈 수 있도록)
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    mouse.setScale((32 / 100) * spriteScaleFactor);
    mouse.play('mouse_walk');
    mouse.setDepth(1); // 쥐 depth 설정
    this.physics.moveToObject(mouse, player, 50);
}

function spawnDog(this: Phaser.Scene, dogs: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) {
    const camera = this.cameras.main;
    // 개를 현재 카메라 뷰 밖의 랜덤 위치에 생성
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    const buffer = 50; // 화면 밖으로 좀 더 떨어진 곳에 생성

    switch (edge) {
        case 0: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.top - buffer; break; // 상단
        case 1: x = Phaser.Math.Between(camera.worldView.left, camera.worldView.right); y = camera.worldView.bottom + buffer; break; // 하단
        case 2: x = camera.worldView.left - buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break; // 좌측
        case 3: x = camera.worldView.right + buffer; y = Phaser.Math.Between(camera.worldView.top, camera.worldView.bottom); break; // 우측
        default: x = 0; y = 0; break;
    }

    const dog = dogs.create(x, y, 'dog_enemy_sprite') as CustomDogSprite; // CustomDogSprite로 캐스팅
    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false); // 월드 경계 충돌 비활성화
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    dog.setScale(0.5 * spriteScaleFactor);
    dog.play('dog_walk');
    dog.isKnockedBack = false; // 기본적으로 넉백 상태가 아님
    dog.setDepth(1); // 개 depth 설정
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

    // 플레이어가 이미 무적 상태이면 충돌을 무시
    if (player.getData('isInvincible')) {
        console.log('Player is invincible, ignoring dog hit.');
        return;
    }

    console.log('Collision detected! Player hit by dog!');

    const dog = dogObject as CustomDogSprite;
    // 플레이어가 개를 바라보는 방향을 향하고 있는지 확인
    const dotProduct = (dog.x - player.x) * (player.flipX ? -1 : 1);
    // !!! MODIFIED START: Conditional knockback based on skills !!!
    // skills 배열이 number[] 타입이므로 1을 숫자로 사용합니다.
    let skills = this.data.get('skills') as number[]; // skills 배열을 씬 데이터에서 가져옴
    const isMovingForAnimation = this.data.get('isMovingForAnimation') as boolean;
    if (skills.includes(1) && dotProduct < 0 && isMovingForAnimation) { // FIX: Changed skills.includes('1') to skills.includes(1) for number array
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

    // 무적 시간 시작
    player.setData('isInvincible', true);
    const invincibilityTween = this.tweens.add({
        targets: player,
        alpha: { from: 1, to: 0.5 }, // 100% 투명도에서 50% 투명도로
        duration: 100, // 깜빡이는 속도 (0.1초마다)
        repeat: -1, // 무한 반복
        yoyo: true // 투명도가 다시 100%로 돌아오도록
    });
    player.setData('invincibilityTween', invincibilityTween);

    this.time.delayedCall(PLAYER_INVINCIBILITY_DURATION_MS, () => {
        player.setData('isInvincible', false);
        const currentTween = player.getData('invincibilityTween');
        if (currentTween) { // 트윈이 존재하는지 확인 후 정지
            currentTween.stop();
        }
        player.setAlpha(1); // 플레이어 투명도를 원래대로 (완전히 보이게) 되돌림
        console.log('Player invincibility ended.');
    }, [], this);
}

// 물고기 아이템 획득 함수
function collectFish(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    fish: Phaser.Physics.Arcade.Sprite
) {
    if (gameOver) return;

    console.log('Fish collected! Restoring energy.');

    // 물고기 아이템 비활성화 및 파괴
    fish.disableBody(true, true);

    let energy = this.data.get('energy');
    if (energy < INITIAL_PLAYER_ENERGY) { // 최대 에너지 이상으로 회복되지 않도록
        energy++;
        this.data.set('energy', energy);

        // 에너지 바 업데이트
        const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
        const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

        energyBarFill.clear();
        energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
        energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);
    }
}

// 나비 아이템 획득 함수
function collectButterfly(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    butterfly: Phaser.Physics.Arcade.Sprite
) {
    if (gameOver) return;

    console.log('Butterfly collected! Restoring all energy.');

    // 나비 아이템 비활성화 및 파괴
    butterfly.disableBody(true, true);

    // 모든 에너지 회복
    let energy = INITIAL_PLAYER_ENERGY;
    this.data.set('energy', energy);

    // 에너지 바 업데이트
    const energyBarFill = this.data.get('energyBarFill') as Phaser.GameObjects.Graphics;
    const newWidth = (energy / INITIAL_PLAYER_ENERGY) * ENERGY_BAR_WIDTH;

    energyBarFill.clear();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, newWidth, ENERGY_BAR_HEIGHT);
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
    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group; // 물고기 아이템 그룹 가져오기
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group; // 나비 아이템 그룹 가져오기
    const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
    const restartButton = this.data.get('restartButton') as Phaser.GameObjects.Text;


    if (mice) mice.getChildren().forEach((mouse) => (mouse.body as any)?.stop());
    if (dogs) dogs.getChildren().forEach((dog) => (dog.body as any)?.stop());
    if (fishItems) fishItems.getChildren().forEach((fish) => (fish.body as any)?.stop()); // 물고기 아이템도 정지
    if (butterflies) butterflies.getChildren().forEach((butterfly) => (butterfly.body as any)?.stop()); // 나비 아이템도 정지

    if (gameOverText) {
        gameOverText.setVisible(true);
    }
    if (restartButton) {
        restartButton.setVisible(true); // 재시작 버튼 보이게
    }
}

// 게임 재시작 함수
function restartGame(this: Phaser.Scene) {
    console.log('Restarting game...');
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    // 게임 상태 초기화
    this.data.set('score', 0);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('isKnockedBack', false);
    this.data.set('shopOpened', false);
    this.data.set('skills', []); // 스킬도 초기화
    this.data.get('generatedChunks').clear(); // 생성된 청크 목록 초기화

    // UI 요소 숨기기
    const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
    const restartButton = this.data.get('restartButton') as Phaser.GameObjects.Text;
    if (gameOverText) gameOverText.setVisible(false);
    if (restartButton) restartButton.setVisible(false);

    // 모든 그룹의 자식 객체 파괴 (씬 재시작 전에 클린업)
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const fishItems = this.data.get('fishItems') as Phaser.Physics.Arcade.Group;
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group;

    if (mice) mice.clear(true, true); // true, true는 자식 객체를 비활성화하고 파괴
    if (dogs) dogs.clear(true, true);
    if (fishItems) fishItems.clear(true, true);
    if (butterflies) butterflies.clear(true, true);

    // 씬 재시작
    this.scene.restart();
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
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group; // 나비 그룹 가져오기

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
                isMovingForAnimation = true; // 넉백 잔여 속도 등으로 계속 움직이는 경우
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

    const playerBottomY = player.y + (player.displayHeight / 2) + 5;
    const textSpacing = 20;

    // scoreText.setPosition(player.x, playerBottomY);
    // energyBarBg.x = player.x - (ENERGY_BAR_WIDTH / 2);
    // energyBarBg.y = playerBottomY + textSpacing;
    // energyBarFill.x = energyBarBg.x;
    // energyBarFill.y = energyBarBg.y;

    // playerLevelText.setPosition(player.x, playerBottomY + textSpacing * 2);
    // timerText.setPosition(player.x, playerBottomY + textSpacing * 3);
    // playerLevelText.setText('Level: ' + player.getData('level'));
    // timerText.setText('Time: ' + Math.floor(elapsedTime / 1000) + 's');

    scoreText.setScrollFactor(0);
    playerLevelText.setScrollFactor(0);
    timerText.setScrollFactor(0);
    // energyBarBg.setScrollFactor(0);
    // energyBarFill.setScrollFactor(0);

    scoreText.setPosition(this.cameras.main.width / 2, 20);
    playerLevelText.setPosition(this.cameras.main.width / 2, 50);
    timerText.setPosition(this.cameras.main.width / 2, 80);
    // energyBarBg.x = this.cameras.main.width / 2 - (ENERGY_BAR_WIDTH / 2);
    // energyBarBg.y = 110;
    // energyBarFill.x = energyBarBg.x;
    // energyBarFill.y = energyBarBg.y;

    energyBarBg.x = player.x - (ENERGY_BAR_WIDTH / 2);
    energyBarBg.y = playerBottomY;
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

    // 나비 불규칙 비행 로직
    butterflies.getChildren().forEach((butterflyObject) => {
        const butterfly = butterflyObject as Phaser.Physics.Arcade.Sprite;
        // butterfly.active와 butterfly.body가 모두 존재할 때만 로직 실행
        if (butterfly.active && butterfly.body) {
            const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite; // 플레이어 객체 가져오기
            const distanceToPlayer = Phaser.Math.Distance.Between(player.x, player.y, butterfly.x, butterfly.y);

            if (distanceToPlayer < BUTTERFLY_REPEL_DISTANCE) {
                // 플레이어에게서 멀어지는 방향 계산
                const direction = new Phaser.Math.Vector2(butterfly.x - player.x, butterfly.y - player.y).normalize();
                butterfly.body.velocity.x = direction.x * BUTTERFLY_REPEL_FORCE;
                butterfly.body.velocity.y = direction.y * BUTTERFLY_REPEL_FORCE;
                // 방향 전환 타이머 초기화 (repel 중에는 불규칙 비행 로직이 바로 적용되지 않도록)
                butterfly.setData('moveTimer', 0);
            } else {
                // 기존 불규칙 비행 로직
                let moveTimer = butterfly.getData('moveTimer') as number;
                let nextMoveTime = butterfly.getData('nextMoveTime') as number;

                moveTimer += this.game.loop.delta; // 델타 타임 누적

                if (moveTimer >= nextMoveTime) {
                    const angle = Phaser.Math.Between(0, 360); // 0도에서 360도 사이 랜덤 각도
                    const speed = Phaser.Math.Between(50, 150); // 50에서 150 사이 랜덤 속도
                    this.physics.velocityFromAngle(angle, speed, butterfly.body.velocity); // 새로운 속도 적용
                    
                    butterfly.setData('moveTimer', 0); // 타이머 초기화
                    butterfly.setData('nextMoveTime', Phaser.Math.Between(200, 800)); // 다음 방향 변경까지 랜덤 시간 설정 (0.2초에서 0.8초)
                }
            }
            // 나비의 x축 속도에 따라 스프라이트 뒤집기
            if (butterfly.body.velocity.x < 0) {
                butterfly.setFlipX(false);
            } else if (butterfly.body.velocity.x > 0) {
                butterfly.setFlipX(true);
            }
        }
    });

    // 플레이어 위치에 따라 새로운 청크 생성
    generateSurroundingChunks.call(this, player.x, player.y);
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
