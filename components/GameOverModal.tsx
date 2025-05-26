// GameOverModal.tsx
import React, { useState } from 'react';

interface GameOverModalProps {
    isVisible: boolean;
    score: number;
    onClose: () => void; // 이 prop은 게임 재시작 및 모달 닫기 기능을 수행합니다.
    onSave: (name: string) => void;
}

const GameOverModal: React.FC<GameOverModalProps> = ({ isVisible, score, onClose, onSave }) => {
    const [playerName, setPlayerName] = useState('');

    const handleSave = () => {
        onSave(playerName);
        // 저장 후에도 모달을 닫거나 재시작할 수 있지만, 현재는 닫기/재시작 버튼과 분리되어 있습니다.
        // 필요하다면 저장 후 onClose를 호출하도록 수정할 수 있습니다.
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
            }}
        >
            <div
                style={{
                    backgroundColor: '#f0f0f0',
                    padding: '20px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <img src="/images/cat_cry.png" alt="Game Over" style={{ width: '100px', height: '100px' }} />
                <h2>Game Over!</h2>
                <p>너의 점수: {score}점</p>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <input
                        type="text"
                        id="playerName"
                        placeholder='이름을 남겨라!'
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        style={{ textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', padding: '5px'}}
                    />
                    <button onClick={handleSave} style={{ padding: '6px 14px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        저장
                    </button>
                </div>
                {/* '닫기' 버튼을 '재시작'으로 변경하고, onClick 이벤트는 그대로 onClose를 호출합니다. */}
                <button onClick={onClose} style={{ marginLeft: '10px', marginTop: '10px', padding: '6px 14px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    재시작
                </button>
            </div>
        </div>
    );
};

export default GameOverModal;