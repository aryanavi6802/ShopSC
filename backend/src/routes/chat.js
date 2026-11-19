const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { uploadImage } = require("../utils/uploads");
const { listConversations, getMessages, postMessage, markRead, getUnreadBadgeCount } = require("../controllers/chatController");

const router = express.Router();

router.use(authenticate);
router.get("/conversations", listConversations);
router.get("/messages", getMessages);
router.post("/messages", uploadImage("image"), postMessage);
router.post("/messages/read", markRead);
router.get("/unread-count", getUnreadBadgeCount);

module.exports = router;
