const { pool } = require("../config/database");

async function sendMessage(senderId, recipientId, body, attachmentUrl = null) {
  const result = await pool.query(
    `INSERT INTO messages (sender_id, recipient_id, body, attachment_url)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sender_id, recipient_id, body, attachment_url, created_at`,
    [senderId, recipientId, body, attachmentUrl]
  );
  return result.rows[0];
}

async function getConversation(userId, otherId) {
  const result = await pool.query(
    `SELECT id, sender_id, recipient_id, body, attachment_url, created_at
     FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at ASC`,
    [userId, otherId]
  );
  return result.rows;
}

async function getConversationPartners(userId) {
  const result = await pool.query(
    `WITH partners AS (
       SELECT DISTINCT ON (partner_id)
         CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id,
         body AS last_message,
         created_at AS last_message_at
       FROM messages
       WHERE sender_id = $1 OR recipient_id = $1
       ORDER BY partner_id, created_at DESC
     )
     SELECT p.*,
       (SELECT CAST(COUNT(*) AS INTEGER) 
        FROM messages m 
        WHERE m.recipient_id = $1 AND m.sender_id = p.partner_id AND m.read_at IS NULL) as unread_count
     FROM partners p`,
    [userId]
  );
  // Sort all conversations by most recent message
  return result.rows.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
}

async function markMessagesAsRead(recipientId, senderId) {
  await pool.query(
    `UPDATE messages 
     SET read_at = NOW() 
     WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [recipientId, senderId]
  );
}

async function getTotalUnreadCount(userId) {
  const result = await pool.query(
    `SELECT CAST(COUNT(*) AS INTEGER) as count
     FROM messages
     WHERE recipient_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rows[0].count;
}

module.exports = {
  sendMessage,
  getConversation,
  getConversationPartners,
  markMessagesAsRead,
  getTotalUnreadCount
};
