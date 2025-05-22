import express, { json } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import apiRoutes from "./src/Routes/ApiRoutes.js"
const app = express();
const router = express.Router();
import cors from 'cors';
dotenv.config({ path: './.env' });
const PORT = process.env.PORT;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json())
app.use("/api", apiRoutes);

app.use(router);


app.listen(PORT, console.log(`Backend is running on port:${PORT}`));
try {

  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log("MongoDB Connected to Cosmos DB");
      // Optionally, you can load other scripts or tasks
    })
    .catch((error) => {
      console.error("Error connecting to MongoDB:", error.message);
    });

} catch (error) {
  console.error("Connection failed:", error.message);
}

//dummy push at evening