// GameOverModal.tsx
import React, { useState, useEffect } from 'react';

interface RankEntry {
    name: string;
    score: number;
    deviceId?: string;
}

interface GameOverModalProps {
    isVisible: boolean;
    score: number;
    onClose: () => void;
    onSave: (name: string) => void;
}

const GameOverModal: React.FC<GameOverModalProps> = ({ isVisible, score, onClose, onSave }) => {
    const [playerName, setPlayerName] = useState('');
    const [deviceId, setDeviceId] = useState<string | null>(null);
    
    const [ranks, setRanks] = useState<RankEntry[]>([]);
    const [showRanks, setShowRanks] = useState(false);
    const [isLoadingRanks, setIsLoadingRanks] = useState(false);
    const [rankError, setRankError] = useState<string | null>(null);

    // isVisible prop이 변경될 때 상태를 초기화하는 useEffect 추가
    useEffect(() => {
        if (isVisible) {
            // 모달이 표시될 때 상태들을 초기값으로 리셋합니다.
            setPlayerName(''); // 기존 플레이어 이름 입력 지우기
            setShowRanks(false); // 이름 입력창을 먼저 보여주도록 설정
            setRanks([]); // 이전 랭킹 정보 지우기
            setRankError(null); // 이전 오류 메시지 지우기
            setIsLoadingRanks(false); // 로딩 상태 리셋
            // deviceId는 localStorage에서 가져오므로 유지되거나, 
            // 아래 deviceId 설정 useEffect에서 처리됩니다.
            // playerName은 아래 getName 로직에 의해 서버 값으로 갱신될 수 있습니다.
        }
    }, [isVisible]); // isVisible이 변경될 때마다 이 effect 실행

    // deviceId 설정 로직 (컴포넌트 마운트 시 한 번 실행)
    useEffect(() => {
        const deviceIdKey = "deviceId";
        let currentDeviceId = localStorage.getItem(deviceIdKey);

        if (!currentDeviceId) {
            currentDeviceId = crypto.randomUUID();
            localStorage.setItem(deviceIdKey, currentDeviceId);
        }
        setDeviceId(currentDeviceId);
    }, []); // 빈 의존성 배열

    // deviceId를 사용하여 이름 가져오기
    useEffect(() => {
        const getName = async () => {
            if (deviceId) { 
                try {
                    const response = await fetch(`/api/getName?deviceId=${deviceId}`);
                    if (response.ok) {
                        const data = await response.json();
                        // isVisible 조건 추가: 모달이 실제로 보여질 때만 playerName을 설정
                        // (위의 isVisible effect에서 playerName이 ''로 초기화된 후 실행됨)
                        if (data.name && data.name !== '' && isVisible) {
                            setPlayerName(data.name);
                        }
                    } else {
                        console.error('Failed to get name from server');
                    }
                } catch (error) {
                    console.error('Error getting name:', error);
                }
            }
        };

        if (isVisible && deviceId) { // 모달이 보이고, deviceId도 설정되었을 때 이름 가져오기
            getName();
        }
    }, [deviceId, isVisible]); // isVisible을 의존성에 추가

    const handleSaveAndShowRanks = () => {
        onSave(playerName); 

        if (!playerName.trim()) {
            alert("이름을 입력해주세요!");
            return;
        }

        if (deviceId) {
            setIsLoadingRanks(true);
            setRankError(null);
            // setShowRanks(false); // 여기서 굳이 false로 할 필요는 없음. 성공 시 true가 됨.

            fetch('/api/saveRank', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, score: score, deviceId: deviceId }),
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('점수 저장에 실패했습니다.');
                }
                return fetch('/api/getRank');
            })
            .then(rankResponse => {
                if (!rankResponse.ok) {
                    throw new Error('랭킹을 불러오는데 실패했습니다.');
                }
                return rankResponse.json();
            })
            .then(data => {
                setRanks(data.ranks || data || []); 
                setShowRanks(true); 
            })
            .catch(error => {
                console.error('Error during save or fetching ranks:', error);
                setRankError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
                setShowRanks(true); 
            })
            .finally(() => {
                setIsLoadingRanks(false);
            });
        } else {
            console.error('Device ID is not available.');
            setRankError('Device ID를 사용할 수 없어 랭킹을 처리할 수 없습니다.');
            setShowRanks(true); 
        }
    };

    if (!isVisible) {
        return null;
    }

    // JSX 렌더링 부분은 이전과 동일하게 유지
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#f0f0f0', padding: '20px', borderRadius: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '300px' }}>
                {!showRanks ? (
                    <>
                        <img src="/images/cat_cry.png" alt="Game Over" style={{ width: '100px', height: '100px' }} />
                        <h2>Game Over!</h2>
                        <p>너의 점수는 <strong>{score}</strong>점</p>
                        <div style={{ margin: '15px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                            <input
                                type="text"
                                id="playerName"
                                placeholder='이름을 남겨라!'
                                value={playerName} // isVisible effect에서 ''로 초기화됨
                                onChange={(e) => setPlayerName(e.target.value)}
                                style={{ textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', padding: '8px 10px', flexGrow: 1 }}
                            />
                            <button onClick={handleSaveAndShowRanks} style={{ padding: '9px 15px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                저장
                            </button>
                        </div>
                        <button onClick={onClose} style={{ marginTop: '10px', padding: '8px 15px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            재시작
                        </button>
                    </>
                ) : (
                    <>
                        <h2 style={{ fontSize: '2em', fontWeight: 'bold', color: '#FFD700', textShadow: '2px 2px 4px #000000' }}>🏆 게임 랭킹 🏆</h2>
                        {isLoadingRanks && <p>랭킹을 불러오는 중...</p>}
                        {rankError && <p style={{ color: 'red', marginTop: '10px' }}>오류: {rankError}</p>}
                        {!isLoadingRanks && !rankError && ranks.length > 0 && (
                            <ol style={{ listStyleType: 'decimal', paddingLeft: '20px', maxHeight: '200px', marginTop: '10px', overflowY: 'auto', textAlign: 'left', width: '100%' }}>
                                {ranks.slice(0, 10).map((rank, index) => (
                                    <li key={index} style={{
                                        marginBottom: '5px',
                                        padding: '3px',
                                        borderBottom: '1px solid #ddd',
                                        color: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? '#CD7F32' : 'inherit',
                                        fontWeight: index <= 2 ? 'bold' : 'normal',
                                        textShadow: index <= 2 ? '-1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black' : 'none'
                                    }}>
                                        {rank.name} - {rank.score}점
                                    </li>
                                ))}
                            </ol>
                        )}
                        {!isLoadingRanks && !rankError && ranks.length === 0 && (
                            <p>아직 랭킹이 없습니다.</p>
                        )}
                        <button onClick={onClose} style={{ marginTop: '20px', padding: '8px 15px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            재시작 / 닫기
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default GameOverModal;