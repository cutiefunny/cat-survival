'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import ShopModal from './shopModal'; // ShopModal.tsx 파일 경로에 맞게 수정해주세요.
import { SkillsProvider, useSkills } from './SkillsContext'; // SkillsContext 임포트
import levelExperience from '../public/levelSetting.json'; // 레벨 경험치 설정을 가져옵니다.
import GameOverModal from './GameOverModal';

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

const FISH_SPAWN_INTERVAL_MS = 5000; // 5초마다 물고기 아이템 생성
const FISH_SPAWN_PROBABILITY = 0.3; // 30% 확률로 물고기 아이템 생성
const MAX_ACTIVE_FISH = 2; // 최대 물고기 아이템 수

const BUTTERFLY_SPAWN_INTERVAL_MS = 1000; // 1초마다 나비 생성 시도
const BUTTERFLY_SPAWN_PROBABILITY = 0.1; // 10% 확률로 나비 생성
const MAX_ACTIVE_BUTTERFLIES = 1; // 화면에 표시될 최대 나비 수
const BUTTERFLY_REPEL_DISTANCE = 150; // 플레이어가 나비에게 다가갈 때 나비가 멀어지는 거리
const BUTTERFLY_REPEL_FORCE = 100; // 나비가 멀어지는 힘 (속도)

const PLAYER_INVINCIBILITY_DURATION_MS = 500; // 플레이어 무적 시간 (0.5초)

const ENERGY_BAR_WIDTH = 60;
const ENERGY_BAR_HEIGHT = 8;
const ENERGY_BAR_COLOR_BG = 0x808080;
const ENERGY_BAR_COLOR_FILL = 0x00ff00;

const SHOCKWAVE_SKILL_ID = 51;
const SHOCKWAVE_INTERVAL_MS = 10000; // 10초
const SHOCKWAVE_RADIUS_START = 20;  // 충격파 시작 시 반지름
const SHOCKWAVE_RADIUS_END = 300;    // 충격파 최대 반지름
const SHOCKWAVE_DURATION_MS = 500;   // 충격파 시각 효과 지속 시간
const SHOCKWAVE_PUSH_FORCE = 500;   // 적을 밀어내는 힘
const SHOCKWAVE_COLOR = 0xADD8E6;   // 충격파 색상 (연한 파랑)
const SHOCKWAVE_LINE_WIDTH = 10;     // 충격파 선 두께
const SHOCKWAVE_TRIGGER_DISTANCE = 50; // 충격파 발동을 위한 적 감지 거리

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
//#endregion

//스프라이트를 생성하는 함수
function preload(this: Phaser.Scene) {
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });
    this.load.image('cat_punch', '/images/cat_punch.png'); // cat_punch 이미지 로드
    this.load.image('cat_hit', '/images/cat_hit.png'); // cat_hit 이미지 로드
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });
    // 물고기 아이템 스프라이트 로드 (frameWidth, frameHeight 조정)
    this.load.spritesheet('fish_item_sprite', '/images/fish_sprite_2frame.png', { frameWidth: 100, frameHeight: 100 }); // frameHeight를 100으로 수정
    // 나비 아이템 스프라이트 로드 (사용자 수정 반영: frameHeight를 83으로 수정)
    this.load.spritesheet('butterfly_sprite_3frame', '/images/butterfly_sprite_3frame.png', { frameWidth: 100, frameHeight: 83 });
    this.load.image('cat_cry', '/images/cat_cry.png'); // cat_cry 이미지 로드
    this.load.image('cat_haak', '/images/cat_haak.png'); // cat_haak 이미지 로드
}

