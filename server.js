
import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = 3000;
const DB_FILE = "./database.json";

app.use(express.json());
app.use(express.static("public"));

/* =========================
   DATABASE HELPERS
========================= */
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return { apiKey: "", persona: "", chats: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* =========================
   SAVE API KEY & PERSONA
========================= */
app.post("/save-setting", (req, res) => {
  const { apiKey, persona } = req.body;
  const db = readDB();

  if (typeof apiKey === "string") {
    db.apiKey = apiKey.trim();
  }

  if (typeof persona === "string") {
    db.persona = persona.trim();
  }

  writeDB(db);

  res.json({
    success: true,
    message: "API Key & Persona berhasil disimpan"
  });
});

/* =========================
   CHAT AI (DEEPSEEK)
========================= */
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  const db = readDB();

  if (!db.apiKey) {
    return res.json({
      reply: "❌ API Key belum diset. Silakan isi di halaman setting."
    });
  }

  if (!message || !message.trim()) {
    return res.json({ reply: "❌ Pesan kosong." });
  }

  try {
    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${db.apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                db.persona ||
                "Kamu adalah AI yang ramah, membantu, dan menjawab dengan jelas."
            },
            { role: "user", content: message }
          ],
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    // 🔥 DEBUG WAJIB (lihat di terminal)
    console.log("====== DEEPSEEK RESPONSE ======");
    console.log(JSON.stringify(data, null, 2));
    console.log("===============================");

    // ❌ ERROR DARI API
    if (!response.ok || data.error) {
      return res.json({
        reply:
          "❌ DeepSeek Error: " +
          (data.error?.message || "Unknown error")
      });
    }

    // ✅ PARSE RESPONSE AMAN
    const reply =
      data?.choices?.[0]?.message?.content ||
      "❌ AI tidak mengembalikan jawaban.";

    // Simpan history (opsional)
    db.chats.push({
      user: message,
      ai: reply,
      time: Date.now()
    });
    writeDB(db);

    res.json({ reply });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.json({
      reply: "❌ Server error: " + err.message
    });
  }
});

/* =========================
   SERVER START
========================= */
app.listen(PORT, () => {
  console.log(`🔥 Server running at http://localhost:${PORT}`);
});
