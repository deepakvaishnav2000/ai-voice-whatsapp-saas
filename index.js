// Load environment variables
require("dotenv").config();

// Import libraries
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const OpenAI = require("openai");
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
    // 🧠 GPT Prompt
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `
You are a smart virtual assistant for a SaaS company. 
Your job is to:
- Help users book appointments
- Understand natural language like "tomorrow at 3 PM"
- Extract info like name, time, contact details
- Be friendly and concise
- NEVER reply with just "OK", "Sorry", or unclear responses
- Always confirm actions clearly
If the user is unclear, politely ask for more info.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    let reply = completion.choices[0].message.content.trim();

    // ✅ Filter junk replies
    if (
      reply.toLowerCase() === "ok" ||
      reply.toLowerCase() === "okay" ||
      reply.toLowerCase().includes("i cannot")
    ) {
      reply = "I'm here to help! Could you please provide more details?";
    }

    // 💬 Send reply via Twilio
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: reply,
      from: `whatsapp:${process.env.WHATSAPP_NUMBER}`,
      to: from,
    });

    // 💾 Save to Supabase
    await pool.query(`
      INSERT INTO messages (from_number, incoming_message, gpt_reply)
      VALUES ($1, $2, $3)
    `, [from, message, reply]);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error handling WhatsApp:", err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
