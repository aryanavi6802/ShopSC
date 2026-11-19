const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { listMine, listAll, getOne, create, update, remove } = require("../controllers/listingController");
const { uploadImage } = require("../utils/uploads");

const router = express.Router();

router.get("/", listAll);
router.get("/mine", authenticate, listMine);
router.get("/:id", getOne);
router.post("/", authenticate, uploadImage("image"), create);
router.patch("/:id", authenticate, uploadImage("image"), update);
router.delete("/:id", authenticate, remove);

module.exports = router;
