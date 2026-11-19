/**
 * Runtime flags read from the environment on each call (so tests can toggle them).
 *
 * DEMO_MODE=true  → public demo: the "Try the demo" login (email-suffix enroll) is allowed in production.
 * NODE_ENV=production without DEMO_MODE → email-suffix enroll is disabled; only verified Google sign-in works.
 */
const isProduction = () => process.env.NODE_ENV === "production";
const isDemoMode = () => process.env.DEMO_MODE === "true";
const emailEnrollAllowed = () => isDemoMode() || !isProduction();

const INSECURE_SECRETS = new Set(["", "dev-secret", "change-me"]);

/** Fail fast on unsafe production config instead of silently signing JWTs with "dev-secret". */
function assertProductionConfig() {
  if (!isProduction()) return;
  const secret = process.env.JWT_SECRET || "";
  if (INSECURE_SECRETS.has(secret) || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production");
  }
  if (!process.env.DB_URL) {
    throw new Error("DB_URL must be set in production");
  }
}

module.exports = {
  isProduction,
  isDemoMode,
  emailEnrollAllowed,
  assertProductionConfig
};
