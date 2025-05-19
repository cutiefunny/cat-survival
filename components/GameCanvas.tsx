'use client';

import React, { useEffect, useRef } from 'react';
// Corrected import: Import the entire module as a namespace alias 'Phaser'
import * as Phaser from 'phaser';

// Optional: Log the imported Phaser object to inspect its structure
// This log is primarily for debugging the import itself.
// If it still causes issues during SSR, consider moving it inside useEffect
// or removing it after confirming the import works.
// console.log('Imported Phaser module content:', Phaser); // Moved this log to useEffect if needed for SSR safety


// 디바이스 종류에 따라 논리적 크기 결정 함수 (사용자가 제공한 코드)
function getGameDimensions() {
    // 화면의 실제 크기를 감지하여 논리적 크기를 동적으로 결정
    if (typeof window !== 'undefined') {
        const maxWidth = 2400;
        const maxHeight = 1600;
        const minWidth = 300;
        const minHeight = 400;
        // 가로/세로 비율 유지 (4:3 또는 3:4)
        let width = Math.max(minWidth, Math.min(window.innerWidth, maxWidth));
        let height = Math.max(minHeight, Math.min(window.innerHeight, maxHeight));
        // 모바일 환경 감지 (사용되지 않지만 코드는 유지)
        // const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
        // 비율 유지하지 않고, width/height를 그대로 사용
        return { width, height };
    }
    // SSR 등 window가 없을 때 기본값
    return { width: 800, height: 600 };
}


// 게임 설정 객체의 일부 (width, height는 useEffect에서 동적으로 설정)
const baseConfig: Omit<Phaser.Types.Core.GameConfig, 'width' | 'height'> = {
    type: Phaser.AUTO,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 }, // 중력 없음 (탑다운 게임)
            debug: false // 개발 중에는 true로 설정하여 물리 바디 확인
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    parent: 'game-container', // 게임 캔버스가 삽입될 DOM 엘리먼트의 ID
    scale: {
        mode: Phaser.Scale.RESIZE, // 부모 컨테이너 크기에 맞게 캔버스 크기 조정
        // autoCenter는 RESIZE 모드에서 사용되지 않습니다.
        // width, height 속성은 useEffect에서 동적으로 설정됩니다.
    }
};

// 게임 변수 선언 (컴포넌트 스코프 또는 씬 내부에서 관리)
// 여기서는 씬 함수 내에서 this를 통해 접근하도록 구성합니다.
let gameOver = false; // 게임 오버 상태를 추적하는 변수
let elapsedTime = 0; // 경과 시간 (초)

// 핀치 줌 관련 변수
let initialPinchDistance = 0;
let lastCameraZoom = 1;
const MIN_ZOOM = 0.5; // 최소 줌 레벨
const MAX_ZOOM = 2.0; // 최대 줌 레벨


// 리소스 로딩 함수
function preload(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 플레이어 스프라이트 시트 로드 (유지)
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });

    // 기존 애니메이션 스프라이트 시트 로드 (유지)
    this.load.spritesheet('animation_sprite', 'https://phaser.io/examples/assets/sprites/metalslug_mummy37x45.png', { frameWidth: 37, frameHeight: 45 });

    // 적 캐릭터 스프라이트 시트 이미지 로드 (마우스)
    this.load.spritesheet('mouse_enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });

    // !!! 새로운 적 캐릭터 스프라이트 시트 이미지 로드 (개) !!!
    // '/images/dog_2frame_horizontal.png' 경로에서 2프레임 스프라이트 시트를 로드합니다.
    // 'dog_enemy_sprite'는 이 스프라이트 시트를 참조할 키입니다.
    // { frameWidth: 100, frameHeight: 100 }는 스프라이트 시트 내 각 프레임의 크기입니다.
    // 이 값은 실제 'dog_2frame_horizontal.png' 이미지에 맞춰 정확하게 설정해야 합니다.
    this.load.spritesheet('dog_enemy_sprite', '/images/dog_2frame_horizontal.png', { frameWidth: 100, frameHeight: 100 });


    // 배경 이미지 또는 타일맵 로드 (선택 사항)
    // this.load.image('background', 'assets/background.png');
    // this.load.tilemapTiledJSON('map', 'assets/map.json');
}

