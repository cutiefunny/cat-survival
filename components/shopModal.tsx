import React from 'react';
import Item from './item'; // 아이템 컴포넌트 임포트
import { useState, useEffect } from 'react';
import skillBook from '../public/skillBook.json'; // 스킬북 컴포넌트 임포트


interface ShopModalProps {
  isVisible: boolean;
  onClose: () => void;
  level: number; // 선택 사항: 레벨을 표시하고 싶을 때 사용
  skills: number[]; // 선택 사항: 현재 보유한 스킬을 표시하고 싶을 때 사용
}

const ShopModal: React.FC<ShopModalProps> = ({ isVisible, onClose, level, skills }) => {
    const [availableItems, setAvailableItems] = useState<any[]>([]);

    useEffect(() => {
        const items = skillBook.filter(item => item.level <= level);
        // 스킬북에서 가격이 특정 레벨 이하인 아이템만 필터링
        const alreadyHave = skillBook.filter(item => skills.includes(item.id) || item.level > level);
        const newItems = items.filter(item => !alreadyHave.find(already => already.id === item.id));
        // 그룹별로 아이템을 필터링하는 함수
        const filterItems = (items: any[]) => {
            const filteredItems: any[] = [];
            const retainedIds: Set<number> = new Set();

            items.forEach(item => {
            const group = Math.floor(item.id / 10);
            if ([1, 2, 3].includes(group) && item.id % 10 !== 0) {
                if (!retainedIds.has(group)) {
                filteredItems.push(item);
                retainedIds.add(group);
                }
            } else {
                filteredItems.push(item);
            }
            });

            return filteredItems;
        };

        const newItemsFiltered = filterItems(newItems);
        

        setAvailableItems(newItemsFiltered);
    }, [level]);

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
    backgroundColor: '#808080',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
};

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <p style={{
            fontSize: '2em',
            fontWeight: 'bold',
            color: '#e44d26',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
            letterSpacing: '1px',
            fontFamily: 'Arial, sans-serif',
            animation: 'glow 1s ease-in-out infinite alternate'
        }}>LEVEL UP!</p>
        {/* 상점 아이템들을 표시할 곳 */}
        <div style={{ display: 'flex', overflowX: 'auto', gap: '10px', padding: '10px' }}>
          <Item items={availableItems} onClose={onClose} />
        </div>
        <button style={buttonStyle} onClick={onClose}>상남자에게 스킬은 필요 없다</button>
      </div>
    </div>
  );
};

export default ShopModal;