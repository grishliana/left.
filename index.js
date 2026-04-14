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

if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("Missing ENV variables");
  process.exit(1);
}

// =========================
// EXPRESS SERVER (RENDER FIX)
// =========================
const app = express();

app.get("/", (req, res) => {
  res.send("🤖 Aliya bot is running");
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    usersTracked: Object.keys(users).length,
    queueSize: [...queues.values()].reduce((a, q) => a + q.length, 0)
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

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

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// =========================
// STATE
// =========================
const users = {};
const chatBuffers = new Map();
const queues = new Map();
const processing = new Map();
const lastReply = new Map();

// =========================
// GLOBAL PERSONALITY DRIFT
// =========================
let globalPersonality = 0.5;

setInterval(() => {
  const drift = (Math.random() - 0.5) * 0.02;
  globalPersonality = Math.max(0, Math.min(1, globalPersonality + drift));
}, 60000);

// =========================
// HELPERS
// =========================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      friendship: 0,
      kindness: 0,
      mood: "neutral",
      lastSeen: Date.now(),
      attentionScore: 0,
      relationship: "stranger",
      affection: 0,
      trust: 0,
      familiarity: 0,
      emotionalMemory: []
    };
  }
  return users[id];
}

function getBuffer(channelId) {
  if (!chatBuffers.has(channelId)) chatBuffers.set(channelId, []);
  return chatBuffers.get(channelId);
}

function getQueue(channelId) {
  if (!queues.has(channelId)) queues.set(channelId, []);
  return queues.get(channelId);
}

// =========================
// RELATIONSHIP SYSTEM
// =========================
function computeRelationship(user) {
  const score = user.affection + user.trust + user.familiarity;

  if (score < 5) return "stranger";
  if (score < 15) return "acquaintance";
  if (score < 30) return "familiar";
  if (score < 50) return "friend";
  if (score < 80) return "close_friend";
  return "bonded";
}

function relationshipModifiers(user) {
  switch (user.relationship) {
    case "stranger": return { warmth: 0.2, talk: 0.5 };
    case "acquaintance": return { warmth: 0.4, talk: 0.7 };
    case "familiar": return { warmth: 0.6, talk: 0.9 };
    case "friend": return { warmth: 0.75, talk: 1.1 };
    case "close_friend": return { warmth: 0.9, talk: 1.3 };
    case "bonded": return { warmth: 1.1, talk: 1.5 };
    default: return { warmth: 0.5, talk: 1 };
  }
}

// =========================
// EMOTION EVOLUTION
// =========================
function updateEmotion(user, message) {
  const t = message.content.toLowerCase();

  let aff = 0, trust = 0, fam = 0;

  if (t.includes("thanks") || t.includes("lol") || t.includes("nice")) {
    aff += 1; fam += 1;
  }

  if (t.includes("shut up") || t.includes("stupid")) {
    aff -= 3; trust -= 2;
  }

  if (message.content.length > 30) fam += 1;
  if (message.content.includes("?")) trust += 1;

  user.affection = clamp(user.affection + aff, -20, 100);
  user.trust = clamp(user.trust + trust, -20, 100);
  user.familiarity = clamp(user.familiarity + fam, 0, 100);

  user.kindness += aff;
  user.kindness = clamp(user.kindness, -10, 10);

  user.mood =
    user.kindness > 5 ? "warm" :
    user.kindness < -5 ? "cold" :
    "neutral";

  user.relationship = computeRelationship(user);

  user.emotionalMemory.push({
    text: message.content,
    time: Date.now(),
    vibe: aff > 0 ? "positive" : aff < 0 ? "negative" : "neutral"
  });

  if (user.emotionalMemory.length > 20) {
    user.emotionalMemory.shift();
  }

  user.lastSeen = Date.now();
}

// =========================
// HUMAN DELAY
// =========================
function delay(text, user) {
  let base = 400 + text.length * 15;

  if (user.mood === "cold") base *= 0.7;
  if (user.mood === "warm") base *= 1.2;

  return Math.min(base + Math.random() * 800, 3500);
}

// =========================
// SAFE CHECK
// =========================
function isUnsafe(text) {
  return ["sex","porn","nude","horny","nsfw","18+","kiss","bed"]
    .some(w => (text || "").toLowerCase().includes(w));
}

// =========================
// BUFFER ACTIVITY
// =========================
function activityScore(buffer) {
  let score = 0;
  for (const m of buffer.slice(-6)) {
    if (m.content.includes("?")) score += 0.2;
    if (m.content.length > 20) score += 0.1;
  }
  return Math.min(score, 1);
}

// =========================
// PERSONA
// =========================
function getPersona(user) {
  const mod = relationshipModifiers(user);

  return `
You are Aliya.

Tone: ${globalPersonality < 0.6 ? "calm" : "warm expressive"}
Relationship: ${user.relationship}
Warmth: ${mod.warmth}

RULES:
- 1–2 sentences max
- realistic Discord user
- emotional memory
`;
}

// =========================
// QUEUE PROCESSOR
// =========================
async function processQueue(channelId) {
  if (processing.get(channelId)) return;
  processing.set(channelId, true);

  const queue = getQueue(channelId);

  while (queue.length > 0) {
    const { message, user } = queue.shift();

    const buffer = getBuffer(channelId);

    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 120,
      temperature: 1.1,
      messages: [
        { role: "system", content: getPersona(user) },
        {
          role: "user",
          content: buffer.map(m => `${m.user}: ${m.content}`).join("\n")
        }
      ]
    });

    const reply = res?.choices?.[0]?.message?.content || "hm";

    await message.reply(reply);

    lastReply.set(user.id, Date.now());
    user.friendship++;
  }

  processing.set(channelId, false);
}

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const user = getUser(message.author.id);

    if (isUnsafe(message.content)) {
      return message.reply("let's not talk about that");
    }

    updateEmotion(user, message);

    const buffer = getBuffer(message.channel.id);

    buffer.push({
      user: message.author.username,
      content: message.content
    });

    if (buffer.length > 12) buffer.shift();

    if (Math.random() < 0.1) return;

    const queue = getQueue(message.channel.id);
    queue.push({ message, user });

    processQueue(message.channel.id);

  } catch (err) {
    console.error(err);
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);