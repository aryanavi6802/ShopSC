const { sendMessage, getConversation, getConversationPartners, markMessagesAsRead, getTotalUnreadCount } = require("../models/chat");
const fs = require("fs");
const path = require("path");
const { imageExtension } = require("../utils/uploads");

const STABLE_ID_REGEX = /^[A-Za-z0-9_-]{10,100}$/;

function listConversations(req, res) {
  const userId = req.user.sub;
  getConversationPartners(userId)
    .then((partners) => res.json({ partners }))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "CONVERSATIONS_FETCH_FAILED" });
    });
}

function getMessages(req, res) {
  const userId = req.user.sub;
  const otherId = req.query.with;
  if (!otherId || !STABLE_ID_REGEX.test(otherId)) {
    return res.status(400).json({ error: "INVALID_WITH_PARAM" });
  }
  getConversation(userId, otherId)
    .then((messages) => res.json({ messages }))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "MESSAGES_FETCH_FAILED" });
    });
}

function postMessage(req, res) {
  const senderId = req.user.sub;
  const { recipient_id, body } = req.body || {};
  if (!recipient_id || !STABLE_ID_REGEX.test(recipient_id)) {
    return res.status(400).json({ error: "INVALID_RECIPIENT_ID" });
  }

  // We allow body to be empty if an image is provided
  const messageBody = (body && typeof body === "string") ? body.trim() : "";
  if (!messageBody && !req.file) {
    return res.status(400).json({ error: "MISSING_BODY" });
  }

  (async () => {
    try {
      let attachment_url = null;
      if (req.file) {
        const userChatsDir = path.join(process.cwd(), "uploads", "chats", senderId);
        await fs.promises.mkdir(userChatsDir, { recursive: true });
        const ext = imageExtension(req.file);
        const filename = `${Date.now()}${ext}`;
        const filePath = path.join(userChatsDir, filename);
        await fs.promises.writeFile(filePath, req.file.buffer);
        attachment_url = `/uploads/chats/${senderId}/${filename}`;
      }

      const msg = await sendMessage(senderId, recipient_id, messageBody, attachment_url);
      res.status(201).json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "MESSAGE_SEND_FAILED" });
    }
  })();
}

function markRead(req, res) {
  const userId = req.user.sub;
  const { partner_id } = req.body || {};
  if (!partner_id || !STABLE_ID_REGEX.test(partner_id)) {
    return res.status(400).json({ error: "INVALID_PARTNER_ID" });
  }
  
  markMessagesAsRead(userId, partner_id)
    .then(() => res.status(204).send())
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "MARK_READ_FAILED" });
    });
}

function getUnreadBadgeCount(req, res) {
  const userId = req.user.sub;
  getTotalUnreadCount(userId)
    .then((count) => res.json({ count }))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: "UNREAD_COUNT_FAILED" });
    });
}

module.exports = {
  listConversations,
  getMessages,
  postMessage,
  markRead,
  getUnreadBadgeCount
};
