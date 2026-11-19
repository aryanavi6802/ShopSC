#!/usr/bin/env node
/**
 * Demo seed — gives a fresh deployment a populated marketplace so visitors don't land on an empty page.
 *
 * Idempotent: if the demo sellers already have listings, nothing is inserted.
 * Runs automatically on backend startup when SEED_DEMO_DATA=true, or manually:
 *   node backend/scripts/seedDemo.js
 */
/* eslint-disable no-console */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Stable pseudonymous seller IDs (64-char hex, same shape as real stableIds).
const SELLER_A = "d0" + "a".repeat(62);
const SELLER_B = "d0" + "b".repeat(62);

const LISTINGS = [
  [SELLER_A, "MacBook Pro 14\" M3 — Like New", "Used for one semester. No scratches, original charger and box included.", 1400, "Electronics", "Like New", "Leavey Library"],
  [SELLER_A, "Introduction to Algorithms (CLRS, 4th Ed)", "Needed for CSCI 270. Some highlighting, all pages intact.", 35, "Textbooks", "Good", "Ronald Tutor Hall"],
  [SELLER_B, "LED Desk Lamp", "Adjustable brightness and color temperature, USB-C powered. Perfect for a dorm desk.", 20, "Furniture", "Good", "Parkside IRC"],
  [SELLER_B, "Calculus: Early Transcendentals (Stewart)", "8th edition. Light highlighting in chapters 1–4.", 25, "Textbooks", "Fair", "Doheny Library"],
  [SELLER_A, "Trek Marlin 5 Mountain Bike", "21-speed, recently tuned. Great for getting around campus.", 280, "Sports", "Good", "Parking Structure X"],
  [SELLER_B, "IKEA MALM Dresser (3 drawers)", "Moving out — must go by end of month. You pick up.", 60, "Furniture", "Good", "Gateway Apartments"],
  [SELLER_A, "Sony WH-1000XM4 Headphones", "Noise cancelling, case and cable included. Battery still great.", 150, "Electronics", "Like New", "Village"],
  [SELLER_B, "USC vs. UCLA Football Ticket", "Student section, single ticket. Transfer via the official app.", 45, "Tickets", "New", "Coliseum"],
  [SELLER_A, "Yamaha Acoustic Guitar (FG800)", "Comes with gig bag and spare strings.", 120, "Music", "Good", "Thornton School of Music"],
  [SELLER_B, "Trojan Hoodie (Size M)", "Official bookstore hoodie, worn twice.", 25, "Clothing", "Like New", "USC Bookstore"]
];

async function seedDemo(pool, { log = console.log } = {}) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM listings WHERE owner_id IN ($1, $2) AND deleted_at IS NULL",
    [SELLER_A, SELLER_B]
  );
  if (rows[0].n > 0) {
    log(`Demo seed: ${rows[0].n} demo listings already present, skipping`);
    return 0;
  }
  for (const [owner, title, description, price, category, condition, location] of LISTINGS) {
    await pool.query(
      `INSERT INTO listings (owner_id, title, description, price, category, condition, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [owner, title, description, price, category, condition, location]
    );
  }
  log(`Demo seed: inserted ${LISTINGS.length} listings`);
  return LISTINGS.length;
}

module.exports = { seedDemo, DEMO_SELLERS: [SELLER_A, SELLER_B] };

if (require.main === module) {
  const { pool, ensureSchema } = require("../src/config/database");
  ensureSchema()
    .then(() => seedDemo(pool))
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
