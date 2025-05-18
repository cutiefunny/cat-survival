'use client';

import React, { useEffect, useRef } from 'react';
// Corrected import: Import the entire module as a namespace alias 'Phaser'
import * as Phaser from 'phaser';

// Optional: Log the imported Phaser object to inspect its structure
// This log is primarily for debugging the import itself.
// If it still causes issues during SSR, consider moving it inside useEffect
// or removing it after confirming the import works.
console.log('Imported Phaser module content:', Phaser);


// 게임 설정 객체 (기존 config와 동일)
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 }, // 중력 없음 (탑다운 게임)
            debug: false // 개발 중에는 true로 설정하여 물리 바디 확인
        }
    },
    // 씬은 컴포넌트 내부에서 정의하거나 별도 파일로 분리할 수 있습니다.
    // 여기서는 간단하게 컴포넌트 내부에 정의합니다.
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    parent: 'game-container' // 게임 캔버스가 삽입될 DOM 엘리먼트의 ID
};

// 게임 변수 선언 (컴포넌트 스코프 또는 씬 내부에서 관리)
// 여기서는 씬 함수 내에서 this를 통해 접근하도록 구성합니다.

// 리소스 로딩 함수
function preload(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 플레이어 스프라이트 시트 로드 (유지)
    this.load.spritesheet('player_sprite', '/images/cat_walk_3frame_sprite.png', { frameWidth: 100, frameHeight: 100 });

    // 기존 애니메이션 스프라이트 시트 로드 (유지)
    this.load.spritesheet('animation_sprite', 'https://phaser.io/examples/assets/sprites/metalslug_mummy37x45.png', { frameWidth: 37, frameHeight: 45 });

    // !!! 적 캐릭터 스프라이트 시트 이미지 로드 !!!
    // '/images/mouse_2frame_sprite.png' 경로에서 2프레임 스프라이트 시트를 로드합니다.
    // 'enemy_sprite'는 이 스프라이트 시트를 참조할 키입니다.
    // { frameWidth: 100, frameHeight: 64 }는 스프라이트 시트 내 각 프레임의 크기입니다.
    // 원본 스프라이트 크기가 100x64라고 하셨으므로 이 값을 100x64로 설정합니다.
    this.load.spritesheet('enemy_sprite', '/images/mouse_2frame_sprite.png', { frameWidth: 100, frameHeight: 64 });


    // 배경 이미지 또는 타일맵 로드 (선택 사항)
    // this.load.image('background', 'assets/background.png');
    // this.load.tilemapTiledJSON('map', 'assets/map.json');
}

