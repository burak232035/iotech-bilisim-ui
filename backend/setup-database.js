const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: __dirname + "/.env" });

// DB_NAME selects the database (test instance: drone_tracking_test).
// Identifier is validated because CREATE DATABASE can't take a bind parameter.
const DB_NAME = process.env.DB_NAME || "drone_tracking";
if (!/^[a-z_][a-z0-9_]*$/.test(DB_NAME)) {
  console.error(`❌ Invalid DB_NAME: ${DB_NAME}`);
  process.exit(1);
}

async function setupDatabase() {
  console.log("🔧 PostgreSQL Database Setup");
  console.log("================================\n");

  // First, connect to postgres database to create our database
  const adminClient = new Client({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: "postgres", // Connect to default postgres database
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres"
  });

  try {
    console.log("1️⃣ Connecting to PostgreSQL...");
    await adminClient.connect();
    console.log("✅ Connected\n");

    // Check if database exists
    console.log("2️⃣ Checking if database exists...");
    const dbCheck = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DB_NAME]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`📦 Creating database '${DB_NAME}'...`);
      await adminClient.query(`CREATE DATABASE ${DB_NAME}`);
      console.log("✅ Database created\n");
    } else {
      console.log("✅ Database already exists\n");
    }

    await adminClient.end();

    // Now connect to our new database and run schema
    console.log(`3️⃣ Connecting to ${DB_NAME} database...`);
    const dbClient = new Client({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: DB_NAME,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres"
    });

    await dbClient.connect();
    console.log("✅ Connected\n");

    // Read and execute schema
    console.log("4️⃣ Running database schema...");
    const schemaPath = path.join(__dirname, "db", "init.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    await dbClient.query(schemaSql);
    console.log("✅ Schema created successfully\n");

    await dbClient.end();

    console.log("================================");
    console.log("🎉 Database setup completed!");
    console.log("You can now start your backend server.");
    process.exit(0);

  } catch (err) {
    console.error("❌ Error during setup:", err.message);
    console.error("\nTroubleshooting:");
    console.error("- Make sure PostgreSQL is running");
    console.error("- Check your .env file for correct credentials");
    console.error("- Verify DB_PASSWORD is correct");
    process.exit(1);
  }
}

setupDatabase();
