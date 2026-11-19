const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { createTransaction } = require("../controllers/transactionController");

const router = express.Router();

router.use(authenticate);
router.post("/", createTransaction);

module.exports = router;
