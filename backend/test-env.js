// Preloaded with `node -r ./backend/test-env.js …` to point a process at the
// test instance (port 3002, drone_tracking_test) without touching backend/.env.
// Values set here win because dotenv never overrides existing env vars.
process.env.PORT = process.env.PORT || "3002";
process.env.DB_NAME = process.env.DB_NAME || "drone_tracking_test";