// 게임 객체 생성 및 초기화 함수
function create(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 게임 오버 상태 초기화
    gameOver = false;
    elapsedTime = 0; // 경과 시간 초기화
    initialPinchDistance = 0; // 핀치 줌 변수 초기화
    lastCameraZoom = 1; // 핀치 줌 변수 초기화


    // 배경 설정
    this.cameras.main.setBackgroundColor('#ffffff'); // 배경색을 흰색으로 변경

    // !!! 모바일 감지 및 스프라이트 스케일 팩터 설정 !!!
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;
    const spriteScaleFactor = isMobile ? 0.7 : 1.0; // 모바일이면 70% 스케일, 아니면 100%


    // 플레이어 생성
    // 게임의 논리적 중앙 좌표는 this.game.config.width / 2, this.game.config.height / 2 입니다.
    const player = this.physics.add.sprite(this.game.config.width as number / 2, this.game.config.height as number / 2, 'player_sprite');
    player.setCollideWorldBounds(true);
    // !!! 플레이어 스케일에 스케일 팩터 적용 !!!
    player.setScale(0.5 * spriteScaleFactor);
    player.setDrag(500);

    // 플레이어 애니메이션 생성 (기존 코드 유지)
    this.anims.create({
        key: 'cat_walk',
        frames: this.anims.generateFrameNumbers('player_sprite', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1
    });
    player.setFrame(0);


    // 마우스 적 애니메이션 생성 (기존 코드 유지)
    this.anims.create({
        key: 'mouse_walk', // 애니메이션 이름
        frames: this.anims.generateFrameNumbers('mouse_enemy_sprite', { start: 0, end: 1 }), // 0번부터 1번까지 2프레임 사용
        frameRate: 8, // 초당 8프레임 속도 (조정 가능)
        repeat: -1 // 무한 반복
    });

     // !!! 개 적 애니메이션 생성 !!!
     this.anims.create({
        key: 'dog_walk', // 애니메이션 이름
        frames: this.anims.generateFrameNumbers('dog_enemy_sprite', { start: 0, end: 1 }), // 0번부터 1번까지 2프레임 사용
        frameRate: 6, // 초당 6프레임 속도 (조정 가능)
        repeat: -1 // 무한 반복
    });


    // 적 그룹 생성 (마우스, 기존 코드 유지)
    const mice = this.physics.add.group();

    // !!! 새로운 적 그룹 생성 (개) !!!
    const dogs = this.physics.add.group();


    // 간단한 적 생성 (마우스, 예시: 1초마다 적 생성)
    this.time.addEvent({
        delay: 1000,
        callback: () => spawnMouse.call(this, mice, player), // 스케일 팩터는 spawnMouse에서 직접 감지
        callbackScope: this,
        loop: true
    });

    // !!! 개 적 생성 초기 설정 및 타이머 이벤트 (5초마다, 생성 수 증가) !!!
    const initialDogSpawnCount = 1; // 시작 시 생성할 개 수
    this.data.set('dogsToSpawn', initialDogSpawnCount); // 씬 데이터에 현재 생성할 개 수 저장

    this.time.addEvent({
        delay: 5000, // 5초마다 이벤트 발생
        callback: () => {
            // 게임 오버 상태이면 적 생성하지 않음
            if (gameOver) return;

            let dogsToSpawn = this.data.get('dogsToSpawn');
            console.log(`Spawning ${dogsToSpawn} dogs.`);
            for (let i = 0; i < dogsToSpawn; i++) {
                 spawnDog.call(this, dogs, player); // 현재 설정된 수만큼 개 생성, 스케일 팩터는 spawnDog에서 직접 감지
            }

            // !!! 다음 이벤트에서 생성할 개 수 증가 (2개씩) !!!
            dogsToSpawn += 2;
            // 최대 생성 수 제한 (선택 사항)
            // const maxCount = 32; // 예시: 최대 32마리
            // dogsToSpawn = Math.min(maxCount, dogsToSpawn);
            this.data.set('dogsToSpawn', dogsToSpawn);
            console.log(`Number of dogs to spawn for next event will be: ${dogsToSpawn}`);
        },
        callbackScope: this,
        loop: true
    });

    // !!! 개 생성 수 증가 타이머 이벤트는 제거됨 !!!


    // 키보드 입력 설정 (유지하되, 터치 입력이 우선하도록 update에서 처리)
    const cursors = this.input.keyboard?.createCursorKeys();

    // !!! 터치 입력 활성화 (기본적으로 활성화되어 있지만 명시적으로 확인) !!!
    this.input.addPointer(1); // 두 번째 포인터 활성화 (핀치 줌용)
    this.input.addPointer(2); // 세 번째 포인터 활성화 (혹시 모를 경우 대비)


    // 충돌 감지 설정 (플레이어 vs 마우스, 기존 코드 유지)
    this.physics.add.collider(player, mice, hitMouse as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // hitEnemy -> hitMouse로 이름 변경

    // !!! 충돌 감지 설정 (플레이어 vs 개) !!!
    this.physics.add.collider(player, dogs, hitDog as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this); // 새로운 hitDog 함수


    // 점수 표시 텍스트 (예시, 기존 코드 유지)
    // RESIZE 모드에서는 카메라 이동에 따라 UI가 움직일 수 있으므로 setScrollFactor(0) 유지
    const scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', color: '#000000' }); // 텍스트 색상을 검정으로 변경
    scoreText.setScrollFactor(0);

    // !!! 게임 시간 표시 텍스트 추가 !!!
    const timerText = this.add.text(
        this.cameras.main.width - 16, // 카메라 우측 끝에서 16px 왼쪽
        16, // 상단에서 16px 아래
        'Time: 0s',
        { fontSize: '32px', color: '#000000' }
    );
    timerText.setOrigin(1, 0); // 우측 상단 기준으로 정렬
    timerText.setScrollFactor(0); // 카메라 이동에 따라 움직이지 않도록 고정

    // !!! 1초마다 경과 시간 업데이트 타이머 이벤트 추가 !!!
    this.time.addEvent({
        delay: 1000, // 1000ms = 1초마다
        callback: () => {
            if (!gameOver) { // 게임 오버 상태가 아닐 때만 시간 증가
                elapsedTime++;
                timerText.setText('Time: ' + elapsedTime + 's');
            }
        },
        callbackScope: this,
        loop: true
    });


    // !!! 게임 오버 텍스트 추가 (초기에는 숨김) !!!
    // 게임 월드 중앙 대신 뷰포트 중앙에 가깝게 배치하려면 카메라의 getCenterX/Y 사용
    const gameOverText = this.add.text(
        this.cameras.main.centerX, // 카메라 중앙 X
        this.cameras.main.centerY, // 카메라 중앙 Y
        'Game Over',
        { fontSize: '64px', color: '#ff0000' }
    );
    gameOverText.setOrigin(0.5); // 텍스트 중앙 정렬
    gameOverText.setScrollFactor(0); // 카메라 이동에 따라 움직이지 않도록 고정
    gameOverText.setVisible(false); // 초기에는 보이지 않도록 설정


    // 기존 애니메이션이 적용된 스프라이트 객체 생성 및 애니메이션 재생 (유지)
    // const animatedSprite = this.add.sprite(100, 300, 'animation_sprite');
    // animatedSprite.play('walking');


    // 씬의 데이터를 저장하여 update 함수 등에서 접근할 수 있도록 합니다.
    // 또는 각 객체를 직접 변수에 할당하여 클로저를 통해 접근하게 할 수도 있습니다.
    this.data.set('player', player);
    this.data.set('mice', mice); // 적 그룹 이름 변경
    this.data.set('dogs', dogs); // 개 적 그룹 추가
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('scoreText', scoreText);
    this.data.set('timerText', timerText); // 타이머 텍스트 저장
    this.data.set('gameOverText', gameOverText); // 게임 오버 텍스트 저장
    // this.data.set('animatedSprite', animatedSprite); // 사용하지 않는 애니메이션 스프라이트 제거
    this.data.set('spriteScaleFactor', spriteScaleFactor); // 스케일 팩터 저장


    // 카메라가 플레이어를 따라다니도록 설정 (선택 사항, 뱀파이어 서바이벌 스타일)
    this.cameras.main.startFollow(player, true, 0.05, 0.05); // 플레이어를 부드럽게 따라다니도록 설정

    // 캔버스 크기 변경 시 호출될 이벤트 리스너 (디버깅용, 유지)
    this.scale.on('resize', (gameSize: Phaser.Structs.Size, baseSize: Phaser.Structs.Size, displaySize: Phaser.Structs.Size, previousWidth: number, previousHeight: number) => {
        console.log("Canvas Resized!");
        // 이제 gameSize.width/height는 현재 설정된 논리적 크기입니다.
        console.log("Game Size (Logical):", gameSize.width, gameSize.height);
        console.log("Display Size (Actual Canvas):", displaySize.width, displaySize.height); // 실제 캔버스 픽셀 크기
        console.log("Previous Size:", previousWidth, previousHeight);
        console.log("Current Scale Factors:", this.scale.displayScale.x, this.scale.displayScale.y);

         // 게임 오버 텍스트 및 타이머 텍스트 위치 업데이트 (resize 이벤트에서 UI 위치 조정)
         const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
         if (gameOverText) {
             gameOverText.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
         }
         const timerText = this.data.get('timerText') as Phaser.GameObjects.Text;
         if (timerText) {
             // 카메라의 현재 너비를 사용하여 우측 상단 위치 조정
             timerText.setPosition(this.cameras.main.width - 16, 16);
         }
    });

    // Log initial scale factors (유지)
    console.log("Initial Scale Factors:", this.scale.displayScale.x, this.scale.displayScale.y);

    // !!! 핀치 줌 이벤트 리스너 설정 (모바일에서만) !!!
    if (isMobile) {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 두 번째 포인터가 내려갔을 때 초기 거리 계산
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                initialPinchDistance = Phaser.Math.Distance.Between(
                    this.input.pointer1.x, this.input.pointer1.y,
                    this.input.pointer2.x, this.input.pointer2.y
                );
                lastCameraZoom = this.cameras.main.zoom; // 현재 카메라 줌 상태 저장
                console.log("Two pointers down. Initial pinch distance:", initialPinchDistance);
            }
        });

        // pointerup 이벤트에서는 특별한 처리가 필요 없지만, 디버깅을 위해 남겨둘 수 있습니다.
        // this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        //     if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) {
        //         initialPinchDistance = 0; // 두 포인터 모두 떨어지면 초기 거리 초기화
        //         console.log("Both pointers up. Resetting pinch distance.");
        //     }
        // });
    }
}

