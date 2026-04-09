const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const userRoutes = require('./routes/user');
const noticeRoutes = require('./routes/notice');
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// 📂 업로드 폴더 생성 로직
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 1. 정적 파일 설정
app.use('/uploads', express.static(uploadDir));

// 2. 바디 파서 미들웨어 (JSON 데이터 처리를 위해 필수)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. API 경로 설정
app.use('/api/auth', authRoutes);   // 로그인/인증
app.use('/api/users', userRoutes);   // 마이페이지/유저정보
app.use('/api/notices', noticeRoutes); // 공지사항
app.use('/api/shop', shopRoutes);     // 상점

app.listen(port, () => {
    console.log(`🚀 서버 실행 중: http://localhost:${port}`);
});