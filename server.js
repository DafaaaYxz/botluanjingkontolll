import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

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
    // We only store persona and chats in the database now.
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    // Default structure if the file doesn't exist or is empty.
    return { persona: "", chats: [] };
  }
}

function writeDB(data) {
  // We only write persona and chats to the database.
  const dataToWrite = {
    persona: data.persona,
    chats: data.chats,
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(dataToWrite, null, 2));
}

/* =========================
   GET CURRENT SETTINGS
========================= */
app.get("/get-setting", (req, res) => {
  const db = readDB();
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  res.json({
    // Return a masked API key for security purposes on the frontend.
    // This prevents the full key from being exposed in the browser.
    apiKey: apiKey ? `sk-**********${apiKey.slice(-4)}` : "",
    persona: db.persona || "",
  });
});

/* =========================
   SAVE API KEY & PERSONA
========================= */
app.post("/save-setting", (req, res) => {
  const { apiKey, persona } = req.body;
  const db = readDB();

  // Persona is saved to the database as before.
  if (typeof persona === "string") {
    db.persona = persona.trim();
    writeDB(db);
  }

  // API key is now managed via the .env file.
  // We avoid writing the masked key back to the file.
  if (apiKey && typeof apiKey === "string" && !apiKey.includes('*')) {
    try {
      const envPath = '.env';
      let envContent = "";
      // Read existing .env file or start with an empty string.
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      const key = "DEEPSEEK_API_KEY";
      const newEntry = `${key}=${apiKey.trim()}`;

      // Update or add the API key.
      if (envContent.includes(key)) {
        envContent = envContent.replace(new RegExp(`^${key}=.*`, 'm'), newEntry);
      } else {
        envContent += `\n${newEntry}`;
      }

      fs.writeFileSync(envPath, envContent.trim());

      // IMPORTANT: Update process.env for the current running process
      // so the server doesn't need a restart to use the new key.
      process.env.DEEPSEEK_API_KEY = apiKey.trim();

      return res.json({
          success: true,
          message: "Pengaturan berhasil disimpan. API Key telah diperbarui."
      });

    } catch (error) {
      console.error("Error writing to .env file:", error);
      return res.status(500).json({ success: false, message: "Gagal menyimpan API Key." });
    }
  }

  // If only the persona was updated or the API key was masked.
  res.json({
    success: true,
    message: "Persona berhasil disimpan. API Key tidak berubah."
  });
});

/* =========================
   VALIDATE API KEY
========================= */
app.post("/validate-apikey", async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ success: false, message: "API Key tidak valid." });
  }

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      // We send a minimal payload to validate the key without using significant resources.
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1
      })
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      res.json({ success: true, message: "API Key valid." });
    } else {
      res.status(401).json({ success: false, message: data.error?.message || "API Key tidak valid." });
    }
  } catch (error) {
    console.error("API Key validation error:", error);
    res.status(500).json({ success: false, message: "Gagal memvalidasi API Key." });
  }
});


/* =========================
   CHAT AI (DEEPSEEK)
========================= */
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  const db = readDB();
  // API key is now read from environment variables.
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return res.json({
      reply: "❌ API Key belum di-set di file .env. Silakan isi di halaman Pengaturan."
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
          // Use the API key from the environment variable.
          "Authorization": `Bearer ${apiKey}`
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
      // Improved error message from the API.
      return res.json({
        reply:
          "❌ DeepSeek Error: " +
          (data.error?.message || "Terjadi kesalahan yang tidak diketahui.")
      });
    }

    // ✅ PARSE RESPONSE AMAN
    const reply =
      data?.choices?.[0]?.message?.content ||
      "❌ AI tidak mengembalikan jawaban.";

    // Save chat history to the database.
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
