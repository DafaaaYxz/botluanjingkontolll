import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = 3000;
const DB_FILE = "./database.json";

app.use(express.json());
app.use(express.static("public"));

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* SAVE API KEY & PERSONA */
app.post("/save-setting", (req, res) => {
  const { apiKey, persona } = req.body;
  const db = readDB();

  if (apiKey) db.apiKey = apiKey;
  if (persona) db.persona = persona;

  writeDB(db);
  res.json({ success: true });
});

/* CHAT AI */
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  const db = readDB();

  if (!db.apiKey) {
    return res.json({ reply: "❌ API Key belum di set!" });
  }

  const messages = [
    { role: "system", content: db.persona },
    { role: "user", content: message }
  ];

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${db.apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "AI tidak merespon";

    db.chats.push({ user: message, ai: reply });
    writeDB(db);

    res.json({ reply });
  } catch (err) {
    res.json({ reply: "❌ Error koneksi ke DeepSeek" });
  }
});

app.listen(PORT, () => {
  console.log("Server running http://localhost:" + PORT);
});