//게임의 각 요소를 생성하는 함수
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
    this.data.set('isMobile', isMobile); // 모바일 여부 저장
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;

    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    // player.setCollideWorldBounds(true); // 플레이어가 월드 경계에 닿으면 멈추도록 -> 무한 이동을 위해 제거
    player.setDrag(500);
    player.setDepth(1); // 플레이어 depth 설정

    // 레벨 시스템 초기화
    player.setData('level', 1);
    player.setData('experience', 0);

    const playerLevelText = this.add.text(0, 0, 'Level: 1', {
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: {
            offsetX: 2,
            offsetY: 2,
            color: '#000',
            blur: 2,
            fill: true
        }
    });
    playerLevelText.setOrigin(0.5);
    playerLevelText.setDepth(2); // UI는 가장 위에 표시

    // 충격파 쿨타임 텍스트 생성
    const shockwaveCooldownText = this.add.text(player.x, player.y, '', {
        fontSize: '18px', // 폰트 크기 조정
        color: '#FFFF00', // 노란색으로 눈에 띄게
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
        fontStyle: 'bold'
    });
    shockwaveCooldownText.setOrigin(0.5, 1.5); // 텍스트의 중앙 하단을 기준으로 플레이어 머리 위쪽에 위치하도록 조정
    shockwaveCooldownText.setDepth(player.depth + 1); // 항상 플레이어 위에 보이도록 depth 설정
    shockwaveCooldownText.setVisible(false); // 초기에는 숨김
    this.data.set('shockwaveCooldownText', shockwaveCooldownText);

    // 경험치 바 관련 요소 생성
    const expBarWidth = ENERGY_BAR_WIDTH; // 에너지 바 너비와 동일하게 변경
    const expBarHeight = ENERGY_BAR_HEIGHT; // 에너지 바 높이와 동일하게 변경
    const expBarBgColor = 0x666666;
    const expBarFillColor = 0xffd700; // 금색

    const expBarBg = this.add.graphics();
    expBarBg.fillStyle(expBarBgColor, 0.8);
    expBarBg.fillRect(0, 0, expBarWidth, expBarHeight);
    expBarBg.setDepth(2);

    const expBarFill = this.add.graphics();
    expBarFill.fillStyle(expBarFillColor, 1);
    expBarFill.fillRect(0, 0, 0, expBarHeight); // 초기 너비 0
    expBarFill.setDepth(2);

    let finalPlayerScale;
    if (minWidthApplied) {
        finalPlayerScale = 0.5 * (isMobile ? 0.7 : 1.0);
    } else {
        finalPlayerScale = 0.5 * (isMobile ? 0.7 : 1.0);
    }
    player.setScale(finalPlayerScale);

    // 플레이어 애니메이션 추가
    this.anims.create({
        key: 'cat_walk',
        frames: this.anims.generateFrameNumbers('player_sprite', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1
    });
    player.setFrame(0);

    // 쥐 애니메이션 추가
    this.anims.create({
        key: 'mouse_walk',
        frames: this.anims.generateFrameNumbers('mouse_enemy_sprite', { start: 0, end: 1 }),
        frameRate: 8,
        repeat: -1
    });

    // 개 애니메이션 추가
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

    const mice = this.physics.add.group(); // 쥐 적 그룹 생성
    const dogs = this.physics.add.group(); // 개 적 그룹 생성
    const fishItems = this.physics.add.group(); // 물고기 아이템 그룹 생성
    const butterflies = this.physics.add.group(); // 나비 아이템 그룹 생성

    // 쥐 생성 이벤트 추가
    this.time.addEvent({
        delay: MOUSE_SPAWN_INTERVAL_MS,
        callback: spawnMouseVillain,
        callbackScope: this,
        loop: true
    });

    // 개 생성 이벤트 추가
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
    this.data.set('spaceKey', this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE));
    this.input.mouse?.disableContextMenu(); // 마우스 우클릭 시 컨텍스트 메뉴 비활성화
    this.input.addPointer(1);
    this.input.addPointer(2);

    this.physics.add.collider(player, mice, hitMouse as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(player, dogs, hitDog as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(player, fishItems, collectFish as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // 물고기 아이템 충돌 처리
    this.physics.add.overlap(player, butterflies, collectButterfly as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // 나비 아이템 충돌 처리

    this.physics.add.collider(mice, mice);
    this.physics.add.collider(dogs, dogs);
    this.physics.add.collider(mice, dogs);

    //플레이어 레벨은 1로 초기화
    let playerLevel = 1;

    //플레이어 레벨 텍스트 생성
    // const playerLevelText = this.add.text(0, 0, 'Level: 1', { fontSize: '16px', color: '#000000' });
    // playerLevelText.setOrigin(0.5);
    // playerLevelText.setDepth(2); // UI는 가장 위에 표시

    //스코어 텍스트 생성
    const scoreText = this.add.text(0, 0, 'Score: 0', {
        fontSize: '24px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: {
            offsetX: 2,
            offsetY: 2,
            color: '#000',
            blur: 2,
            fill: true
        }
    });
    scoreText.setOrigin(0.5);
    scoreText.setDepth(2); // UI는 가장 위에 표시

    //타이머 텍스트 생성
    const timerText = this.add.text(
        0, 0,
        'Time: 0s',
        { fontSize: '16px', color: '#000000' }
    );
    timerText.setOrigin(0.5);
    timerText.setVisible(false);
    timerText.setDepth(2); // UI는 가장 위에 표시

    //에너지 바 배경 생성
    const energyBarBg = this.add.graphics();
    energyBarBg.fillStyle(ENERGY_BAR_COLOR_BG, 0.8);
    energyBarBg.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarBg.setDepth(2); // UI는 가장 위에 표시

    //에너지 바 채우기 생성
    const energyBarFill = this.add.graphics();
    energyBarFill.fillStyle(ENERGY_BAR_COLOR_FILL, 1);
    energyBarFill.fillRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT);
    energyBarFill.setDepth(2); // UI는 가장 위에 표시

    //생존 시간을 표시하는 타이머 텍스트 생성
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

    //게임오버 텍스트 생성
    const gameOverText = this.add.text(
        this.cameras.main.centerX,
        this.cameras.main.centerY,
        'Game Over',
        {
            fontSize: '64px',
            color: '#ff0000',
            stroke: '#000000',       // 외곽선 색상
            strokeThickness: 8,   // 외곽선 두께
            shadow: {
                offsetX: 5,
                offsetY: 5,
                color: '#000',
                blur: 5,
                fill: true
            }
        }
    );
    gameOverText.setOrigin(0.5);
    gameOverText.setScrollFactor(0);
    gameOverText.setVisible(false);
    gameOverText.setDepth(3); // 게임 오버 UI는 최상단

    // 재시작 버튼 생성
    const restartButton = this.add.text(
        this.cameras.main.centerX,
        this.cameras.main.centerY + 100, // 게임 오버 텍스트 아래에 위치
        'Try again',
        {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 20, y: 10 },
            stroke: '#ffffff',       // 외곽선 색상
            strokeThickness: 4,   // 외곽선 두께
            shadow: {
                offsetX: 2,
                offsetY: 2,
                color: '#cccccc',
                blur: 3,
                fill: true
            },
        }
    );
    restartButton.setOrigin(0.5);
    restartButton.setScrollFactor(0);
    restartButton.setInteractive(); // 클릭 가능하도록 설정
    restartButton.setVisible(false); // 초기에는 보이지 않도록 설정
    restartButton.on('pointerdown', () => restartGame.call(this)); // 클릭 시 restartGame 호출
    restartButton.setDepth(3); // 재시작 버튼도 최상단

    //여기부터 데이터 셋팅
    this.data.set('player', player);
    this.data.set('mice', mice);
    this.data.set('dogs', dogs);
    this.data.set('fishItems', fishItems); // 물고기 아이템 그룹 씬 데이터에 저장
    this.data.set('butterflies', butterflies); // 나비 아이템 그룹 씬 데이터에 저장
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('playerLevel', playerLevel);
    this.data.set('playerLevelText', playerLevelText);
    this.data.set('playerLevelValue', 1);         // 초기 레벨 값 저장
    this.data.set('scoreText', scoreText);
    this.data.set('timerText', timerText);
    this.data.set('gameOverText', gameOverText);
    this.data.set('restartButton', restartButton); // 재시작 버튼 씬 데이터에 저장

    this.data.set('isKnockedBack', false);
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('energyBarBg', energyBarBg);
    this.data.set('energyBarFill', energyBarFill);
    this.data.set('expBarBg', expBarBg);
    this.data.set('expBarFill', expBarFill);
    this.data.set('shopOpened', false); // 상점 팝업 플래그 초기화
    this.data.set('skills', []); // skills 배열을 씬 데이터에 저장
    this.data.set('isInvincible', false); // 무적 상태 플래그 초기화
    this.data.set('shockwaveArmed', false); // 충격파 준비 상태 초기화
    this.data.set('wasTwoFingerDown', false); // 2점 터치 이전 상태 저장을 위해 추가
    this.data.set('isHaak', false); // 하크 상태 플래그 초기화
    this.data.set('shockwaveCooldown', false); // 충격파 쿨타임 상태 초기화

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
    isStunned?: boolean; // 기절 상태를 추적하는 속성
}

