const { pool } = require("../config/database");
const { refreshRewards } = require("../services/rewardsService");
const { sendMessage } = require("../models/chat");

async function createTransaction(req, res) {
  const sellerId = req.user.sub;
  const { listing_id, buyer_id } = req.body;

  if (!listing_id || !buyer_id || typeof buyer_id !== "string") {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    // 1. Verify listing is owned by this seller
    const listingRes = await pool.query("SELECT owner_id FROM listings WHERE id = $1 AND deleted_at IS NULL", [listing_id]);
    const listing = listingRes.rows[0];
    if (!listing) return res.status(404).json({ error: "LISTING_NOT_FOUND" });
    if (listing.owner_id !== sellerId) {
      return res.status(403).json({ error: "NOT_LISTING_OWNER" });
    }

    // 2. We can allow duplicates or not, for gamification let's just insert
    const insertRes = await pool.query(
      `INSERT INTO transactions (listing_id, buyer_id, seller_id, status)
       VALUES ($1, $2, $3, 'completed') RETURNING *`,
      [listing_id, buyer_id, sellerId]
    );

    // 3. Mark listing as deleted (sold)
    await pool.query("UPDATE listings SET deleted_at = NOW() WHERE id = $1", [listing_id]);

    // 4. Update Gamification Rewards for both buyer and seller
    const buyerRewards = await refreshRewards(pool, buyer_id);
    const sellerRewards = await refreshRewards(pool, sellerId);

    // 5. Send automated confirmation chat message
    const systemMsg = `[System] 🤝 ITEM SOLD: "${listing.title}"\n\nSeller earned points -> current tokens: ${sellerRewards.tokens} (${sellerRewards.tier} tier)\nBuyer earned points -> current tokens: ${buyerRewards.tokens} (${buyerRewards.tier} tier)`;
    await sendMessage(sellerId, buyer_id, systemMsg);

    res.status(201).json({
      transaction: insertRes.rows[0],
      yourRewards: sellerRewards
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "TRANSACTION_FAILED" });
  }
}

module.exports = {
  createTransaction
};
