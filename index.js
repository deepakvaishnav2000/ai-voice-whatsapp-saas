const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// PostgreSQL setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.get("/", (req, res) => {
  res.send("SaaS Backend is running!");
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const express = require('express');
const app = express();
const { Configuration, OpenAIApi } = require("openai");
const { Pool } = require('pg');
require('dotenv').config();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const port = process.env.PORT || 3000;

// 🧠 Setup OpenAI
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

// 🗃️ Setup Supabase (PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ WHATSAPP WEBHOOK (Twilio sends here)
app.post("/webhook/whatsapp", async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;

  console.log(`Received from ${from}: ${message}`);

  try {
    // 🔮 Ask GPT
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }]
    });

    const reply = completion.data.choices[0].message.content;

    // 💬 Send reply back via Twilio
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = require('twilio')(accountSid, authToken);

    await client.messages.create({
      body: reply,
      from: `whatsapp:${process.env.WHATSAPP_NUMBER}`,
      to: from
    });

    // 💾 Save to Supabase
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


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