// 게임 객체 생성 및 초기화 함수
function create(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 배경 설정
    this.cameras.main.setBackgroundColor('#ffffff'); // 배경색을 흰색으로 변경

    // 플레이어 생성 (기존 코드 유지)
    const player = this.physics.add.sprite(config.width as number / 2, config.height as number / 2, 'player_sprite');
    player.setCollideWorldBounds(true);
    player.setScale(0.5);
    player.setDrag(500);

    // 플레이어 애니메이션 생성 (기존 코드 유지)
    this.anims.create({
        key: 'cat_walk',
        frames: this.anims.generateFrameNumbers('player_sprite', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1
    });
    player.setFrame(0);


    // !!! 적 애니메이션 생성 !!!
    // 로드한 'enemy_sprite' 스프라이트 시트를 사용하여 'mouse_walk' 애니메이션을 생성합니다.
    this.anims.create({
        key: 'mouse_walk', // 애니메이션 이름
        frames: this.anims.generateFrameNumbers('enemy_sprite', { start: 0, end: 1 }), // 0번부터 1번까지 2프레임 사용
        frameRate: 8, // 초당 8프레임 속도 (조정 가능)
        repeat: -1 // 무한 반복
    });


    // 적 그룹 생성 (기존 코드 유지)
    const enemies = this.physics.add.group();

    // 간단한 적 생성 (예시: 1초마다 적 생성)
    this.time.addEvent({
        delay: 1000,
        callback: () => spawnEnemy.call(this, enemies, player), // 콜백에서 this와 필요한 인자 전달
        callbackScope: this,
        loop: true
    });

    // 키보드 입력 설정 (유지하되, 터치 입력이 우선하도록 update에서 처리)
    const cursors = this.input.keyboard?.createCursorKeys();

    // !!! 터치 입력 활성화 (기본적으로 활성화되어 있지만 명시적으로 확인) !!!
    this.input.addPointer(1); // 멀티 터치를 지원하려면 필요한 만큼 포인터 추가


    // 충돌 감지 설정 (기존 코드 유지)
    this.physics.add.collider(player, enemies, hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    // 점수 표시 텍스트 (예시, 기존 코드 유지)
    const scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', color: '#000000' }); // 텍스트 색상을 검정으로 변경
    scoreText.setScrollFactor(0);

    // 기존 애니메이션이 적용된 스프라이트 객체 생성 및 애니메이션 재생 (유지)
    const animatedSprite = this.add.sprite(100, 300, 'animation_sprite');
    animatedSprite.play('walking');


    // 씬의 데이터를 저장하여 update 함수 등에서 접근할 수 있도록 합니다.
    // 또는 각 객체를 직접 변수에 할당하여 클로저를 통해 접근하게 할 수도 있습니다.
    this.data.set('player', player);
    this.data.set('enemies', enemies);
    this.data.set('cursors', cursors);
    this.data.set('score', 0);
    this.data.set('scoreText', scoreText);
    this.data.set('animatedSprite', animatedSprite);
}

// 적 생성 함수 (필요한 인자 전달)
function spawnEnemy(this: Phaser.Scene, enemies: Phaser.Physics.Arcade.Group, player: Phaser.Physics.Arcade.Sprite) // TypeScript에서 this와 인자 타입 명시
{
    // 화면 가장자리 중 한 곳에서 무작위로 적 생성
    const edge = Phaser.Math.Between(0, 3);
    let x: number, y: number;

    switch (edge) {
        case 0: // 상단
            x = Phaser.Math.Between(0, config.width as number);
            y = -50;
            break;
        case 1: // 하단
            x = Phaser.Math.Between(0, config.width as number);
            y = (config.height as number) + 50;
            break;
        case 2: // 좌측
            x = -50;
            y = Phaser.Math.Between(0, config.height as number);
            break;
        case 3: // 우측
            x = (config.width as number) + 50;
            y = Phaser.Math.Between(0, config.height as number);
            break;
        default: // 기본값 처리 (필요에 따라)
             x = 0; y = 0;
             break;
    }

    // !!! 적 스프라이트 생성 및 그룹에 추가 (새로운 스프라이트 시트 사용) !!!
    // 'enemy_sprite' 키를 사용하여 스프라이트 생성
    const enemy = enemies.create(x, y, 'enemy_sprite') as Phaser.Physics.Arcade.Sprite; // 타입 단언
    enemy.setBounce(0.2);
    enemy.setCollideWorldBounds(false);
    // enemy.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-100, 100)); // 초기 무작위 속도 제거
    enemy.setScale(32 / 100); // 가로/세로 비율 유지하며 스케일 조정

    // !!! 적 애니메이션 재생 !!!
    enemy.play('mouse_walk');

    // 적이 플레이어를 향해 이동하도록 설정 (기존 코드 유지)
    // spawnEnemy에서는 일단 플레이어를 향해 움직이도록 설정하고,
    // update 함수에서 방향에 따라 반전 처리합니다.
    this.physics.moveToObject(enemy, player, 50);
}

// 플레이어와 적 충돌 시 실행되는 함수 (기존 코드 유지)
function hitEnemy(
    this: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite, // Player는 Arcade Sprite일 것으로 예상
    enemy: Phaser.Physics.Arcade.Sprite // Enemy도 Arcade Sprite일 것으로 예상
)
{
    console.log("Collision detected!");
    console.log("Player object:", player);
    console.log("Enemy object:", enemy);
    console.log("Enemy has body:", enemy.body); // enemy 객체에 body 속성이 있는지 로그

    // 충돌한 적 제거
    // enemy 객체에 body 속성이 있고, disableBody 메서드가 있는지 안전하게 확인
    if (enemy && enemy.body && (enemy as any).disableBody) {
         console.log("Disabling enemy body.");
        (enemy as any).disableBody(true, true); // any로 단언하여 disableBody 호출 (타입스크립트 오류 회피)
        // 또는 다음과 같이 좀 더 타입 안전하게 할 수 있습니다:
        // if (enemy.body instanceof Phaser.Physics.Arcade.Body) {
        //    enemy.disableBody(true, true);
        // }
    } else {
        console.warn("Attempted to disable body on an object without a physics body or disableBody method:", enemy);
    }


    // 점수 증가 (예시)
    let score = this.data.get('score');
    score += 10;
    this.data.set('score', score);
    const scoreText = this.data.get('scoreText') as Phaser.GameObjects.Text; // 타입 단언
    scoreText.setText('Score: ' + score);

    // TODO: 플레이어 체력 감소 또는 게임 오버 로직 추가
    console.log("Player hit by enemy!");
}

// 게임 루프 함수 (기존 코드 유지)
function update(this: Phaser.Scene) // TypeScript에서 this의 타입을 명시
{
    // 씬 데이터에서 객체 가져오기
    const player = this.data.get('player') as Phaser.Physics.Arcade.Sprite;
    const enemies = this.data.get('enemies') as Phaser.Physics.Arcade.Group; // 적 그룹 가져오기
    // 키보드 입력 객체 (유지)
    const cursors = this.data.get('cursors') as Phaser.Types.Input.Keyboard.CursorKeys | undefined; // undefined 가능성 고려

    if (!player || !cursors || !enemies) {
        // 객체가 아직 생성되지 않았거나 유효하지 않으면 업데이트 스킵
        return;
    }

    // 플레이어 이동 처리
    const playerSpeed = 200;
    let isMoving = false; // 플레이어가 움직이는지 확인하는 플래그

    // 플레이어 속도 초기화
    player.setVelocity(0);

    // !!! 터치/마우스 입력에 따른 플레이어 이동 및 애니메이션/반전 처리 !!!
    // 활성화된 포인터(마우스 또는 터치)가 있는지 확인
    if (this.input.activePointer.isDown) {
        isMoving = true;
        // 포인터 위치로 플레이어 이동
        this.physics.moveToObject(player, this.input.activePointer, playerSpeed);

        // 이동 방향에 따라 플레이어 반전 및 애니메이션 처리
        // 플레이어의 현재 위치와 포인터 위치를 비교하여 방향 판단
        if (this.input.activePointer.x < player.x) {
            // 포인터가 플레이어 왼쪽에 있으면 왼쪽 이동 (반전 해제)
            player.setFlipX(false);
        } else if (this.input.activePointer.x > player.x) {
            // 포인터가 플레이어 오른쪽에 있으면 오른쪽 이동 (반전 적용)
            player.setFlipX(true);
        }
        // 위/아래 이동 시에는 좌우 반전 변경 없음

        // 움직일 때 'cat_walk' 애니메이션 재생 (이미 재생 중이면 무시)
        player.play('cat_walk', true);

         // 목표 지점 근처에 도달하면 멈추도록 설정 (선택 사항)
         // 너무 가까워지면 떨리는 현상 방지
         const distance = Phaser.Math.Distance.Between(player.x, player.y, this.input.activePointer.x, this.input.activePointer.y);
         if (distance < 5) { // 5픽셀 이내로 가까워지면
             if (player.body) {
                 player.body.stop(); // 물리 바디 정지
             }
             isMoving = false; // 움직임 상태 해제
         }

    } else {
        // 키 입력이 없을 때 (가만히 있을 때) 애니메이션 정지 및 1번 프레임 표시
        // 터치/마우스 입력이 없을 때만 키보드 입력 처리 (선택 사항)
        // 현재는 터치 입력이 우선하도록 되어 있습니다. 키보드와 터치 모두 사용하려면 로직 수정 필요
        player.stop(); // 현재 애니메이션 정지
        player.setFrame(0); // 1번 프레임 (인덱스 0)으로 설정
         isMoving = false;
    }


    // !!! 적 캐릭터 좌우 반전 로직 !!!
    // 적 그룹의 모든 적에 대해 반복
    enemies.getChildren().forEach((enemyObject) => {
        const enemy = enemyObject as Phaser.Physics.Arcade.Sprite; // 타입 단언
        // 적의 현재 가로 속도를 확인하여 방향 판단
        if (enemy.body instanceof Phaser.Physics.Arcade.Body) {
            if (enemy.body.velocity.x < 0) {
                // 왼쪽으로 이동 중이면 반전 해제 (기본 방향이 왼쪽이라고 가정)
                enemy.setFlipX(false);
            } else if (enemy.body.velocity.x > 0) {
                // 오른쪽으로 이동 중이면 반전 적용 (기본 방향이 왼쪽이라고 가정)
                enemy.setFlipX(true);
            }
            // velocity.x가 0이면 마지막 방향 유지
        }
    });


    // TODO: 자동 공격 로직 구현
    // TODO: 적들의 플레이어 추적 또는 다른 이동 패턴 구현
    // TODO: 아이템 드롭 및 획득 로직 구현
    // TODO: UI 업데이트 (체력 바 등)
}


// React 컴포넌트 정의 (기존 코드 유지)
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

        if (isClient && gameContainerRef.current && !gameRef.current) {
            console.log("Initializing Phaser game on client...");
            // config 객체의 parent 속성을 ref의 current 엘리먼트 ID로 설정
            config.parent = gameContainerRef.current.id;
            // Access Game from the imported namespace
            const newGame = new Phaser.Game(config);
            gameRef.current = newGame;
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
        // Phaser가 게임 캔버스를 삽입할 div 엘리먼트
        // 이 엘리먼트의 ID가 config.parent와 일치해야 합니다.
        <div id="game-container" ref={gameContainerRef} style={{ width: '800px', height: '600px' }}>
            {/* 게임 캔버스는 여기에 동적으로 삽입됩니다 */}
        </div>
    );
};

export default GameCanvas;