// 개 생성 수 증가 함수는 제거됨


// 적 생성 함수 (마우스, 이름 변경)
function spawnMouse(this: Phaser.Scene, mice: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) // TypeScript에서 this와 인자 타입 명시
{
    // 게임 오버 상태이면 적 생성하지 않음
    if (gameOver) return;

    // 화면 가장자리 중 한 곳에서 무작위로 적 생성
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;

    // 게임의 논리적인 게임 월드 크기를 기준으로 위치 계산
    const gameWidth = this.game.config.width as number;
    const gameHeight = this.game.config.height as number;


    switch (edge) {
        case 0: // 상단
            x = Phaser.Math.Between(0, gameWidth);
            y = -50;
            break;
        case 1: // 하단
            x = Phaser.Math.Between(0, gameWidth);
            y = gameHeight + 50;
            break;
        case 2: // 좌측
            x = -50;
            y = Phaser.Math.Between(0, gameHeight);
            break;
        case 3: // 우측
            x = gameWidth + 50;
            y = Phaser.Math.Between(0, gameHeight);
            break;
        default: // 기본값 처리 (필요에 따라)
             x = 0; y = 0;
             break;
    }

    // !!! 마우스 스프라이트 생성 및 그룹에 추가 !!!
    const mouse = mice.create(x, y, 'mouse_enemy_sprite') as Phaser.Physics.Arcade.Sprite; // 타입 단언
    mouse.setBounce(0.2);
    mouse.setCollideWorldBounds(false);
    // !!! 마우스 스케일에 스케일 팩터 적용 !!!
    const spriteScaleFactor = this.data.get('spriteScaleFactor') as number;
    mouse.setScale((32 / 100) * spriteScaleFactor); // 가로/세로 비율 유지하며 스케일 조정

    // !!! 마우스 애니메이션 재생 !!!
    mouse.play('mouse_walk');

    // 마우스가 플레이어를 향해 이동하도록 설정
    this.physics.moveToObject(mouse, player, 50);
}

