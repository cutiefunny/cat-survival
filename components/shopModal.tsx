import React from 'react';
import Item from './item'; // 아이템 컴포넌트 임포트
import { useState, useEffect } from 'react';


interface ShopModalProps {
  isVisible: boolean;
  onClose: () => void;
  score: number; // 선택 사항: 상점에 점수를 표시하고 싶을 때 사용
}

const ShopModal: React.FC<ShopModalProps> = ({ isVisible, onClose, score }) => {
    const [availableItems, setAvailableItems] = useState<any[]>([]);

    useEffect(() => {
        const items = [];

        if (score >= 50) {
            items.push({
                id: 1,
                name: '냥냥펀치1',
                description: '냥냥펀치로 상대를 밀어낸다!',
                price: 50,
                imageUrl: '/images/skill-punch.png',
            });
        }

        if (score >= 100) {
            items.push({
                id: 2,
                name: '속도 부스트',
                description: '이동 속도가 빨라집니다.',
                price: 100,
                imageUrl: '/images/speed-boost.png',
            });
        }

        setAvailableItems(items);
    }, [score]);

  if (!isVisible) return null;

  // 모달 오버레이 스타일
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // 배경을 어둡게
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000, // 다른 요소 위에 표시
  };

  // 모달 내용 스타일
  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center',
    maxWidth: '80%',
    maxHeight: '80%',
    overflowY: 'auto', // 내용이 많아지면 스크롤 가능
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
    color: '#333',
  };

  // 버튼 스타일
  const buttonStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <p>현재 점수: {score}</p>
        {/* 상점 아이템들을 표시할 곳 */}
        <div style={{ display: 'flex', overflowX: 'auto', gap: '10px', padding: '10px' }}>
          <Item items={availableItems} />
        </div>
        <button style={buttonStyle} onClick={onClose}>상점 닫기</button>
      </div>
    </div>
  );
};

export default ShopModal;