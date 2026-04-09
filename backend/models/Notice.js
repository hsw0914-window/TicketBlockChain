const db = require('../config/db');

class Notice {
    static async getAll() {
        const [rows] = await db.query('SELECT * FROM notices ORDER BY is_pinned DESC, created_at DESC');
        return rows;
    }

    static async create(title, content, type, is_pinned, image_url) {
        const query = 'INSERT INTO notices (title, content, type, is_pinned, image_url) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [title, content, type, is_pinned, image_url]);
        return result;
    }

    static async update(id, title, content, type, is_pinned, image_url) {
        const query = 'UPDATE notices SET title = ?, content = ?, type = ?, is_pinned = ?, image_url = ? WHERE id = ?';
        const [result] = await db.query(query, [title, content, type, is_pinned, image_url, id]);
        return result;
    }

    static async delete(id) {
        const query = 'DELETE FROM notices WHERE id = ?';
        const [result] = await db.query(query, [id]);
        return result;
    }

    // ✅ [추가] 전체 삭제 기능
    static async deleteAll() {
        const query = 'DELETE FROM notices';
        const [result] = await db.query(query);
        // ID 번호를 다시 1부터 시작하도록 초기화
        await db.query('ALTER TABLE notices AUTO_INCREMENT = 1');
        return result;
    }
}

module.exports = Notice;