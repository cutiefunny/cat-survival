'use client';

import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import { SkillsProvider } from '../components/SkillsContext';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}
    >
      <img src="/images/tutorial.png" alt="Loading" style={{ maxWidth: '80vw', cursor: 'pointer' }}/>
    </div>
  ),
});

const GamePage = () => {
  const [showTitle, setShowTitle] = useState(true);
  const [showTutorial, setShowTutorial] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTitle(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      }}
    >
      {showTitle ? (
      <div>
      <img src="/images/title.png" alt="Title" />
      <p style={{ textAlign: 'center', marginTop: '10px' }}>
        이 이미지는 스팀게임 '살아남아라 무도가'의 오마주로 제작되었습니다.
      </p>
      </div>
      ) : (
      <SkillsProvider>
        {showTutorial ? (
          <img
        src="/images/tutorial.png"
        alt="Tutorial"
        style={{ maxWidth: '80vw', maxHeight: '80vh', cursor: 'pointer' }}
        onClick={() => setShowTutorial(false)}
          />
        ) : (
          <GameCanvas />
        )}
      </SkillsProvider>
      )}
    </div>
  );
};

export default GamePage;