// !!! 새로운 적 생성 함수 (개) !!!
function spawnDog(this: Phaser.Scene, dogs: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) // TypeScript에서 this와 인자 타입 명시
{
    // 게임 오버 상태이면 적 생성하지 않음
    if (gameOver) return;

     // 화면 가장자리 중 한 곳에서 무작위로 적 생성 (마우스와 동일 로직)
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;

    // 게임의 논리적인 게임 월드 크기를 기준으로 위치 계산
    const gameWidth = this.game.config.width as number;
    const gameHeight = this.game.config.height as number;


    switch (edge) {
        case 0: // 상단
            x = Phaser.Math.Between(0, gameWidth);
            y = -50;
            break;
        case 1: // 하단
            x = Phaser.Math.Between(0, gameWidth);
            y = gameHeight + 50;
            break;
        case 2: // 좌측
            x = -50;
            y = Phaser.Math.Between(0, gameHeight);
            break;
        case 3: // 우측
            x = gameWidth + 50;
            y = Phaser.Math.Between(0, gameHeight);
            break;
        default: // 기본값 처리 (필요에 따라)
             x = 0; y = 0;
             break;
    }

    // !!! 개 스프라이트 생성 및 그룹에 추가 !!!
    const dog = dogs.create(x, y, 'dog_enemy_sprite') as Phaser.Physics.Arcade.Sprite; // 타입 단언
    dog.setBounce(0.2);
    dog.setCollideWorldBounds(false);
    // !!! 개 스케일에 스케일 팩터 적용 !!!
    const spriteScaleFactor = this.data.get('spriteScaleFactor') as number;
    dog.setScale(0.5 * spriteScaleFactor); // 개 캐릭터 크기 조정 (예시)

    // !!! 개 애니메이션 재생 !!!
    dog.play('dog_walk');

    // !!! 개 이동 로직: 50% 확률로 플레이어 추적, 50% 확률로 무작위 이동 및 속도 변화 !!!
    const normalDogSpeed = 150; // 일반 개 이동 속도
    const fastDogSpeed = 400; // 매우 빠른 개 이동 속도 (값 조정 가능)
    const chaseChance = 0.5; // 플레이어 추적 확률 (50%)
    const fastChance = 0.1; // 매우 빠른 개가 될 확률 (10%, 값 조정 가능)

    let currentDogSpeed = normalDogSpeed;

    // 매우 빠른 개가 될 확률 체크
    if (Math.random() < fastChance) {
        currentDogSpeed = fastDogSpeed;
        console.log("Spawning a FAST dog!");
    }


    if (Math.random() < chaseChance) {
        // 50% 확률로 플레이어 추적
        this.physics.moveToObject(dog, player, currentDogSpeed); // 결정된 속도 사용
        console.log("Dog chasing player with speed:", currentDogSpeed);
    } else {
        // 50% 확률로 무작위 방향 이동
        dog.setVelocity(Phaser.Math.Between(-currentDogSpeed, currentDogSpeed), Phaser.Math.Between(-currentDogSpeed, currentDogSpeed)); // 결정된 속도 사용
        console.log("Dog moving randomly with speed:", currentDogSpeed);
    }
}


