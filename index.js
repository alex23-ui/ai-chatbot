const express = require("express");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
Ești un chatbot prietenos, util și clar.
Răspunde scurt și natural.
Dacă utilizatorul scrie în română, răspunde în română.
Dacă nu știi ceva, spune sincer.
`;

const conversations = {};

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ reply: "Mesaj gol." });
    }

    const id = sessionId || "default";

    if (!conversations[id]) {
      conversations[id] = [];
    }

    conversations[id].push({
      role: "user",
      content: message
    });

    const history = conversations[id]
      .slice(-10)
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: systemPrompt,
      input: history
    });

    const reply = response.output_text || "Nu am primit răspuns.";

    conversations[id].push({
      role: "assistant",
      content: reply
    });

    return res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error);
    return res.status(500).json({
      reply: "Eroare server: " + (error?.message || "necunoscută")
    });
  }
});

app.listen(port, () => {
  console.log("Server running on port " + port);
});
