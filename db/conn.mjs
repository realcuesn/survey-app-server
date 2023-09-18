import { MongoClient } from "mongodb";

const connectionString = "mongodb://AdminSqord:madsus123@165.232.124.122:27017/";
/* process.env.DATABASE_URI || */
const client = new MongoClient(connectionString);

let conn;
try {
  conn = await client.connect();
} catch (e) {
  console.error(e);
}

let db = conn.db("surveys");

export default db;