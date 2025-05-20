import React from 'react';

interface Item {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
}

interface ItemsProps {
    items: Item[];
    onUpgrade: (skill: number) => void;
}

const Items: React.FC<ItemsProps> = ({ items, onUpgrade }) => {
    const handleUpgradeClick = (skill: number) => {
        onUpgrade(skill);
    };

    return (
        <div className="items-container">
            <h2>Available Items</h2>
            <div className="items-grid">
                {items.map((item) => (
                    <div key={item.id} className="item-card" style={{ border: '1px solid #ccc', borderRadius: '5px', padding: '10px', margin: '10px', textAlign: 'center' }}>
                        <img src={item.imageUrl} alt={item.name} className="item-image" style={{ maxWidth: '100%', height: 'auto' }} />
                        <h3>{item.name} : {item.price}$</h3>
                        <p>{item.description}</p>
                        <button
                            style={{ backgroundColor: '#4CAF50', color: 'white', padding: '5px 5px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            onClick={() => handleUpgradeClick(item.id)}
                        >
                            upgrade
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Items;