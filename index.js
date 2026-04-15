const express = require("express");
const OpenAI = require("openai");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DATA_FILE = path.join(__dirname, "leads.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

function readLeads() {
  try {
    ensureDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Read leads error:", error);
    return [];
  }
}

function saveLeads(leads) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2));
}

function createEmptyLeadState() {
  return {
    active: false,
    name: "",
    phone: "",
    email: "",
    service: "",
    note: "",
    saved: false
  };
}

const conversations = {};
const leadState = {};

// EMAIL
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendLeadEmail(lead) {
  const to = process.env.NOTIFY_EMAIL || "NECHITAALEXANDRU67@gmail.com";

  await transporter.sendMail({
    from: `"SmartBot Chatbot" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Lead nou de la chatbot",
    text: `
Ai primit un lead nou.

Nume: ${lead.name}
Telefon: ${lead.phone}
Email: ${lead.email}
Serviciu: ${lead.service}
Detalii: ${lead.note}
Data: ${new Date(lead.createdAt).toLocaleString()}
    `,
  });
}

const businessInfo = `
You are the virtual assistant for SmartBot Solutions.

BUSINESS DETAILS:
- Business name: SmartBot Solutions
- Services:
  - Booking chatbot
  - Customer support chatbot
  - Lead generation chatbot
- Working hours:
  - Monday - Friday: 09:00 - 18:00
  - Saturday: 10:00 - 14:00
  - Sunday: Closed

YOUR GOAL:
- Talk naturally like a real assistant
- Understand what the visitor wants
- Help them clearly and politely
- If they are interested, collect these details naturally:
  1. name
  2. phone
  3. email
  4. service they want
  5. short note about what they need

IMPORTANT RULES:
- If the user writes in Romanian, reply in Romanian.
- If the user writes in English, reply in English.
- Do NOT ask all questions at once.
- Ask only for the missing information.
- Do NOT repeat the exact same question again and again.
- Be short, helpful and professional.
- If the user already gave information, do not ask for it again.
- If all lead details are collected, confirm politely that the request has been saved.
- Do not invent business details outside the info above.
`;

function wantsLead(message) {
  const lower = message.toLowerCase();

  return (
    lower.includes("oferta") ||
    lower.includes("ofertă") ||
    lower.includes("pret") ||
    lower.includes("preț") ||
    lower.includes("interesat") ||
    lower.includes("vreau demo") ||
    lower.includes("demo") ||
    lower.includes("contact") ||
    lower.includes("vreau sa fiu contactat") ||
    lower.includes("vreau să fiu contactat") ||
    lower.includes("booking") ||
    lower.includes("need chatbot") ||
    lower.includes("want chatbot") ||
    lower.includes("call me")
  );
}

function wantsReset(message) {
  const lower = message.toLowerCase().trim();

  return (
    lower === "reset" ||
    lower === "restart" ||
    lower === "incepe din nou" ||
    lower === "începe din nou" ||
    lower === "anuleaza" ||
    lower === "anulează"
  );
}

function isValidName(text) {
  const t = text.trim();
  if (t.length < 2 || t.length > 50) return false;
  if (/\d/.test(t)) return false;
  if (/@/.test(t)) return false;
  return /^[a-zA-ZăâîșțĂÂÎȘȚ\s\-]+$/.test(t);
}

function extractPhone(text) {
  const match = text.match(/(\+?\d[\d\s]{7,15}\d)/);
  return match ? match[1].replace(/\s+/g, "") : "";
}

function extractEmail(text) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function extractService(text) {
  const lower = text.toLowerCase();

  if (lower.includes("booking")) return "Booking chatbot";
  if (lower.includes("support")) return "Customer support chatbot";
  if (lower.includes("lead")) return "Lead generation chatbot";
  if (lower.includes("programari") || lower.includes("programări")) return "Booking chatbot";
  if (lower.includes("customer")) return "Customer support chatbot";
  if (lower.includes("clients") || lower.includes("clienți") || lower.includes("clienti")) {
    return "Lead generation chatbot";
  }

  return "";
}

function extractLeadDetails(message, currentState) {
  const updated = { ...currentState };
  const text = message.trim();

  const email = extractEmail(text);
  if (!updated.email && email) {
    updated.email = email;
  }

  const phone = extractPhone(text);
  if (!updated.phone && phone) {
    updated.phone = phone;
  }

  const service = extractService(text);
  if (!updated.service && service) {
    updated.service = service;
  }

  if (!updated.name) {
    const explicitName = text.match(
      /(?:ma numesc|mă numesc|numele meu este|sunt|my name is|i am)\s+([a-zA-ZăâîșțĂÂÎȘȚ\s\-]{2,50})/i
    );

    if (explicitName) {
      updated.name = explicitName[1].trim();
    } else if (isValidName(text)) {
      updated.name = text;
    }
  }

  if (
    !updated.note &&
    text.length > 8 &&
    !extractEmail(text) &&
    !extractPhone(text) &&
    !isValidName(text) &&
    !extractService(text)
  ) {
    updated.note = text;
  }

  return updated;
}

function getMissingFields(state) {
  const missing = [];

  if (!state.name) missing.push("name");
  if (!state.phone) missing.push("phone");
  if (!state.email) missing.push("email");
  if (!state.service) missing.push("service");
  if (!state.note) missing.push("note");

  return missing;
}

function hasCompleteLead(state) {
  return (
    !!state.name &&
    !!state.phone &&
    !!state.email &&
    !!state.service &&
    !!state.note
  );
}

function buildLeadSummary(state) {
  return {
    name: state.name,
    phone: state.phone,
    email: state.email,
    service: state.service,
    note: state.note,
  };
}

app.get("/api/leads", (req, res) => {
  res.json(readLeads());
});

app.delete("/api/leads/:id", (req, res) => {
  const id = Number(req.params.id);
  const leads = readLeads().filter((lead) => lead.id !== id);
  saveLeads(leads);
  res.json({ success: true });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ reply: "Mesaj gol." });
    }

    const id = sessionId || "default";

    if (!conversations[id]) conversations[id] = [];
    if (!leadState[id]) leadState[id] = createEmptyLeadState();

    if (wantsReset(message)) {
      leadState[id] = createEmptyLeadState();
      conversations[id] = [];
      return res.json({
        reply: "Am resetat conversația. Spune-mi cu ce te pot ajuta.",
      });
    }

    conversations[id].push({
      role: "user",
      content: message,
    });

    if (wantsLead(message) || leadState[id].active) {
      leadState[id].active = true;
      leadState[id] = extractLeadDetails(message, leadState[id]);
      leadState[id].active = true;

      if (hasCompleteLead(leadState[id]) && !leadState[id].saved) {
        const lead = {
          id: Date.now(),
          ...buildLeadSummary(leadState[id]),
          createdAt: new Date().toISOString(),
          sessionId: id,
        };

        const leads = readLeads();
        leads.push(lead);
        saveLeads(leads);

        leadState[id].saved = true;

        try {
          await sendLeadEmail(lead);
        } catch (emailError) {
          console.error("Email error:", emailError);
        }

        const confirmation = `Perfect, ${lead.name}. Am salvat cererea ta pentru ${lead.service}. Te vom contacta în curând la ${lead.phone} sau pe ${lead.email}.`;

        conversations[id].push({
          role: "assistant",
          content: confirmation,
        });

        leadState[id] = createEmptyLeadState();

        return res.json({ reply: confirmation });
      }

      const missing = getMissingFields(leadState[id]);
      const knownLeadData = JSON.stringify(buildLeadSummary(leadState[id]), null, 2);

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        instructions: `${businessInfo}

Current lead data already collected:
${knownLeadData}

Missing fields:
${missing.join(", ") || "none"}

TASK:
- Reply naturally.
- Ask only for the next missing piece of info.
- Do not repeat info already collected.
- Keep the message short.
- If the user gave partial info, acknowledge it naturally.
`,
        input: message,
      });

      const reply = response.output_text || "Nu am primit răspuns.";

      conversations[id].push({
        role: "assistant",
        content: reply,
      });

      return res.json({ reply });
    }

    const history = conversations[id]
      .slice(-10)
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: businessInfo,
      input: history || message,
    });

    const reply = response.output_text || "Nu am primit răspuns.";

    conversations[id].push({
      role: "assistant",
      content: reply,
    });

    return res.json({ reply });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      reply: "Eroare server: " + (error?.message || "necunoscută"),
    });
  }
});

app.listen(port, () => {
  ensureDataFile();
  console.log(`Server running on port ${port}`);
});