// 플레이어와 마우스 충돌 시 실행되는 함수 (이름 변경)
function hitMouse(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite, // Player는 Arcade Sprite일 것으로 예상
    mouse: Phaser.Physics.Arcade.Sprite // Mouse는 Arcade Sprite일 것으로 예상
)
{
    // 게임 오버 상태이면 충돌 처리하지 않음
    if (gameOver) return;

    console.log("Collision detected! Player hit by mouse!");
    console.log("Player object:", player);
    console.log("Mouse object:", mouse);
    console.log("Mouse has body:", mouse.body); // mouse 객체에 body 속성이 있는지 로그

    // 충돌한 마우스 제거
    if (mouse && mouse.body && (mouse as any).disableBody) {
         console.log("Disabling mouse body.");
        (mouse as any).disableBody(true, true);
    } else {
        console.warn("Attempted to disable body on an object without a physics body or disableBody method:", mouse);
    }

    // 점수 증가 (예시)
    let score = this.data.get('score');
    score += 10;
    this.data.set('score', score);
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text; // 타입 단언
    scoreText.setText('Score: ' + score);

    // TODO: 플레이어 체력 감소 또는 게임 오버 로직 추가
}

// !!! 새로운 플레이어와 개 충돌 시 실행되는 함수 !!!
function hitDog(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite, // Player는 Arcade Sprite일 것으로 예상
    dog: Phaser.Physics.Arcade.Sprite // Dog는 Arcade Sprite일 것으로 예상
)
{
    // 게임 오버 상태이면 충돌 처리하지 않음
    if (gameOver) return;

    console.log("Collision detected! Player hit by dog!");
    console.log("Player object:", player);
    console.log("Dog object:", dog);
    console.log("Dog has body:", dog.body); // dog 객체에 body 속성이 있는지 로그

    // 충돌한 개 제거 (또는 다른 처리)
    if (dog && dog.body && (dog as any).disableBody) {
         console.log("Disabling dog body.");
        (dog as any).disableBody(true, true);
    } else {
        console.warn("Attempted to disable body on an object without a physics body or disableBody method:", dog);
    }

    // !!! 점수 감소 (100점 차감) !!!
    let score = this.data.get('score');
    score -= 100; // 점수 100점 감소
    this.data.set('score', score);
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text; // 타입 단언
    scoreText.setText('Score: ' + score);

    // !!! 게임 오버 조건 확인 !!!
    if (score < 0) {
        console.log("Score dropped below 0. Game Over!");
        // 게임 오버 처리 함수 호출
        endGame.call(this); // 씬 컨텍스트를 전달하여 호출
    }

    // TODO: 플레이어 체력 감소 로직 추가
}

