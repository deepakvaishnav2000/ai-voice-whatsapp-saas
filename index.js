require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const twilio = require("twilio");
const chrono = require("chrono-node");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health route
app.get("/", (req, res) => {
  res.send("SaaS Backend is running!");
});

// DB test route
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WhatsApp Webhook
app.post("/webhook/whatsapp", async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;

  console.log(`Received from ${from}: ${message}`);

  try {
    // Extract data
    const nameMatch = message.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/);
    const phoneMatch = message.match(/\b\d{10}\b/);
    const dateParsed = chrono.parseDate(message);

    const name = nameMatch ? nameMatch[1] : null;
    const phone = phoneMatch ? phoneMatch[0] : null;
    const appointmentTime = dateParsed ? dateParsed.toISOString() : null;

    let reply = "";

    // If all info found, confirm booking
    if (name && phone && appointmentTime) {
      await pool.query(
        `INSERT INTO appointments (name, phone, time, source) VALUES ($1, $2, $3, 'whatsapp')`,
        [name, phone, appointmentTime]
      );

      reply = `✅ Appointment booked for *${name}* at *${new Date(
        appointmentTime
      ).toLocaleString()}*. We’ll send you a reminder.`;
    } else {
      // Ask GPT to assist smartly
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a smart WhatsApp appointment assistant for salon services. 
Never say "I'm an AI" or "I can't help".
If the user gives name, phone number, and time — just confirm the appointment.
If anything is missing, ask politely ONCE.
Never reply with only 'OK'. Always be helpful.`,
          },
          { role: "user", content: message },
        ],
      });

      reply = completion.choices[0].message.content;
    }

    // Send WhatsApp reply via Twilio
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: reply,
      from: `whatsapp:${process.env.WHATSAPP_NUMBER}`,
      to: from,
    });

    // Log message
    await pool.query(
      `INSERT INTO messages (from_number, incoming_message, gpt_reply) VALUES ($1, $2, $3)`,
      [from, message, reply]
    );

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
