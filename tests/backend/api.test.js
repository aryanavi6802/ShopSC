/**
 * API integration tests: real Express app + real PostgreSQL (no mocks for HTTP or DB).
 *
 * Needs a throwaway database:  TEST_DB_URL=postgresql://postgres:postgres@localhost:5432/shop_sc_test npm test
 * Skipped (not failed) when TEST_DB_URL is unset, so `npm test` still works without Postgres.
 */
const TEST_DB_URL = process.env.TEST_DB_URL;
const describeDb = TEST_DB_URL ? describe : describe.skip;

process.env.DB_URL = TEST_DB_URL || process.env.DB_URL;
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-prod-checks";
process.env.LOG_MODE = "disabled";

// Uploads are written under process.cwd()/uploads — keep test files out of the repo.
const os = require("os");
const fs = require("fs");
const path = require("path");
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "shopsc-test-")));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { Identity } = require("@semaphore-protocol/identity");

const SELLER = "a".repeat(64);
const OTHER_USER = "b".repeat(64);
const tokenFor = (sub) => jwt.sign({ sub }, process.env.JWT_SECRET, { expiresIn: "5m" });
const commitment = () => new Identity().commitment.toString();

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

describeDb("Shop-SC API", () => {
  let app;
  let pool;

  beforeAll(async () => {
    const db = require("../../backend/src/config/database");
    pool = db.pool;
    await db.ensureSchema();
    await pool.query(
      "TRUNCATE listings, messages, identity_commitments, used_nullifiers, transactions, user_rewards RESTART IDENTITY"
    );
    await require("../../backend/src/services/groupManager").initGroup();
    app = require("../../backend/src/app");
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DEMO_MODE;
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("health", () => {
    test("GET /api/health returns ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("enrollment", () => {
    test("rejects a request without an identity commitment", async () => {
      const res = await request(app).post("/api/auth/enroll").send({ email: "tommy@usc.edu" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_IDENTITY_COMMITMENT");
    });

    test("rejects non-USC email addresses", async () => {
      const res = await request(app)
        .post("/api/auth/enroll")
        .send({ email: "someone@gmail.com", identityCommitment: commitment() });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("USC_EMAIL_REQUIRED");
    });

    test("enrolls a USC identity and updates the group root", async () => {
      const before = await request(app).get("/api/group-root");
      const res = await request(app)
        .post("/api/auth/enroll")
        .send({ email: "tommy@usc.edu", identityCommitment: commitment() });
      expect(res.status).toBe(201);
      expect(res.body.enrolled).toBe(true);
      const after = await request(app).get("/api/group-root");
      expect(after.body).not.toEqual(before.body);
    });

    test("re-enrolling the same identity is idempotent", async () => {
      const c = commitment();
      await request(app).post("/api/auth/enroll").send({ email: "a@usc.edu", identityCommitment: c });
      const res = await request(app).post("/api/auth/enroll").send({ email: "a@usc.edu", identityCommitment: c });
      expect(res.status).toBe(200);
      expect(res.body.alreadyEnrolled).toBe(true);
    });

    test("email enrollment is disabled in production unless DEMO_MODE is on", async () => {
      process.env.NODE_ENV = "production";
      const blocked = await request(app)
        .post("/api/auth/enroll")
        .send({ email: "tommy@usc.edu", identityCommitment: commitment() });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe("EMAIL_ENROLL_DISABLED");

      process.env.DEMO_MODE = "true";
      const allowed = await request(app)
        .post("/api/auth/enroll")
        .send({ email: "demo@usc.edu", identityCommitment: commitment() });
      expect(allowed.status).toBe(201);
    });

    test("verify-proof rejects malformed payloads before doing any crypto", async () => {
      const res = await request(app).post("/api/auth/verify-proof").send({ stableId: "../../etc" });
      expect(res.status).toBe(400);
    });
  });

  describe("listings", () => {
    let listingId;

    test("browsing is public", async () => {
      const res = await request(app).get("/api/listings");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("creating a listing requires a session token", async () => {
      const res = await request(app).post("/api/listings").send({ title: "Desk lamp" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("MISSING_BEARER_TOKEN");
    });

    test("rejects a forged token", async () => {
      const forged = jwt.sign({ sub: SELLER }, "not-the-server-secret");
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${forged}`)
        .send({ title: "Desk lamp" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_TOKEN");
    });

    test("validates the title", async () => {
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`)
        .send({ price: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("MISSING_TITLE");
    });

    test("creates a listing owned by the token's pseudonymous id", async () => {
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`)
        .send({ title: "CLRS textbook", price: 35, category: "Textbooks", condition: "Good" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: "CLRS textbook", owner_id: SELLER, category: "Textbooks" });
      listingId = res.body.id;
    });

    test("the new listing is visible publicly and under /mine", async () => {
      const one = await request(app).get(`/api/listings/${listingId}`);
      expect(one.status).toBe(200);
      expect(one.body.title).toBe("CLRS textbook");

      const mine = await request(app).get("/api/listings/mine").set("Authorization", `Bearer ${tokenFor(SELLER)}`);
      expect(mine.status).toBe(200);
      expect(mine.body.map((l) => l.id)).toContain(listingId);
    });

    test("returns 400 for a non-numeric id and 404 for a missing one", async () => {
      expect((await request(app).get("/api/listings/abc")).status).toBe(400);
      expect((await request(app).get("/api/listings/999999")).status).toBe(404);
    });

    test("another user cannot delete someone else's listing", async () => {
      const res = await request(app)
        .delete(`/api/listings/${listingId}`)
        .set("Authorization", `Bearer ${tokenFor(OTHER_USER)}`);
      expect(res.status).toBe(404);
      expect((await request(app).get(`/api/listings/${listingId}`)).status).toBe(200);
    });

    test("the owner can delete their listing", async () => {
      const res = await request(app)
        .delete(`/api/listings/${listingId}`)
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`);
      expect(res.status).toBe(204);
    });
  });

  describe("image uploads", () => {
    test("accepts a PNG and stores it under a server-chosen .png name", async () => {
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`)
        .field("title", "Lamp with photo")
        .attach("image", PNG, { filename: "photo.html", contentType: "image/png" });
      expect(res.status).toBe(201);
      expect(res.body.image_url).toMatch(new RegExp(`^/uploads/${SELLER}/\\d+\\.png$`));

      const img = await request(app).get(res.body.image_url);
      expect(img.status).toBe(200);
      expect(img.headers["content-type"]).toBe("image/png");
      expect(img.headers["x-content-type-options"]).toBe("nosniff");
    });

    test("rejects non-image uploads with 400", async () => {
      const res = await request(app)
        .post("/api/listings")
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`)
        .field("title", "Sneaky")
        .attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.html", contentType: "text/html" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("UNSUPPORTED_IMAGE_TYPE");
    });
  });

  describe("chat", () => {
    test("requires authentication", async () => {
      const res = await request(app).get("/api/chats/conversations");
      expect(res.status).toBe(401);
    });

    test("delivers a message between two pseudonymous users", async () => {
      const sent = await request(app)
        .post("/api/chats/messages")
        .set("Authorization", `Bearer ${tokenFor(SELLER)}`)
        .send({ recipient_id: OTHER_USER, body: "Is the lamp still available?" });
      expect(sent.status).toBe(201);

      const inbox = await request(app)
        .get(`/api/chats/messages?with=${SELLER}`)
        .set("Authorization", `Bearer ${tokenFor(OTHER_USER)}`);
      expect(inbox.status).toBe(200);
      expect(inbox.body.messages.map((m) => m.body)).toContain("Is the lamp still available?");
    });
  });

  describe("demo seed", () => {
    test("inserts sample listings once and is idempotent", async () => {
      const { seedDemo } = require("../../backend/scripts/seedDemo");
      const quiet = { log: () => {} };
      const first = await seedDemo(pool, quiet);
      const second = await seedDemo(pool, quiet);
      expect(first).toBeGreaterThan(0);
      expect(second).toBe(0);
    });
  });
});
