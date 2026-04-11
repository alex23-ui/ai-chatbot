
const express = require("express");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// test
app.get("/", (req, res) => {
  res.send("Chatbot is running");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.json({ reply: "Mesaj gol." });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message
    });

    const reply = response.output_text || "Nu am primit răspuns.";

    res.json({ reply });

  } catch (error) {
    console.error("OpenAI error:", error);

    res.status(500).json({
      reply: "Eroare server: " + (error?.message || "necunoscută")
    });
  }
});

app.listen(port, () => {
  console.log("Server running on port " + port);
});