// !!! 게임 오버 처리 함수 !!!
function endGame(this: Phaser.Scene) {
    // 이미 게임 오버 상태이면 중복 실행 방지
    if (gameOver) return;

    gameOver = true; // 게임 오버 상태로 설정

    console.log("Game Over!");

    // 물리 엔진 중지
    this.physics.pause();

    // 모든 타이머 이벤트 중지 (적 생성 등)
    this.time.removeAllEvents();

    // 플레이어 애니메이션 정지 및 프레임 고정 (선택 사항)
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    if (player) {
        player.stop();
        // player.setFrame(적절한 게임 오버 프레임); // 게임 오버 시 표시할 프레임 설정
    }

    // 모든 적 움직임 중지 (물리 엔진 중지로 대부분 멈추지만 명시적으로)
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group;
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group;
    if (mice) mice.getChildren().forEach((mouse) => (mouse.body as any)?.stop());
    if (dogs) dogs.getChildren().forEach((dog) => (dog.body as any)?.stop());


    // 게임 오버 텍스트 표시
    const gameOverText = this.data.get('gameOverText') as Phaser.GameObjects.Text;
    if (gameOverText) {
        gameOverText.setVisible(true);
    }

    // TODO: 게임 재시작 버튼 추가
    // TODO: 최종 점수 표시
}


