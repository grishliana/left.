// =========================
// CRASH PROTECTION
// =========================
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

// =========================
// ENV
// =========================
require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// =========================
// VALIDATION
// =========================
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("Missing ENV variables");
  process.exit(1);
}

// =========================
// EXPRESS
// =========================
const app = express();

app.get("/", (_, res) => res.send("Bot running"));

app.get("/status", (_, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    users: Object.keys(users).length
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on", PORT)
);

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// GROQ
// =========================
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// =========================
// STATE
// =========================
const users = {};
const buffers = new Map();
const queues = new Map();
const processing = new Map();
const botLog = [];

// =========================
// CLEAN OUTPUT
// =========================
function clean(text) {
  return (text || "")
    .replace(/<@!?\\d+>/g, "")
    .replace(/\\b\\w+#\\d{4}\\b/g, "")
    .trim();
}

// =========================
// RATE LIMIT
// =========================
function canSpeak() {
  const now = Date.now();
  while (botLog.length && now - botLog[0] > 60000) botLog.shift();
  return botLog.length < 5;
}

// =========================
// USER SYSTEM (WITH MEMORY)
// =========================
function getUser(id) {
  if (!users[id]) {
    users[id] = {
      affection: 0,
      trust: 0,
      familiarity: 0,
      relationship: "stranger",

      traits: {
        humor: Math.random(),
        energy: Math.random(),
        sass: Math.random(),
        curiosity: Math.random(),
        warmth: Math.random()
      },

      mood: "neutral",

      memories: {
        short: [],
        long: []
      }
    };
  }
  return users[id];
}

// =========================
// RELATIONSHIP
// =========================
function getRelationship(u) {
  const score = u.affection + u.trust + u.familiarity;

  if (score < 5) return "stranger";
  if (score < 15) return "acquaintance";
  if (score < 30) return "familiar";
  if (score < 60) return "friend";
  return "close_friend";
}

// =========================
// MOOD
// =========================
function updateMood(u, msg) {
  const t = msg.content.toLowerCase();

  if (t.includes("lol")) u.mood = "playful";
  else if (t.includes("?")) u.mood = "curious";
  else if (t.includes("bro")) u.mood = "teasing";
  else if (msg.content.length > 50) u.mood = "engaged";
  else u.mood = "neutral";
}

// =========================
// UPDATE USER + MEMORY
// =========================
function updateUser(u, msg) {
  const t = msg.content.toLowerCase();

  if (t.includes("lol")) u.affection += 1;
  if (t.includes("?")) u.trust += 1;
  if (msg.content.length > 30) u.familiarity += 1;

  u.affection = Math.max(-20, Math.min(100, u.affection));
  u.trust = Math.max(-20, Math.min(100, u.trust));
  u.familiarity = Math.max(0, Math.min(100, u.familiarity));

  u.relationship = getRelationship(u);

  // SHORT TERM MEMORY
  u.memories.short.push(msg.content);
  if (u.memories.short.length > 12) u.memories.short.shift();

  // LONG TERM MEMORY (important things)
  if (
    msg.content.length > 40 ||
    t.includes("i like") ||
    t.includes("i hate") ||
    t.includes("my ")
  ) {
    u.memories.long.push(msg.content);
    if (u.memories.long.length > 15) u.memories.long.shift();
  }
}

// =========================
// MEMORY CONTEXT
// =========================
function getMemoryContext(user) {
  const recent = user.memories.short.slice(-6).join("\n");
  const important = user.memories.long.slice(-4).join("\n");

  return `
Recent conversation:
${recent}

Important things:
${important}
`;
}

// =========================
// BUFFER + QUEUE
// =========================
function getBuffer(id) {
  if (!buffers.has(id)) buffers.set(id, []);
  return buffers.get(id);
}

function getQueue(id) {
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

// =========================
// PERSONA
// =========================
function getPersona(user) {
  return `
You are Aliya, a real girl chatting on Discord.

STYLE:
- natural, relaxed
- not dry, not try-hard

TEXTING:
- lowercase
- short to medium replies
- occasional "lol", "idk", "ngl" (not often)
- sometimes pauses "..."
- sometimes just reacts

BEHAVIOR:
- don't act like an assistant
- don't over-explain
- don't be perfect
- sometimes playful or teasing

MEMORY:
- remember what user said
- sometimes bring it up naturally
- don't force it

${getMemoryContext(user)}

MOOD: ${user.mood}
RELATIONSHIP: ${user.relationship}
`;
}

// =========================
// STYLE FILTER (BALANCED)
// =========================
function styleMessage(text) {
  if (!text) return "hm";

  text = text.toLowerCase();

  if (Math.random() < 0.15) {
    const fillers = ["lol", "ngl", "idk"];
    text = fillers[Math.floor(Math.random() * fillers.length)] + " " + text;
  }

  if (Math.random() < 0.2) {
    const endings = ["...", " lol"];
    text += endings[Math.floor(Math.random() * endings.length)];
  }

  if (text.length > 100 && Math.random() < 0.3) {
    text = text.split(".")[0];
  }

  return text.trim();
}

// =========================
// PROCESS QUEUE (NO DOUBLE TEXT)
// =========================
async function processQueue(channelId) {
  if (processing.get(channelId)) return;
  processing.set(channelId, true);

  const queue = getQueue(channelId);

  while (queue.length > 0) {
    const { message, user } = queue.shift();

    if (!canSpeak()) continue;

    botLog.push(Date.now());

    const buffer = getBuffer(channelId);

    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 1.1,
      max_tokens: 120,
      messages: [
        { role: "system", content: getPersona(user) },
        {
          role: "user",
          content: `
${getMemoryContext(user)}

Live chat:
${buffer.map(m => m.content).join("\n")}
`
        }
      ]
    });

    let reply = clean(res?.choices?.[0]?.message?.content || "hm");
    reply = styleMessage(reply);

    await message.reply(reply);
  }

  processing.set(channelId, false);
}

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const user = getUser(message.author.id);

  updateUser(user, message);
  updateMood(user, message);

  const buffer = getBuffer(message.channel.id);

  buffer.push({ content: message.content });
  if (buffer.length > 10) buffer.shift();

  const shouldReply =
    message.mentions.has(client.user) || Math.random() < 0.07;

  if (!shouldReply || !canSpeak()) return;

  const queue = getQueue(message.channel.id);
  queue.push({ message, user });

  processQueue(message.channel.id);
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);