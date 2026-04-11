
const express = require("express");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `
Ești un chatbot util, clar și politicos.
Răspunde pe scurt și direct.
Dacă utilizatorul scrie în română, răspunde în română.
`;

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Mesaj lipsă." });
    }

    const response = await client.responses.create({
      model: "gpt-5.4",
      instructions: systemPrompt,
      input: message,
    });

    return res.json({
      reply: response.output_text || "Nu am putut genera un răspuns.",
    });
  } catch (error) {
    console.error("OpenAI error:", error);

    return res.status(500).json({
      error: "A apărut o eroare la chatbot.",
      details: error?.message || "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
3. Creează folderul public