// 게임 루프 함수
function update(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 게임 오버 상태이면 update 로직 실행하지 않음
    if (gameOver) {
        return;
    }

    // 씬 데이터에서 객체 가져오기
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const mice = this.data.get('mice') as Phaser.Physics.Arcade.Group; // 마우스 그룹 가져오기
    const dogs = this.data.get('dogs') as Phaser.Physics.Arcade.Group; // 개 그룹 가져오기
    // 키보드 입력 객체
    const cursors = this.data.get('cursors') as Phaser.Types.Input.Keyboard.CursorKeys | undefined;

    // 모바일 환경 감지
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS;

    if (!player || !cursors || !mice || !dogs) {
        // 객체가 아직 생성되지 않았거나 유효하지 않으면 업데이트 스킵
        return;
    }

    // 플레이어 이동 처리
    const playerSpeed = 200;
    let isMoving = false;

    player.setVelocity(0); // 매 프레임 속도 초기화

    // !!! 입력 방식 분리: 모바일 핀치 줌 > 모바일 터치 이동 > PC 키보드 !!!

    if (isMobile && this.input.pointer1.isDown && this.input.pointer2.isDown) {
         // !!! 모바일 환경에서 두 손가락(포인터)이 눌려있는 경우 (핀치 줌) !!!
         const currentPinchDistance = Phaser.Math.Distance.Between(
             this.input.pointer1.x, this.input.pointer1.y,
             this.input.pointer2.x, this.input.pointer2.y
         );

         if (initialPinchDistance === 0) {
             // 핀치 시작 시 초기 거리 저장
             initialPinchDistance = currentPinchDistance;
             lastCameraZoom = this.cameras.main.zoom;
         } else {
             // 현재 거리와 초기 거리의 비율로 줌 레벨 계산
             let zoomFactor = currentPinchDistance / initialPinchDistance;

             // 이전 줌 레벨에 비율을 곱하여 새로운 줌 레벨 설정
             let newZoom = lastCameraZoom * zoomFactor;

             // 줌 레벨 제한 적용
             newZoom = Phaser.Math.Clamp(newZoom, MIN_ZOOM, MAX_ZOOM);

             // 카메라 줌 적용
             this.cameras.main.setZoom(newZoom);

             // 다음 프레임을 위해 현재 줌 상태 저장 (상대적인 줌 변화를 위해)
             // initialPinchDistance = currentPinchDistance; // 이 라인은 필요에 따라 활성화하여 절대적인 줌 변화를 적용할 수도 있습니다. 현재는 상대 변화 방식
             // lastCameraZoom = newZoom; // 이 라인은 상대 변화 방식에서는 필요 없습니다.
         }

         isMoving = false; // 핀치 줌 중에는 이동하지 않음

    } else if (this.input.activePointer.isDown) {
        // 터치 또는 마우스 클릭이 활성화된 경우 (모바일 싱글 터치 또는 PC 클릭)
        // 두 포인터가 모두 떨어졌거나 PC 환경인 경우 이 블록 실행
        if (isMobile && (!this.input.pointer1.isDown || !this.input.pointer2.isDown)) {
             // 모바일에서 한 손가락만 남았거나 모두 떨어진 경우, 핀치 상태 초기화
             initialPinchDistance = 0;
             // lastCameraZoom = this.cameras.main.zoom; // 필요에 따라 현재 줌 상태 저장
        }

        isMoving = true;

        // !!! 포인터 스크린 좌표를 게임 월드 좌표로 수동 변환 !!!
        // 이 부분은 이전 수정에서 추가된 정확도 향상 로직입니다.
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.clientWidth / (this.game.config.width as number);
        const scaleY = canvas.clientHeight / (this.game.config.height as number);

        // 캔버스 내에서의 포인터 상대 좌표
        const pointerCanvasX = this.input.activePointer.x - rect.left;
        const pointerCanvasY = this.input.activePointer.y - rect.top;

        // 게임 월드 좌표로 변환 (스케일링 및 카메라 스크롤 고려)
        // 카메라 스크롤은 이미 player.x/y에 반영되어 있으므로,
        // 포인터 위치는 카메라 기준으로 변환 후 플레이어 위치에 더해줍니다.
        // 또는 단순히 스케일링된 좌표를 사용하고 moveToObject가 카메라를 따라가도록 둡니다.
        // 여기서는 Scale Manager의 worldX/worldY가 부정확한 문제를 우회하기 위해
        // 캔버스 내 상대 좌표를 논리적 게임 크기에 비례하여 변환합니다.
        const targetWorldX = pointerCanvasX / scaleX + this.cameras.main.scrollX;
        const targetWorldY = pointerCanvasY / scaleY + this.cameras.main.scrollY;

        // 디버깅 로그 추가 (수동 변환 좌표 확인)
        // if (this.game.loop.frame % 30 === 0) {
        //     console.log(`Manual World Coords: x=${targetWorldX}, y=${targetWorldY}`);
        //     console.log(`Canvas Rect: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
        //     console.log(`Calculated Scales: x=${scaleX}, y=${scaleY}`);
        // }


        // 포인터 위치로 플레이어 이동 (수동 변환된 좌표 사용)
        this.physics.moveToObject(player, { x: targetWorldX, y: targetWorldY }, playerSpeed);


        // 이동 방향에 따라 플레이어 반전 및 애니메이션 처리 (수동 변환된 좌표 사용)
        if (targetWorldX < player.x) {
            player.setFlipX(false); // 왼쪽 이동 시 반전 해제 (기본 방향이 왼쪽이라고 가정)
        } else if (targetWorldX > player.x) {
            player.setFlipX(true); // 오른쪽 이동 시 반전 적용
        }

         // 목표 지점 근처에 도달하면 멈추도록 설정 (수동 변환된 좌표 사용)
         const distance = Phaser.Math.Distance.Between(player.x, player.y, targetWorldX, targetWorldY);
         if (distance < 5) { // 5픽셀 이내로 가까워지면
             if (player.body) {
                 player.body.stop(); // 물리 바디 정지
             }
             isMoving = false; // 움직임 상태 해제
         }

    } else if (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown) {
        // 터치/마우스 입력이 없고 키보드 입력이 있는 경우 (주로 PC)
        isMoving = true;
        // 키보드 입력에 따른 플레이어 이동
        if (cursors.left.isDown) {
            player.setVelocityX(-playerSpeed);
            player.setFlipX(false); // 왼쪽 이동 시 반전 해제
        } else if (cursors.right.isDown) {
            player.setVelocityX(playerSpeed);
            player.setFlipX(true); // 오른쪽 이동 시 반전 적용
        }

        if (cursors.up.isDown) {
            player.setVelocityY(-playerSpeed);
        } else if (cursors.down.isDown) {
            player.setVelocityY(playerSpeed);
        }

        // 대각선 이동 시 속도 보정 (선택 사항)
        if (player.body instanceof Phaser.Physics.Arcade.Body) {
             player.body.velocity.normalize().scale(playerSpeed);
        }

    } else {
        // 키 입력이 없을 때 (가만히 있을 때)
        isMoving = false;
        player.stop(); // 현재 애니메이션 정지
        player.setFrame(0); // 1번 프레임 (인덱스 0)으로 설정
    }

    // 움직이는 상태일 때만 애니메이션 재생
    if (isMoving) {
         player.play('cat_walk', true); // 이미 재생 중이면 무시
    }


    // 마우스 적 캐릭터 좌우 반전 로직 (기존 코드 유지)
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

    // 개 적 캐릭터 좌우 반전 로직 및 이동 업데이트 (기존 코드 유지)
    dogs.getChildren().forEach((dogObject) => {
        const dog = dogObject as Phaser.Physics.Arcade.Sprite;
        if (dog.body instanceof Phaser.Physics.Arcade.Body) {
            // 개는 무작위 속도로 움직이므로 속도 방향에 따라 반전
            if (dog.body.velocity.x < 0) {
                dog.setFlipX(false);
            } else if (dog.body.velocity.x > 0) {
                dog.setFlipX(true);
            }

            // TODO: 개 캐릭터의 이동 패턴 업데이트 로직 추가 (예: 일정 시간마다 방향 변경)
            // 현재는 spawnDog에서 설정된 초기 무작위 속도로 계속 이동합니다.
        }
    });


    // TODO: 자동 공격 로직 구현
    // TODO: 적들의 플레이어 추적 또는 다른 이동 패턴 구현
    // TODO: 아이템 드롭 및 획득 로직 구현
    // TODO: UI 업데이트 (체력 바 등)
}


