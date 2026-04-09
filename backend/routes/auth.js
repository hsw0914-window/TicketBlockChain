const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/login', async (req, res) => {
    const { walletAddress, nickname } = req.body; 
    
    if (!walletAddress) {
        return res.status(400).json({ error: "지갑 주소가 필요합니다." });
    }

    try {
        const address = walletAddress.toLowerCase();
        let user = await User.findByWallet(address);
        
        if (!user) {
            console.log("새로운 유저 등록 중:", address);
            const defaultNickname = nickname || "루키"; 
            await User.create(address, defaultNickname);
            user = { wallet_address: address, nickname: defaultNickname, assets: 0 };
        } 
        
        res.json({ message: "로그인 성공", user });
    } catch (error) {
        console.error("인증 에러:", error);
        res.status(500).json({ error: "인증 실패" });
    }
});

module.exports = router;