// =========================
// 🚨 CRASH PROTECTION
// =========================
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

// =========================
// 🌐 EXPRESS (RENDER FIX)
// =========================
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is alive ✅");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// =========================
// ENV
// =========================
require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// =========================
// ENV CHECK
// =========================
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN or GROQ_API_KEY");
  process.exit(1);
}

// =========================
// CONFIG
// =========================
const ALLOWED_CHANNEL_ID = "YOUR_CHANNEL_ID_HERE";
const CRUSH_ID = "123456789012345678";

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =========================
// GROQ CLIENT
// =========================
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// =========================
// MEMORY / STATE
// =========================
let memory = [];
let lastReply = "";
let recentReplies = [];
let activeUsers = new Map();
let botMessageTimestamps = [];

const MAX_MESSAGES_PER_MIN = 5;
const WINDOW = 60000;

// =========================
// RELATIONSHIPS SYSTEM
// =========================
let relationships = {};

function getRelationship(userId) {
  if (!relationships[userId]) {
    relationships[userId] = {
      affection: 0,
      familiarity: 0,
      tier: "stranger",
    };
  }
  return relationships[userId];
}

function updateTier(rel) {
  const score = rel.affection + rel.familiarity;

  if (score < 0.5) rel.tier = "stranger";
  else if (score < 2) rel.tier = "acquaintance";
  else if (score < 5) rel.tier = "friend";
  else if (score < 10) rel.tier = "close_friend";
  else rel.tier = "trusted";
}

// =========================
// UTIL FUNCTIONS
// =========================
function cleanBotHistory() {
  const now = Date.now();
  botMessageTimestamps = botMessageTimestamps.filter(
    (t) => now - t < WINDOW
  );
}

function makeDiscordLike(text) {
  if (!text) return "idk";

  let t = text.toLowerCase();

  const swaps = [
    ["i am", "im"],
    ["you are", "ur"],
    ["are you", "r u"],
    ["what is", "what's"],
    ["do not", "dont"],
    ["cannot", "cant"],
    ["because", "bc"],
  ];

  for (const [a, b] of swaps) {
    t = t.replaceAll(a, b);
  }

  const endings = [" lol", " idk", " tbh"];
  if (Math.random() < 0.3) {
    t += endings[Math.floor(Math.random() * endings.length)];
  }

  return t.replace(/\.$/, "").trim();
}

function isRepeating(reply) {
  const cleaned = reply.toLowerCase().trim();

  if (cleaned === lastReply.toLowerCase().trim()) return true;

  const spam = ["idk", "lol", "maybe", "hmm", "ok"];
  if (spam.includes(cleaned)) {
    if (recentReplies.slice(-3).every((r) => r === cleaned)) {
      return true;
    }
  }

  return false;
}

// =========================
// READY EVENT
// =========================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =========================
// IDLE CHAT
// =========================
let lastBotSpeakTime = Date.now();

setInterval(async () => {
  const now = Date.now();
  if (now - lastBotSpeakTime < 120000) return;
  if (activeUsers.size === 0) return;

  const channel = await client.channels
    .fetch(ALLOWED_CHANNEL_ID)
    .catch(() => null);

  if (!channel) return;

  const prompts = [
    "what are u doing",
    "this chat is quiet",
    "anyone here?",
    "what are you all up to",
    "random question: what are u working on?",
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  try {
    await channel.send(prompt);
    lastBotSpeakTime = now;
  } catch (e) {
    console.error(e);
  }
}, 60000);

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const now = Date.now();
    const userId = message.author.id;

    activeUsers.set(userId, now);

    const rel = getRelationship(userId);

    rel.affection += userId === CRUSH_ID ? 0.03 : 0.005;
    rel.familiarity += 0.01;

    updateTier(rel);

    const shouldReply =
      message.content.includes(`<@${client.user.id}>`) ||
      Math.random() < 0.08;

    cleanBotHistory();
    if (botMessageTimestamps.length >= MAX_MESSAGES_PER_MIN) return;

    const lastTime = botMessageTimestamps.at(-1) || 0;
    if (now - lastTime < 5000 + Math.random() * 8000) return;
    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 25) memory.shift();

    let response;

    try {
      response = await Promise.race([
        groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: 60,
          temperature: 1,
          messages: [
            {
              role: "system",
              content: `
You are a Discord user.

RULES:
- 1 sentence only
- no emotions, no feelings, no expressions
- no storytelling
- casual Discord slang allowed
- sound natural and short
              `,
            },
            ...memory,
            {
              role: "user",
              content: prompt || "say something casual",
            },
          ],
        }),
        new Promise((_, r) =>
          setTimeout(() => r(new Error("timeout")), 8000)
        ),
      ]);
    } catch {
      return message.reply("im kinda slow rn...");
    }

    let reply = response?.choices?.[0]?.message?.content || "hm...";

    reply = reply.toLowerCase().split(/[.!?]/)[0];
    reply = makeDiscordLike(reply);

    if (isRepeating(reply)) reply = "hm...";

    lastReply = reply;
    recentReplies.push(reply);
    if (recentReplies.length > 10) recentReplies.shift();

    await message.reply(reply);

    botMessageTimestamps.push(now);
  } catch (err) {
    console.error(err);
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);
