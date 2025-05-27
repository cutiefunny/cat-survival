// GameOverModal.tsx
import React, { useState, useEffect } from 'react';
import styles from './GameOverModal.module.css'; // CSS Module 임포트

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

    useEffect(() => {
        if (isVisible) {
            setPlayerName('');
            setShowRanks(false);
            setRanks([]);
            setRankError(null);
            setIsLoadingRanks(false);
        }
    }, [isVisible]);

    useEffect(() => {
        const deviceIdKey = "deviceId";
        let currentDeviceId = localStorage.getItem(deviceIdKey);

        if (!currentDeviceId) {
            currentDeviceId = crypto.randomUUID();
            localStorage.setItem(deviceIdKey, currentDeviceId);
        }
        setDeviceId(currentDeviceId);
    }, []);

    useEffect(() => {
        const getName = async () => {
            if (deviceId) { 
                try {
                    const response = await fetch(`/api/getName?deviceId=${deviceId}`);
                    if (response.ok) {
                        const data = await response.json();
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

        if (isVisible && deviceId) {
            getName();
        }
    }, [deviceId, isVisible]);

    const handleSaveAndShowRanks = () => {
        onSave(playerName); 

        if (!playerName.trim()) {
            alert("이름을 입력해주세요!");
            return;
        }

        if (deviceId) {
            setIsLoadingRanks(true);
            setRankError(null);
            
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

    const getRankItemClassName = (index: number): string => {
        const classNames = [styles.rankItem];
        if (index === 0) classNames.push(styles.rankItemGold);
        else if (index === 1) classNames.push(styles.rankItemSilver);
        else if (index === 2) classNames.push(styles.rankItemBronze);
        return classNames.join(' ');
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                {!showRanks ? (
                    <>
                        <img src="/images/cat_cry.png" alt="Game Over" className={styles.gameOverImage} />
                        <h2 className={styles.title}>Game Over!</h2>
                        <p className={styles.scoreText}>너의 점수는 <strong>{score}</strong>점</p>
                        <div className={styles.inputGroup}>
                            <input
                                type="text"
                                id="playerName"
                                placeholder='이름을 남겨라!'
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className={styles.playerNameInput}
                            />
                            <button 
                                onClick={handleSaveAndShowRanks} 
                                className={`${styles.button} ${styles.saveButton}`}
                            >
                                저장
                            </button>
                        </div>
                        <button 
                            onClick={onClose} 
                            className={`${styles.button} ${styles.restartButtonInitial}`}
                        >
                            재시작
                        </button>
                    </>
                ) : (
                    <>
                        <h2 className={styles.rankingTitle}>🏆 게임 랭킹 🏆</h2>
                        {isLoadingRanks && <p className={styles.loadingText}>랭킹을 불러오는 중...</p>}
                        {rankError && <p className={styles.rankErrorText}>오류: {rankError}</p>}
                        {!isLoadingRanks && !rankError && ranks.length > 0 && (
                            <div className={styles.rankList}>
                                {ranks.slice(0, 10).map((rank, index) => (
                                    <div key={index} className={getRankItemClassName(index)}>
                                        {rank.name} - {rank.score}점
                                    </div>
                                ))}
                            </div>
                        )}
                        {!isLoadingRanks && !rankError && ranks.length === 0 && (
                            <p className={styles.noRanksText}>아직 랭킹이 없습니다.</p>
                        )}
                        <button 
                            onClick={onClose} 
                            className={`${styles.button} ${styles.restartButtonRankView}`}
                        >
                            재시작 / 닫기
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default GameOverModal;