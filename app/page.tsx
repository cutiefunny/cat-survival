'use client';

import dynamic from 'next/dynamic';
import React from 'react'; // React 임포트

// GameCanvas 컴포넌트를 동적으로 임포트하고 SSR을 비활성화합니다.
// 이렇게 하면 이 컴포넌트와 그 안의 코드는 클라이언트 측에서만 로드되고 실행됩니다.
const GameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false, // 서버 사이드 렌더링 비활성화
  loading: () => <p>Loading game...</p>, // 게임 로딩 중 표시할 내용 (선택 사항)
});

const GamePage = () => {
  return (
    <div>
      {/* 동적으로 임포트된 GameCanvas 컴포넌트 사용 */}
      <GameCanvas />
    </div>
  );
};

export default GamePage;