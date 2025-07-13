// Load environment variables
require("dotenv").config();

// Import libraries
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const { Configuration, OpenAIApi } = require("openai");
const twilio = require("twilio");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Database connection (Supabase PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// OpenAI setup

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



// Health check route
app.get("/", (req, res) => {
  res.send("SaaS Backend is running!");
});

// Test DB route
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Webhook route
app.post("/webhook/whatsapp", async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;

  console.log(`Received from ${from}: ${message}`);

  try {
    // Call OpenAI
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
    });

    const reply = completion.data.choices[0].message.content;

    // Send reply via Twilio
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: reply,
      from: `whatsapp:${process.env.WHATSAPP_NUMBER}`,
      to: from,
    });

    // Save to Supabase
    await pool.query(`
      INSERT INTO messages (from_number, incoming_message, gpt_reply)
      VALUES ($1, $2, $3)
    `, [from, message, reply]);

    res.sendStatus(200);
  } catch (err) {
    console.error("Error handling WhatsApp:", err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});