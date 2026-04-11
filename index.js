const express = require("express");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DATA_FILE = path.join(__dirname, "appointments.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

function readAppointments() {
  try {
    ensureDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Read appointments error:", error);
    return [];
  }
}

function saveAppointments(appointments) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2));
}

const businessInfo = `
Numele firmei: FreshCut Barbershop
Program:
- Luni - Vineri: 09:00 - 19:00
- Sâmbătă: 10:00 - 16:00
- Duminică: Închis

Adresă: 12 King Street, London
Telefon: 07123 456789

Servicii:
- Tuns bărbați - £15
- Tuns + barbă - £25
- Barbă - £10

Reguli:
- Răspunde scurt, clar și politicos.
- Dacă utilizatorul scrie în română, răspunde în română.
- Dacă întreabă despre program, servicii, adresă sau prețuri, folosește datele firmei.
- Dacă vrea programare, cere pe rând: nume, serviciu, zi, oră.
`;

const conversations = {};
const bookingState = {};

function isBookingIntent(message) {
  const lower = message.toLowerCase();
  return (
    lower.includes("programare") ||
    lower.includes("rezervare") ||
    lower.includes("vreau sa ma programez") ||
    lower.includes("vreau să mă programez") ||
    lower.includes("appointment") ||
    lower.includes("book")
  );
}

function extractBookingDetails(message, state = {}) {
  const updated = { ...state };
  const text = message.trim();
  const lower = text.toLowerCase();

  if (!updated.name) {
    const match =
      text.match(/(?:ma numesc|mă numesc|numele meu este|sunt)\s+([a-zA-Zăâîșț\- ]{2,})/i) ||
      text.match(/^([A-ZĂÂÎȘȚ][a-zăâîșț\-]+(?:\s+[A-ZĂÂÎȘȚ]?[a-zăâîșț\-]+){0,2})$/);
    if (match) {
      updated.name = match[1].trim();
    }
  }

  if (!updated.service) {
    if (lower.includes("tuns + barbă") || lower.includes("tuns si barba") || lower.includes("tuns și barbă")) {
      updated.service = "Tuns + barbă";
    } else if (lower.includes("barbă") || lower.includes("barba")) {
      updated.service = "Barbă";
    } else if (lower.includes("tuns")) {
      updated.service = "Tuns bărbați";
    }
  }

  if (!updated.day) {
    const dayMatch = text.match(/\b(luni|marți|marti|miercuri|joi|vineri|sâmbătă|sambata|duminică|duminica)\b/i);
    if (dayMatch) {
      updated.day = dayMatch[1];
    }
  }

  if (!updated.time) {
    const timeMatch = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (timeMatch) {
      updated.time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
    }
  }

  return updated;
}

function nextBookingQuestion(state) {
  if (!state.name) return "Sigur. Cum te numești?";
  if (!state.service) return "Ce serviciu dorești? Avem: Tuns bărbați, Tuns + barbă, Barbă.";
  if (!state.day) return "În ce zi dorești programarea?";
  if (!state.time) return "La ce oră dorești programarea? Exemplu: 14:30";
  return null;
}

app.get("/api/appointments", (req, res) => {
  const appointments = readAppointments();
  res.json(appointments);
});

app.delete("/api/appointments/:id", (req, res) => {
  const id = Number(req.params.id);
  const appointments = readAppointments();
  const filtered = appointments.filter((item) => item.id !== id);

  saveAppointments(filtered);
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
    if (!bookingState[id]) {
      bookingState[id] = {
        active: false,
        name: "",
        service: "",
        day: "",
        time: "",
      };
    }

    conversations[id].push({
      role: "user",
      content: message,
    });

    if (isBookingIntent(message) || bookingState[id].active) {
      bookingState[id] = {
        ...bookingState[id],
        ...extractBookingDetails(message, bookingState[id]),
        active: true,
      };

      const question = nextBookingQuestion(bookingState[id]);

      if (question) {
        return res.json({ reply: question });
      }

      const appointments = readAppointments();
      const newAppointment = {
        id: Date.now(),
        name: bookingState[id].name,
        service: bookingState[id].service,
        day: bookingState[id].day,
        time: bookingState[id].time,
        createdAt: new Date().toISOString(),
        sessionId: id,
      };

      appointments.push(newAppointment);
      saveAppointments(appointments);

      const confirmation = `Perfect, ${newAppointment.name}. Te-am programat pentru ${newAppointment.service}, în ziua de ${newAppointment.day}, la ora ${newAppointment.time}.`;

      conversations[id].push({
        role: "assistant",
        content: confirmation,
      });

      bookingState[id] = {
        active: false,
        name: "",
        service: "",
        day: "",
        time: "",
      };

      return res.json({ reply: confirmation });
    }

    const history = conversations[id]
      .slice(-10)
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: businessInfo,
      input: history,
    });

    const reply = response.output_text || "Nu am primit răspuns.";

    conversations[id].push({
      role: "assistant",
      content: reply,
    });

    return res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error);
    return res.status(500).json({
      reply: "Eroare server: " + (error?.message || "necunoscută"),
    });
  }
});

app.listen(port, () => {
  ensureDataFile();
  console.log(`Server running on port ${port}`);
});
