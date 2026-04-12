const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let pool;
function setPool(p) { pool = p; }

const uploadDir = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// [GET] 목록 조회
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notices ORDER BY is_pinned DESC, created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: '조회 실패' });
  }
});

// [DELETE] 전체 삭제 (/:id 보다 위에 위치해야 함)
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM notices');
    await pool.query('ALTER TABLE notices AUTO_INCREMENT = 1');
    res.json({ message: '모든 공지가 삭제되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: '전체 삭제 실패' });
  }
});

// [POST] 공지 등록
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, content, type, is_pinned } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    await pool.query(
      'INSERT INTO notices (title, content, type, is_pinned, image_url) VALUES (?, ?, ?, ?, ?)',
      [title, content, type, is_pinned ?? 0, image_url]
    );
    res.status(201).json({ message: '등록 완료' });
  } catch (error) {
    res.status(500).json({ error: '등록 실패' });
  }
});

// [PUT] 공지 수정
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, type, is_pinned } = req.body;
    let image_url = req.body.image_url || null;
    if (req.file) image_url = `/uploads/${req.file.filename}`;
    await pool.query(
      'UPDATE notices SET title = ?, content = ?, type = ?, is_pinned = ?, image_url = ? WHERE id = ?',
      [title, content, type, is_pinned ?? 0, image_url, id]
    );
    res.json({ message: '수정 완료' });
  } catch (error) {
    res.status(500).json({ error: '수정 실패' });
  }
});

// [DELETE] 낱개 삭제
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notices WHERE id = ?', [req.params.id]);
    res.json({ message: '삭제 완료' });
  } catch (error) {
    res.status(500).json({ error: '삭제 실패' });
  }
});

module.exports = { router, setPool };
