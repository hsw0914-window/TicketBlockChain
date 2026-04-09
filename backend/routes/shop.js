const express = require('express');
const router = express.Router();
const db = require('../config/db');

// [POST] 아이템 구매: http://localhost:3000/api/shop/buy
router.post('/buy', async (req, res) => {
    const { walletAddress, itemName, price } = req.body;

    try {
        const address = walletAddress.toLowerCase();
        
        // 1. 유저의 현재 자산 확인
        const [user] = await db.query('SELECT assets FROM users WHERE wallet_address = ?', [address]);
        
        if (!user.length) {
            return res.status(404).json({ error: "유저를 찾을 수 없습니다." });
        }

        const currentAssets = user.assets;

        // 2. 잔액 부족 확인
        if (currentAssets < price) {
            return res.status(400).json({ error: "자산이 부족합니다!" });
        }

        // 3. 자산 차감 처리 (트랜잭션 대신 간단히 업데이트)
        await db.query('UPDATE users SET assets = assets - ? WHERE wallet_address = ?', [price, address]);
        
        console.log(`${itemName} 구매 완료! 잔액: ${currentAssets - price}`);
        res.json({ 
            success: true, 
            message: `${itemName} 구매 완료!`, 
            newBalance: currentAssets - price 
        });

    } catch (error) {
        console.error("구매 에러:", error);
        res.status(500).json({ error: "구매 처리 중 서버 에러가 발생했습니다." });
    }
});

module.exports = router;