const db = require('../config/db');

class User {
    // 1. 지갑 주소로 유저 검색
    static async findByWallet(walletAddress) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE wallet_address = ?', 
            [walletAddress]
        );
        return rows; // 데이터 한 건만 반환하도록 수정
    }

    // 2. 신규 유저 저장 (초기 자산 0원 설정)
    static async create(walletAddress, nickname) {
        const [result] = await db.query(
            'INSERT INTO users (wallet_address, nickname, assets) VALUES (?, ?, ?)',
            [walletAddress, nickname, 0]
        );
        return result;
    }

    // 3. 유저 설정(preferences) 및 닉네임 업데이트 (마이페이지용)
    static async updateProfile(walletAddress, nickname, preferences) {
        return await db.query(
            'UPDATE users SET nickname = ?, preferences = ? WHERE wallet_address = ?',
            [nickname, JSON.stringify(preferences), walletAddress]
        );
    }
}

module.exports = User;