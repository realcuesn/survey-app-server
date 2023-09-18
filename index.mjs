import express from "express";
import cors from "cors";
import "./loadEnvironment.mjs";
import db from "./db/conn.mjs";
import "express-async-errors";
import posts from "./routes/posts.mjs";
import ServerlessHttp from "serverless-http";

/* const PORT = process.env.PORT || 5050; */
const app = express();

app.use(cors());
app.use(express.json());
console.log(db.namespace)
// Load the /posts routes
app.use("/api", posts);
app.get("/test", (req, res) => {
  res.send("working")
})
// Global error handling
app.use((err, _req, res, next) => {
  res.status(500).send("Uh oh! An unexpected error occurred.")
})

// start the Express server
/* app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
}); */

export const handler = ServerlessHttp(app)