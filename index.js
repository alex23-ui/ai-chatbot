
const express = require("express");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Chatbot is running");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({ error: "Mesaj lipsă" });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message
    });

    res.json({
      reply: response.output_text || "Nu am primit răspuns."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Eroare server",
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Serverul rulează pe portul ${port}`);
});
