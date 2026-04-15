const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/chat", (req, res) => {
  const message = req.body.message || "";
  res.json({
    reply: `Ai scris: ${message}`
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