// React 컴포넌트 정의
const GameCanvas: React.FC = () => {
    // 게임 캔버스가 삽입될 DOM 엘리먼트를 참조하기 위한 ref
    const gameContainerRef = useRef<HTMLDivElement>(null);
    // Phaser 게임 인스턴스를 저장하기 위한 ref
    const gameRef = useRef<Phaser.Game | null>(null);

    useEffect(() => {
        // 컴포넌트가 마운트될 때 게임 초기화
        // isClient 변수를 사용하여 클라이언트 환경인지 확인합니다.
        // next/dynamic { ssr: false }를 사용하면 이 검사가 불필요할 수 있지만, 안전을 위해 유지합니다.
        const isClient = typeof window !== 'undefined';

        // Log imported Phaser content here to be safe with SSR
        if (isClient) {
            console.log('Imported Phaser module content (Client):', Phaser);
        }


        if (isClient && gameContainerRef.current && !gameRef.current) {
            console.log("Initializing Phaser game on client...");

            // !!! getGameDimensions 함수를 호출하여 논리적 크기 결정 !!!
            const { width, height } = getGameDimensions();

            // !!! 동적으로 결정된 너비/높이를 포함하는 config 객체 생성 !!!
            const currentConfig: Phaser.Types.Core.GameConfig = {
                 ...baseConfig, // 기본 설정 복사
                 width: width, // 동적으로 설정된 너비
                 height: height, // 동적으로 설정된 높이
            };

            // config 객체의 parent 속성을 ref의 current 엘리먼트 ID로 설정
            currentConfig.parent = gameContainerRef.current.id;
            // Access Game from the imported namespace
            const newGame = new Phaser.Game(currentConfig); // 동적으로 생성된 config 사용
            gameRef.current = newGame;


             // 윈도우 크기 변경 이벤트 리스너 추가 (Phaser 스케일 매니저가 처리하지만, React 컴포넌트 레벨에서 확인 가능)
            // 이 리스너는 디버깅에 도움이 될 수 있습니다.
            const handleResize = () => {
                 console.log("Window resized. Current window size:", window.innerWidth, window.innerHeight);
                 // Phaser의 Scale Manager가 자동으로 캔버스 크기를 조정합니다.
                 // RESIZE 모드에서는 논리적 크기는 변경되지 않습니다.
            };
            window.addEventListener('resize', handleResize);


             // 컴포넌트 언마운트 시 리스너 제거
            return () => {
                    console.log("Removing resize listener.");
                    window.removeEventListener('resize', handleResize);
                 // 게임 인스턴스 파괴는 아래 return 함수에서 처리됩니다.
                };

        } else if (!isClient) {
             console.log("Running on server, skipping Phaser initialization.");
        }


        // 컴포넌트가 언마운트될 때 게임 정리
        return () => {
            if (gameRef.current) {
                console.log("Destroying Phaser game...");
                gameRef.current.destroy(true); // 게임 인스턴스 파괴 및 DOM 엘리먼트 제거
                gameRef.current = null; // ref 초기화
            }
        };
    }, []); // 빈 의존성 배열: 마운트 시 한 번만 실행

    return (
        // Phaser가 게임 캔버스을 삽입할 div 엘리먼트
        // 이 엘리먼트의 ID가 config.parent와 일치해야 합니다.
        // 스케일 모드를 사용하므로 div의 크기를 유연하게 설정할 수 있습니다.
        <div id="game-container" ref={gameContainerRef} style={{ width: '100%', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {/* 게임 캔버스는 여기에 동적으로 삽입됩니다 */}
        </div>
    );
};

export default GameCanvas;
