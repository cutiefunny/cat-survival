import React from 'react';
import { useSkills } from './SkillsContext'; // SkillsContext 훅 임포트

interface Item {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
}

interface ItemsProps {
    items: Item[];
    onClose: () => void; // onClose 함수 추가
}

const Items: React.FC<ItemsProps> = ({ items, onClose }) => {
    const { addSkill } = useSkills(); // Context에서 addSkill 함수 가져오기

    const handleUpgradeClick = (skill: number) => {
        console.log('handleUpgradeClick called with skill:', skill);
        addSkill(skill); // Context를 통해 skills 배열 업데이트
        onClose(); // 아이템 클릭 시 상점 닫기
    };

    return (
        <div className="items-container">
            <h2 style={{ fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#333' }}>장착 가능</h2>
            <div className="items-grid">
                {items.map((item) => (
                    <div key={item.id} className="item-card">
                        <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            className="item-image" 
                            onClick={() => handleUpgradeClick(item.id)}
                            style={{cursor: 'pointer'}} // 클릭 가능한 표시
                        />
                        <h3 style={{ fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#555' }}>{item.name} : {item.price}$</h3>
                        <p style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#777' }}>{item.description}</p>
                        <style jsx>{`
                            .item-card:hover {
                                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                                transform: translateY(-2px);
                                transition: box-shadow 0.3s ease, transform 0.3s ease;
                            }
                        `}</style>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Items;