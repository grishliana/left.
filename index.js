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
// SAFETY CHECK
// =========================
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("Missing ENV variables");
  process.exit(1);
}

// =========================
// EXPRESS (RENDER FIX)
// =========================
const app = express();

app.get("/", (req, res) => {
  res.send("🤖 Bot running");
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    usersTracked: users ? Object.keys(users).length : 0,
    queueSize: [...queues.values()].reduce((a, q) => a + q.length, 0)
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on ${PORT}`);
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
const chatBuffers = new Map();
const queues = new Map();
const processing = new Map();
const lastReply = new Map();

// =========================
// CLEANUP SYSTEM (IMPORTANT)
// =========================
setInterval(() => {
  const now = Date.now();

  // remove inactive users
  for (const id in users) {
    if (now - users[id].lastSeen > 1000 * 60 * 60 * 6) {
      delete users[id];
    }
  }

  // trim buffers
  for (const [id, buffer] of chatBuffers.entries()) {
    if (buffer.length > 50) {
      buffer.splice(0, buffer.length - 12);
    }
  }
}, 3600000);

// =========================
// FIX STUCK QUEUES
// =========================
setInterval(() => {
  for (const [channelId, running] of processing.entries()) {
    if (running) {
      console.log("⚠️ Reset stuck queue:", channelId);
      processing.set(channelId, false);
    }
  }
}, 60000);

// =========================
// HELPERS
// =========================
function getUser(id) {
  if (!users[id]) {
    users[id] = {
      friendship: 0,
      kindness: 0,
      mood: "neutral",
      lastSeen: Date.now(),
      affection: 0,
      trust: 0,
      familiarity: 0,
      emotionalMemory: []
    };
  }
  return users[id];
}

function getBuffer(id) {
  if (!chatBuffers.has(id)) chatBuffers.set(id, []);
  return chatBuffers.get(id);
}

function getQueue(id) {
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

// =========================
// RELATIONSHIP SYSTEM
// =========================
function computeRelationship(u) {
  const score = u.affection + u.trust + u.familiarity;

  if (score < 5) return "stranger";
  if (score < 15) return "acquaintance";
  if (score < 30) return "familiar";
  if (score < 50) return "friend";
  if (score < 80) return "close_friend";
  return "bonded";
}

// =========================
// EMOTION UPDATE
// =========================
function updateEmotion(user, msg) {
  const t = msg.content.toLowerCase();

  let aff = 0, trust = 0, fam = 0;

  if (t.includes("thanks") || t.includes("lol")) aff++;
  if (t.includes("?")) trust++;
  if (msg.content.length > 30) fam++;

  user.affection += aff;
  user.trust += trust;
  user.familiarity += fam;

  user.affection = Math.max(-20, Math.min(100, user.affection));
  user.trust = Math.max(-20, Math.min(100, user.trust));
  user.familiarity = Math.max(0, Math.min(100, user.familiarity));

  user.relationship = computeRelationship(user);
  user.lastSeen = Date.now();

  user.emotionalMemory.push(msg.content);
  if (user.emotionalMemory.length > 20) user.emotionalMemory.shift();
}

// =========================
// SAFE GROQ CALL
// =========================
async function safeGroq(messages) {
  try {
    return await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 120,
      temperature: 1.1,
      messages
    });
  } catch (err) {
    console.error("Groq error:", err);
    return null;
  }
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

    const res = await safeGroq([
      {
        role: "system",
        content: "You are Aliya, a realistic Discord user. 1–2 sentences max."
      },
      {
        role: "user",
        content: buffer.map(m => `${m.user}: ${m.content}`).join("\n")
      }
    ]);

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
    console.error("Message error:", err);
  }
});

// =========================
// LOGIN (SAFE)
// =========================
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("✅ Bot logged in"))
  .catch(err => {
    console.error("Login failed:", err);
    process.exit(1);
  });