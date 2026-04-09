const express = require('express');
const router = express.Router();
const User = require('../models/User');

// [GET] 유저 정보 조회 (마이페이지 로드 시)
router.get('/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();
        const user = await User.findByWallet(walletAddress);
        
        if (!user) {
            return res.status(404).json({ error: "유저를 찾을 수 없습니다." });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "정보 조회 실패" });
    }
});

// [PUT] 유저 프로필 및 설정 저장 (마이페이지 저장 버튼/변경 시)
router.put('/update', async (req, res) => {
    try {
        const { walletAddress, nickname, preferences } = req.body;
        await User.updateProfile(walletAddress.toLowerCase(), nickname, preferences);
        res.json({ message: "정보가 업데이트되었습니다." });
    } catch (error) {
        console.error("업데이트 에러:", error);
        res.status(500).json({ error: "정보 수정 실패" });
    }
});

module.exports = router;