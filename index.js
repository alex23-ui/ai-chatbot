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
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({ reply: "Mesaj lipsă." });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message
    });

    const reply = response.output_text || "Nu am putut genera răspuns.";

    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      reply: "A apărut o eroare la server."
    });
  }
});

app.listen(port, () => {
  console.log(`Serverul rulează pe portul ${port}`);
});