//쥐를 생성하는 조건
function spawnMouseVillain(this: Phaser.Scene) {
    if (gameOver) return;

    let playerLevel = this.data.get('playerLevel') as number; // 플레이어 레벨 가져오기
    const maxActiveMice = MAX_ACTIVE_MICE + (playerLevel * 2); // 레벨에 따라 최대 쥐 개수 증가

    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeMice = mice.countActive(true);

    if (activeMice >= maxActiveMice) {
        // console.log(`Max mice (${MAX_ACTIVE_MICE}) reached. Skipping mouse spawn.`);
        return;
    }

    spawnMouse.call(this, mice, player);
}

//개를 생성하는 조건
function spawnDogVillain(this: Phaser.Scene) {
    if (gameOver) return;

    let playerLevel = this.data.get('playerLevel') as number; // 플레이어 레벨 가져오기
    const maxActiveDogs = MAX_ACTIVE_DOGS + playerLevel; // 레벨에 따라 최대 개 개수 증가

    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;

    const activeDogs = dogs.countActive(true);

    if (activeDogs >= maxActiveDogs) {
        //console.log(`Max dogs (${MAX_ACTIVE_DOGS}) reached. Skipping dog spawn.`);
        return;
    }

    spawnDog.call(this, dogs, player);
}

// 물고기 아이템 생성 시간과 위치와 빈도를 설정한다
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

// 나비 아이템 생성 시간과 빈도를 설정한다
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

//쥐를 생성하는 함수
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
    mouse.setCollideWorldBounds(true); // 월드 경계 충돌 활성화 (화면 밖으로 나갈 수 없도록)
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    mouse.setScale((32 / 100) * spriteScaleFactor);
    mouse.play('mouse_walk');
    mouse.setDepth(1); // 쥐 depth 설정
    this.physics.moveToObject(mouse, player, 50);
}

//개를 생성하는 함수
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

    const dog = dogs.create(x, y, 'dog_enemy_sprite') as CustomDogSprite;
    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false);
    const minWidthApplied = this.data.get('minWidthApplied') as boolean || false;
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = minWidthApplied ? 0.7 : (isMobile ? 0.7 : 1.0);
    dog.setScale(0.5 * spriteScaleFactor);
    dog.play('dog_walk');
    dog.isKnockedBack = false;
    dog.isStunned = false;
    dog.setDepth(1);
}

// 개가 생성될 때 다른 개와 겹치지 않도록 확인하는 함수
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

//쥐를 잡았을 때 처리하는 함수
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

    // 경험치 획득 및 레벨업 체크
    let experience = player.getData('experience') as number;
    experience += 10; // 경험치 획득량
    player.setData('experience', experience);
    checkLevelUp.call(this, player);
}

//쥐를 잡을 때 레벨업 여부
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

    // 레벨업 처리
    if (newLevel > currentLevel) {
        console.log(`Level Up! From ${currentLevel} to ${newLevel}`);
        player.setData('level', newLevel);
        const playerLevelText = this.data.get('playerLevelText') as Phaser.GameObjects.Text;
        playerLevelText.setText('Level: ' + newLevel);
        this.data.set('playerLevelValue', newLevel);
        const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
        expBarFill.clear();
        expBarFill.fillStyle(0xffd700, 1);
        expBarFill.fillRect(0, 0, 0, 10);

        // 레벨업 시 상점 모달 열기
        const shopOpened = this.data.get('shopOpened') as boolean;
        const openShopModal = this.data.get('openShopModal') as (level: number, score: number, skills: number[]) => void;
        if (!shopOpened && openShopModal) {
            this.data.set('shopOpened', true);
            openShopModal(newLevel, this.data.get('score') as number, this.data.get('skills') as number[]);
        }

        player.setData('experience', 0); // 레벨업 후 경험치 초기화
    }
}

//개와 충돌 시 처리하는 함수
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
    if (skills.some(skill => skill >= 11 && skill <= 19) && dotProduct < 0 && isMovingForAnimation) { // FIX: Changed skills.includes('1') to skills.includes(1) for number array
        let skillLevel = skills.filter(skill => skill >= 11 && skill <= 19).sort((a, b) => b - a)[0];
            skillLevel = skillLevel - 10; // 11~19 범위의 스킬 레벨을 1~9로 변환
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
                // 스턴 효과 추가 (skillLevel이 2 이상인 경우)
                if (skillLevel >= 2) {
                    dog.isStunned = true; // 기절 상태로 설정
                    dog.setTint(0x0000ff); // 파란색으로 변경 (기절 시각 효과)
                    dog.setVelocity(0, 0); // 움직임 멈춤
                    this.time.delayedCall(skillLevel * 1000, () => { // skillLevel * 1초 후에 기절 해제
                        dog.isStunned = false;
                        dog.clearTint(); // 색상 제거
                        console.log('Dog stun ended.');
                    }, [], this);
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
                // 넉백 종료 후 원래 스프라이트로 복귀
                player.setTexture('player_sprite'); // 원래 스프라이트 시트로 복귀
                player.play('cat_walk', true); // 원래 애니메이션 재생
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

        // 무적 시간 시작
        player.setData('isInvincible', true);
        // const invincibilityTween = this.tweens.add({
        //     targets: player,
        //     alpha: { from: 1, to: 0.3 }, // 100% 투명도에서 30% 투명도로
        //     duration: 100, // 깜빡이는 속도 (0.1초마다)
        //     repeat: -1, // 무한 반복
        //     yoyo: true // 투명도가 다시 100%로 돌아오도록
        // });
        // player.setData('invincibilityTween', invincibilityTween);

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
}

//충격파(하악질) 스킬
function triggerShockwave(this: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite) {
    if (!player || !player.active) return;

    console.log('Shockwave triggered!');

    // 0. 캐릭터를 cat_haak 스프라이트로 변경
    player.setTexture('cat_haak'); // cat_haak 이미지 로드되어 있어야 함
    this.data.set('isHaak', true); // 하크 상태 플래그 설정
    this.time.delayedCall(500, () => {
        this.data.set('isHaak', false); // 하크 상태 플래그 해제
        player.setTexture('player_sprite'); // 원래 스프라이트 시트로 복귀
        player.play('cat_walk', true); // 원래 애니메이션 재생
    }, [], this);

    // 1. 시각 효과 (확장하는 원)
    const shockwaveCircle = this.add.circle(player.x, player.y, SHOCKWAVE_RADIUS_START, SHOCKWAVE_COLOR, 0.7);
    shockwaveCircle.setStrokeStyle(SHOCKWAVE_LINE_WIDTH, SHOCKWAVE_COLOR, 0.9);
    shockwaveCircle.setDepth(player.depth - 1); // 플레이어보다 한 칸 아래에 보이도록 (또는 취향에 맞게 조절)

    this.tweens.add({
        targets: shockwaveCircle,
        radius: SHOCKWAVE_RADIUS_END,
        alpha: { from: 0.7, to: 0 },
        lineWidth: { from: SHOCKWAVE_LINE_WIDTH, to: 0 }, // 선 두께도 줄어들도록
        duration: SHOCKWAVE_DURATION_MS,
        ease: 'Quad.easeOut',
        onUpdate: (tween, target) => {
            // tween의 progress에 따라 lineWidth를 직접 업데이트해야 할 수 있음 (Graphics는 lineWidth 직접 tween 안됨)
            // 여기서는 strokeStyle을 다시 호출하여 lineWidth를 변경하는 방식을 사용하지 않음.
            // 대신, alpha 값 변경으로 사라지는 효과에 집중.
            // 원한다면, Graphics 객체를 사용하여 매 프레임 다시 그리는 방식으로 lineWidth 애니메이션 가능.
        },
        onComplete: () => {
            shockwaveCircle.destroy();
        }
    });

    // 2. 물리 효과 (주변 적 밀어내기)
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    
    const enemiesToCheck: Phaser.Physics.Arcade.Sprite[] = [];
    if (mice) enemiesToCheck.push(...mice.getChildren() as Phaser.Physics.Arcade.Sprite[]);
    if (dogs) enemiesToCheck.push(...dogs.getChildren() as Phaser.Physics.Arcade.Sprite[]);

    enemiesToCheck.forEach((enemySprite) => {
        if (enemySprite.active && enemySprite.body) {
            // angle과 velocityFromAngle 사용 대신 방향 벡터 직접 계산
            const dx = enemySprite.x - player.x;
            const dy = enemySprite.y - player.y;

            // 거리가 0인 경우 (플레이어와 적이 같은 위치) normalize()가 NaN을 반환할 수 있으므로 처리
            if (dx === 0 && dy === 0) {
                // 방향을 특정할 수 없으므로 임의의 방향으로 살짝 밀거나, 아무것도 안 함
                // 예: 위로 밀기
                enemySprite.body.velocity.setTo(0, -SHOCKWAVE_PUSH_FORCE);
            } else {
                const directionVector = new Phaser.Math.Vector2(dx, dy).normalize();
    
                enemySprite.body.velocity.setTo(0, 0); // 기존 속도 초기화
                enemySprite.body.velocity.x = directionVector.x * SHOCKWAVE_PUSH_FORCE;
                enemySprite.body.velocity.y = directionVector.y * SHOCKWAVE_PUSH_FORCE;
            }

            // CustomDogSprite 또는 일반 Sprite에 대한 타입 가드 (이 부분은 기존 로직 유지)
            const enemyCustom = enemySprite as CustomDogSprite;
            if (typeof enemyCustom.isKnockedBack !== 'undefined') {
                enemyCustom.isKnockedBack = true;
                this.time.delayedCall(KNOCKBACK_DURATION_MS, () => {
                    if (enemyCustom.active) {
                        enemyCustom.isKnockedBack = false;
                        // if (enemyCustom.body) enemyCustom.body.velocity.setTo(0, 0); // 필요시 넉백 후 속도 초기화
                    }
                });
            }
        }
    });
}

//물고기 아이템 획득 함수
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

//나비 아이템 획득 함수
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

//게임 오버 처리 함수
function endGame(this: Phaser.Scene) {
    if (gameOver) return;
    gameOver = true;
    console.log('Game Over!');
    this.physics.pause();
    this.time.removeAllEvents();

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const score = this.data.get('score') as number; // 현재 점수 가져오기
    const triggerGameOverModal = this.data.get('triggerGameOverModal') as (score: number) => void; // React에서 전달한 함수 가져오기

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

    // React 컴포넌트의 GameOverModal을 트리거합니다.
    if (triggerGameOverModal) {
        triggerGameOverModal(score); // 현재 점수를 전달
    }
}

//게임 재시작 함수
function restartGame(this: Phaser.Scene) {
    console.log('Restarting game...');
    gameOver = false;
    elapsedTime = 0;
    initialPinchDistance = 0;
    lastCameraZoom = 1;

    // 게임 상태 초기화
    this.data.set('score', 0); // 더 이상 사용하지 않음
    this.data.set('energy', INITIAL_PLAYER_ENERGY);
    this.data.set('isKnockedBack', false);
    this.data.set('shopOpened', false);
    this.data.set('skills', []); // 스킬도 초기화
    this.data.get('generatedChunks').clear(); // 생성된 청크 목록 초기화

    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    if (player) {
        player.setData('level', 1);
        player.setData('experience', 0); // 경험치 초기화
    }
    this.data.set('playerLevelValue', 1); // 레벨 값 초기화
    const playerLevelText = this.data.get('playerLevelText') as Phaser.GameObjects.Text;
    if (playerLevelText) {
        playerLevelText.setText('Level: 1'); // 레벨 텍스트 초기화
    }

    const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
    if (expBarFill) {
        expBarFill.clear(); // 경험치 바 초기화
        expBarFill.fillStyle(0xffd700, 1);
        expBarFill.fillRect(0, 0, 0, 10);
    }

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

    if (mice) mice.clear(true, true);
    if (dogs) dogs.clear(true, true);
    if (fishItems) fishItems.clear(true, true);
    if (butterflies) butterflies.clear(true, true);

    // 씬 재시작
    this.scene.restart();
}

//게임 업데이트 함수
function update(this: Phaser.Scene, time: number, delta: number) {
    if (gameOver) {
        return;
    }

    //먼저 각 요소를 정의한다
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const cursors = this.data.get('cursors') as Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    const isKnockedBack = this.data.get('isKnockedBack') as boolean;
    const isInvincible = player.getData('isInvincible') as boolean;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const skills = this.data.get('skills') as number[]; // skills 배열을 씬 데이터에서 가져옴
    const butterflies = this.data.get('butterflies') as Phaser.Physics.Arcade.Group; // 나비 그룹 가져오기
    let playerLevel = this.data.get('playerLevel') as number; // 플레이어 레벨 가져오기
    const experience = player.getData('experience') as number; // 플레이어 경험치 가져오기
    const levelThresholds: { [key: string]: number } = levelExperience.levelExperience; // 명시적인 타입 정의
    const experienceNeededForNextLevel = levelThresholds[String(playerLevel+1)] || Infinity;
    const nextLevelThreshold = levelThresholds[String(playerLevel + 1)] || Infinity;
    const shockwaveCooldownText = this.data.get('shockwaveCooldownText') as Phaser.GameObjects.Text;
    const shockwavePhaserEvent = this.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;
    let isShockwaveArmed = this.data.get('shockwaveArmed') as boolean; // Phaser 씬 데이터에서 읽어옴

    if (!player || !cursors) {
        return;
    }

    // 스킬 2 보유 시 속도 증가
    let currentPlayerSpeed = BASE_PLAYER_SPEED;
    if (skills.some(skill => skill >= 21 && skill <= 29)) {
        let skillLevel = skills.filter(skill => skill >= 21 && skill <= 29).sort((a, b) => b - a)[0];
        skillLevel = skillLevel - 20; // 21~29 범위의 스킬 레벨을 1~9로 변환
        let speedIncreaseFactor = 1 + (skillLevel * 0.1); // 10%씩 증가
        currentPlayerSpeed = BASE_PLAYER_SPEED * speedIncreaseFactor;
    }

    const playerSpeed = currentPlayerSpeed;
    let isMovingForAnimation = false;

    // 플레이어의 움직임과 애니메이션 처리
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

    // 플레이어 스프라이트 변경 (무적 시간)
    if (isInvincible) {
        player.setTexture('cat_hit'); // cat_hit 이미지 로드되어 있어야 함
    }

    // 플레이어 스프라이트 변경 (하악질)
    if (this.data.get('isHaak')) {
        player.setTexture('cat_haak'); // cat_haak 이미지 로드되어 있어야 함
    }

    // 애니메이션 처리
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
    const playerLevelValue = this.data.get('playerLevelValue') as number; // 현재 레벨 값 가져오기
    const expBarBg = this.data.get('expBarBg') as Phaser.GameObjects.Graphics;
    const expBarFill = this.data.get('expBarFill') as Phaser.GameObjects.Graphics;
    const expBarWidth = ENERGY_BAR_WIDTH; // create 함수에서 변경했으므로 여기도 동일하게 유지
    const expBarHeight = ENERGY_BAR_HEIGHT;


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

    //점수, 레벨, 타이머 텍스트 위치 설정 - 화면 중앙으로 이동
    scoreText.setScrollFactor(0);
    playerLevelText.setScrollFactor(0);
    timerText.setScrollFactor(0);
    // energyBarBg.setScrollFactor(0);
    // energyBarFill.setScrollFactor(0);

    scoreText.setPosition(this.cameras.main.width / 2, 20);
    playerLevelText.setPosition(this.cameras.main.width / 2, 50);
    playerLevelText.setText('Level: ' + playerLevelValue); // 텍스트 업데이트
    timerText.setPosition(this.cameras.main.width / 2, 80);
    // energyBarBg.x = this.cameras.main.width / 2 - (ENERGY_BAR_WIDTH / 2);
    // energyBarBg.y = 110;
    // energyBarFill.x = energyBarBg.x;
    // energyBarFill.y = energyBarBg.y;

    //에너지 바 위치 설정 - 플레이어 아래쪽으로 이동
    energyBarBg.x = player.x - (ENERGY_BAR_WIDTH / 2);
    energyBarBg.y = playerBottomY;
    energyBarFill.x = energyBarBg.x;
    energyBarFill.y = energyBarBg.y;

    // 경험치 바 위치 설정 - 에너지 바 아래
    expBarBg.x = player.x - (expBarWidth / 2);
    expBarBg.y = energyBarBg.y + expBarHeight + 5;
    expBarFill.x = expBarBg.x;
    expBarFill.y = expBarBg.y;

    // 경험치 바 업데이트
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

                // 사용자 입력 감지 로직으로 변경
                let triggerInputDetected = false;
                const isMobileDevice = this.data.get('isMobile') as boolean;
                const spaceKey = this.data.get('spaceKey') as Phaser.Input.Keyboard.Key;

                if (isMobileDevice) {
                    const pointer1Down = this.input.pointer1.isDown;
                    const pointer2Down = this.input.pointer2.isDown; // 두 번째 터치 포인트 확인
                    const isTwoFingerCurrentlyDown = pointer1Down && pointer2Down;
                    const wasTwoFingerDown = this.data.get('wasTwoFingerDown') as boolean;

                    if (isTwoFingerCurrentlyDown && !wasTwoFingerDown) {
                        // 두 손가락 터치가 "방금" 시작되었을 때
                        triggerInputDetected = true;
                    }
                    this.data.set('wasTwoFingerDown', isTwoFingerCurrentlyDown); // 현재 두 손가락 터치 상태 업데이트
                
                } else { // 데스크톱 환경
                    if (Phaser.Input.Keyboard.JustDown(spaceKey)) {
                        triggerInputDetected = true;
                    }
                    // 마우스 우클릭 감지 (activePointer 사용)
                    if (this.input.activePointer.rightButtonDown()) { 
                        // rightButtonDown은 누르고 있는 동안 계속 true이므로, 
                        // shockwaveArmed가 false로 바뀐 후 다음 프레임에서 재발동하지 않도록 armed 상태가 즉시 해제되어야 함.
                        triggerInputDetected = true;
                    }
                }

                if (triggerInputDetected) {
                    triggerShockwave.call(this, player); 
                    this.data.set('shockwaveArmed', false); 
                    isShockwaveArmed = false; // 현재 프레임 로직 반영
                    console.log('Armed shockwave triggered by user input.');
                    
                    // --- 쿨타임 리셋 로직 추가 ---
                    const shockwavePhaserEvent = this.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;
                    if (shockwavePhaserEvent) {
                        shockwavePhaserEvent.elapsed = 0; // 타이머의 경과 시간을 0으로 설정하여 쿨타임을 즉시 재시작
                    }
                    // --- 쿨타임 리셋 로직 끝 ---

                    // 2점 터치 상태 초기화 (연속 발동 방지)
                    if (isMobileDevice) {
                        this.data.set('wasTwoFingerDown', false); // 발동 후에는 이전 상태를 false로 설정하여 다음 터치 대기
                    }
                }
            } else if (shockwavePhaserEvent) { // 준비되지 않았고, 타이머가 존재하면 쿨타임 표시
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

    //쥐의 움직임 처리
    mice.getChildren().forEach((mouseObject) => {
        const mouse = mouseObject as Phaser.Physics.Arcade.Sprite;
        if (mouse.active && mouse.body) {
            // 쥐가 플레이어 주변으로 모이도록 유도
            const distanceToPlayer = Phaser.Math.Distance.Between(player.x, player.y, mouse.x, mouse.y);
            const fleeRadius = 200; // 200 픽셀 반경
            const gatheringRadius = 700; // 700 픽셀 반경 내에 있는 쥐만 모이도록 설정
            const gatheringSpeed = 70; // Gathering speed 조정

            if (distanceToPlayer < fleeRadius) {
            // 플레이어 위치로부터 반대 방향으로 도망
            const fleeX = mouse.x - (player.x - mouse.x);
            const fleeY = mouse.y - (player.y - mouse.y);
            this.physics.moveToObject(mouse, { x: fleeX, y: fleeY }, gatheringSpeed);
            }else if (distanceToPlayer > gatheringRadius) {
            // gatheringRadius 밖에 있는 쥐는 기존처럼 플레이어를 향해 이동
                this.physics.moveToObject(mouse, player, gatheringSpeed);
            }

            if (mouse.body.velocity.x < 0) {
            mouse.setFlipX(false);
            } else if (mouse.body.velocity.x > 0) {
            mouse.setFlipX(true);
            }
        }
    });

    //개의 움직임 처리
    dogs.getChildren().forEach((dogObject) => {

        let dogChaseSpeed = DOG_CHASE_SPEED * (1 + (playerLevel - 1) * 0.10) * (1 + Math.floor(elapsedTime / 30) * 0.5);
        const wanderSpeed = dogChaseSpeed * 1.3; // 흩어지는 속도

        const dog = dogObject as CustomDogSprite;
        if (dog.active && dog.body && !dog.isKnockedBack && !dog.isStunned) {
            let aiState = dog.getData('aiState') || 0; // 기본 상태는 0 (일반 추격)
            let strategicTimer = dog.getData('strategicTimer') || 0;

            if (aiState === 0 && Math.random() < 0.001) { // 낮은 확률 (0.1% 정도로 조정)로 전략적 움직임 시작
                dog.setData('aiState', 1);
                dog.setData('wanderTarget', new Phaser.Math.Vector2(dog.x + Phaser.Math.Between(-200, 200), dog.y + Phaser.Math.Between(-200, 200)));
                dog.setData('strategicTimer', 0); // 타이머 초기화
            }

            if (aiState === 0) {
                this.physics.moveToObject(dog, player, dogChaseSpeed);
            } else if (aiState === 1) {
                const wanderTarget = dog.getData('wanderTarget') as Phaser.Math.Vector2;

                if (Phaser.Math.Distance.Between(dog.x, dog.y, wanderTarget.x, wanderTarget.y) < 20) {
                    dog.setData('aiState', 2); // 목표 지점 도착 후 잠시 멈춤 상태로 변경
                    dog.setData('strategicTimer', 0);
                    dog.setVelocity(0);
                    dog.body.checkCollision.none = false; // 상태 변경 후 충돌 다시 활성화
                } else {
                    this.physics.moveToObject(dog, wanderTarget, wanderSpeed);
                }
            } else if (aiState === 2) {
                strategicTimer += delta;
                dog.setData('strategicTimer', strategicTimer);
                if (strategicTimer > 2000) { // 2초 후 원래 추격 상태로 복귀
                    dog.setData('aiState', 0);
                } else {
                    // // 잠시 멈춤
                    // if (dog.body) {
                    //     dog.setVelocity(0);
                    // }
                    return;
                }
            }

            // 겹침 방지 (기존 코드 유지)
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

            // 스프라이트 방향 업데이트 (기존 코드 유지)
            if (dog.body.velocity.x < 0) {
                dog.setFlipX(false);
            } else if (dog.body.velocity.x > 0) {
                dog.setFlipX(true);
            }
        }
    });

    //나비 불규칙 비행 로직
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
    const [currentLevel, setCurrentLevel] = useState(1); // 현재 레벨 상태 추가
    const [showGameOverModal, setShowGameOverModal] = useState(false); // 게임 오버 모달 상태
    const [finalScore, setFinalScore] = useState(0); // 게임 오버 시 점수 저장
    console.log('GameCanvas: skills from context:', skills); // skills 배열 확인

    useEffect(() => {
        const isClient = typeof window !== 'undefined';

        if (isClient && gameContainerRef.current && !gameRef.current) {
            console.log('Initializing Phaser game on client...');
            const { width, height, minWidthApplied } = getGameDimensions();
            
            const initialDataForScene: {
                minWidthApplied: boolean;
                openShopModal: (level: number, score: number, skills: number[], closeShop: () => void) => void; // closeShop 추가
                triggerGameOverModal: (score: number) => void; // 게임 오버 모달 트리거 함수
            } = {
                minWidthApplied: minWidthApplied,
                openShopModal: (level: number, score: number, skills: number[], closeShop: () => void) => { // closeShop 받음
                    console.log("React: openShopModal callback called from Phaser. Score:", score);
                    setShowShopModal(true);
                    setCurrentScore(score);
                    setCurrentLevel(level);
                    if (gameRef.current) {
                        gameRef.current.scene.pause('MainScene');
                    }
                },
                triggerGameOverModal: (score: number) => { // 게임 오버 모달 트리거 함수 정의
                    console.log("React: triggerGameOverModal callback called from Phaser. Score:", score);
                    setShowGameOverModal(true);
                    setFinalScore(score);
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
                    gameScene.data.set('triggerGameOverModal', initialDataForScene.triggerGameOverModal); // 트리거 함수 전달
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
            const scene = gameSceneRef.current;
            scene.data.set('skills', skills);
            scene.data.set('playerLevel', currentLevel); 
            scene.data.set('shopOpened', false); 

            // 스킬 3이 포함되었을 경우 에너지 최대치를 4로 변경하고 현재 에너지도 4로 설정
            if (skills.some(skill => skill >= 31 && skill <= 39)) {
                let skillLevel = skills.filter(skill => skill >= 31 && skill <= 39).sort((a, b) => b - a)[0];
                skillLevel = skillLevel - 30; // 31~39 범위의 스킬 레벨을 1~9로 변환
                const newMaxEnergy = 3 + skillLevel;
                scene.data.set('energy', newMaxEnergy);
                // INITIAL_PLAYER_ENERGY 상수도 업데이트 (선택 사항, 이후 에너지 관련 로직에서 사용될 수 있음)
                INITIAL_PLAYER_ENERGY = newMaxEnergy;
                console.log('근성장 스킬 획득! 최대 에너지 변경.');
            } else {
                // 스킬 3이 없는 경우 최대 에너지를 3으로 유지 (혹시 모를 상황 대비)
                INITIAL_PLAYER_ENERGY = 3;
            }

            // --- 충격파 스킬 타이머 관리 ---
            const hasShockwaveSkill = skills.includes(SHOCKWAVE_SKILL_ID);
            let shockwavePhaserEvent = scene.data.get('shockwavePhaserEvent') as Phaser.Time.TimerEvent | undefined;

            if (hasShockwaveSkill && !shockwavePhaserEvent) {
                scene.data.set('shockwaveArmed', false); // 스킬 활성화 시 준비 상태 초기화
                shockwavePhaserEvent = scene.time.addEvent({
                    delay: SHOCKWAVE_INTERVAL_MS,
                    callback: () => {
                        const player = scene.data.get('player') as Phaser.Physics.Arcade.Sprite;
                        const isGameOver = scene.data.get('gameOver') as boolean;
                        // 스킬이 여전히 활성화 상태인지, 게임오버가 아닌지, 플레이어가 유효한지 확인
                        if (player && player.active && !isGameOver && (scene.data.get('skills') as number[]).includes(SHOCKWAVE_SKILL_ID)) {
                            scene.data.set('shockwaveArmed', true); // 직접 발동 대신 준비 상태로 변경
                            console.log('Shockwave is ARMED!');
                        }
                    },
                    loop: true
                });
                scene.data.set('shockwavePhaserEvent', shockwavePhaserEvent);
                console.log(`Shockwave skill [${SHOCKWAVE_SKILL_ID}] cooldown timer started.`);
            } else if (!hasShockwaveSkill && shockwavePhaserEvent) {
                shockwavePhaserEvent.remove();
                scene.data.remove('shockwavePhaserEvent');
                scene.data.set('shockwaveArmed', false); // 스킬 비활성화 시 준비 상태 해제
                console.log(`Shockwave skill [${SHOCKWAVE_SKILL_ID}] deactivated, timer stopped.`);
            }
            // --- 충격파 스킬 타이머 관리 끝 ---

            console.log('Phaser scene skills updated:', skills);
        }
    }, [skills]);

    const closeShopModal = () => {
        setShowShopModal(false);
        if (gameRef.current && gameSceneRef.current) {
            gameRef.current.scene.resume('MainScene');
            gameSceneRef.current.data.set('shopOpened', false); // 상점 닫힐 때 플래그 초기화
        }
    };

    // Phaser 씬에서 재시작 버튼 클릭 시 호출될 함수 (props로 전달)
    const handleRestartGame = () => {
        if (gameSceneRef.current && gameSceneRef.current.scene) { // gameSceneRef.current와 gameSceneRef.current.scene이 유효한지 확인
            console.log('Attempting to restart Phaser scene...');
            gameSceneRef.current.scene.restart(); // Phaser 씬의 ScenePlugin을 통해 restart 호출
            
            // React Context의 skills 상태 초기화
            // 참고: 현재 skills를 초기화하는 로직이 비어있거나 불완전해 보입니다.
            // useSkills()에서 제공하는 초기화 함수가 있다면 그것을 사용하는 것이 좋습니다.
            // 예시: clearSkills(); 또는 setSkills([]);
            // 아래는 Phaser 씬 데이터의 스킬을 초기화하는 코드입니다.
            if (gameSceneRef.current.data) {
                 gameSceneRef.current.data.set('skills', []); // Phaser 씬의 skills 데이터 초기화
                 gameSceneRef.current.data.set('playerLevel', 1);
                 gameSceneRef.current.data.set('score', 0);
                 gameSceneRef.current.data.set('energy', INITIAL_PLAYER_ENERGY); // INITIAL_PLAYER_ENERGY는 스킬에 따라 변경될 수 있으므로, 초기값으로 리셋 필요
                 // 기타 게임 상태 초기화 (Phaser의 restartGame 함수 내의 로직과 유사하게)
                 gameSceneRef.current.data.set('shopOpened', false);
                 const generatedChunks = gameSceneRef.current.data.get('generatedChunks');
                 if (generatedChunks && typeof generatedChunks.clear === 'function') {
                    generatedChunks.clear();
                 }
            }

            setShowGameOverModal(false); // 게임 오버 모달 닫기

            // 씬이 실제로 재시작되고 준비된 후 resume을 호출하는 것이 더 안정적일 수 있지만,
            // Phaser의 restart는 내부적으로 기존 씬을 종료하고 새로 시작하므로,
            // pause된 상태였다면 resume이 필요할 수 있습니다.
            // 다만, restart()가 호출되면 씬은 이미 active 상태로 돌아가므로 resume이 불필요하거나 오류를 유발할 수 있습니다.
            // 우선 아래 resume 로직은 주석 처리하고 테스트해보시는 것을 권장합니다.
            /*
            if (gameRef.current && gameRef.current.scene.isPaused('MainScene')) {
                 console.log('Resuming MainScene after restart attempt.');
                 gameRef.current.scene.resume('MainScene');
            }
            */
        } else {
            console.error("gameSceneRef.current or gameSceneRef.current.scene is null, cannot restart game.");
        }
    };

    return (
        <div id="game-container" ref={gameContainerRef} style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <ShopModal isVisible={showShopModal} onClose={closeShopModal} level={currentLevel} skills={skills} />
            <GameOverModal
            isVisible={showGameOverModal}
            onClose={() => { // GameOverModal의 '재시작' 버튼 클릭 시 이 함수가 호출됩니다.
                handleRestartGame();
                // setShowGameOverModal(false); // handleRestartGame 내부에서 처리하도록 변경
            }}
            score={finalScore}
            onSave={(name: string) => {
                console.log(`Saving score with name: ${name}`);
                // 저장 후 재시작 또는 모달만 닫기 등의 로직 추가 가능
            }}
            />
            {/* Phaser 씬의 재시작 버튼 대신 React 버튼을 사용할 수도 있습니다. */}
            {/* <button onClick={handleRestartGame}>Restart Game (React)</button> */}
        </div>
    );
};

export default GameCanvas;

