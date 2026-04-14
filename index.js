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
// EXPRESS (RENDER FIX)
// =========================
const app = express();

app.get("/", (_, res) => res.send("Bot running"));

app.get("/status", (_, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    users: Object.keys(users).length,
    queues: [...queues.values()].reduce((a, q) => a + q.length, 0)
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
// RATE LIMIT (5 / MIN)
// =========================
function canSpeak() {
  const now = Date.now();
  while (botLog.length && now - botLog[0] > 60000) botLog.shift();
  return botLog.length < 5;
}

// =========================
// USER SYSTEM (WITH TRAITS)
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
      memories: [],
      lastSeen: Date.now()
    };
  }
  return users[id];
}

// =========================
// RELATIONSHIP TIERS
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
// MOOD ENGINE
// =========================
function updateMood(u, msg) {
  const t = msg.content.toLowerCase();

  if (t.includes("lol") || t.includes("haha")) u.mood = "playful";
  else if (t.includes("sad") || t.includes("tired")) u.mood = "soft";
  else if (t.includes("?")) u.mood = "curious";
  else if (t.includes("bro") || t.includes("wtf")) u.mood = "teasing";
  else if (msg.content.length > 60) u.mood = "engaged";
  else u.mood = "neutral";
}

// =========================
// EMOTION ENGINE
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

  u.memories.push({
    text: msg.content,
    time: Date.now()
  });

  if (u.memories.length > 25) u.memories.shift();

  u.lastSeen = Date.now();
}

// =========================
// MEMORY RETRIEVAL
// =========================
function getRelevantMemories(user) {
  return user.memories
    .slice(-5)
    .map(m => m.text)
    .join("\n");
}

// =========================
// BUFFER
// =========================
function getBuffer(id) {
  if (!buffers.has(id)) buffers.set(id, []);
  return buffers.get(id);
}

// =========================
// QUEUE
// =========================
function getQueue(id) {
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

// =========================
// PERSONA (UPGRADED)
// =========================
function getPersona(user) {
  const t = user.traits;

  return `
You are Aliya, a real girl chatting casually on Discord.

RELATIONSHIP: ${user.relationship}
CURRENT MOOD: ${user.mood}

PERSONALITY TRAITS:
- humor: ${t.humor}
- energy: ${t.energy}
- sass: ${t.sass}
- curiosity: ${t.curiosity}
- warmth: ${t.warmth}

BEHAVIOR RULES:

- NEVER sound robotic or dry
- vary message length naturally
- sometimes tease if sass is high
- be caring if warmth is high
- ask questions if curiosity is high

TEXTING STYLE:

- casual lowercase
- use "lol", "idk", "ngl", "wait"
- occasional emojis :) :/ ^^
- natural pauses "..." 
- sometimes short replies
- sometimes unfinished thoughts

MEMORY:
${getRelevantMemories(user)}

IMPORTANT:
- no usernames
- no mentions
- no AI talk
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

    if (!canSpeak()) continue;

    botLog.push(Date.now());

    const buffer = getBuffer(channelId);

    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 1.2,
      max_tokens: 140,
      messages: [
        { role: "system", content: getPersona(user) },
        {
          role: "user",
          content: buffer.map(m => `user: ${m.content}`).join("\n")
        }
      ]
    });

    let reply = clean(res?.choices?.[0]?.message?.content || "hm");

    if (Math.random() < 0.25) {
      reply += [" lol", " ngl", " ...", " idk"][Math.floor(Math.random() * 4)];
    }

    await message.reply(reply);

    // double text realism
    if (Math.random() < 0.2) {
      setTimeout(() => {
        message.channel.send(
          ["wait", "actually", "ok but fr", "nvm lol"][
            Math.floor(Math.random() * 4)
          ]
        );
      }, 1500);
    }
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

  buffer.push({
    content: message.content
  });

  if (buffer.length > 12) buffer.shift();

  const shouldReply =
    message.mentions.has(client.user) || Math.random() < 0.07;

  if (!shouldReply) return;
  if (!canSpeak()) return;

  const queue = getQueue(message.channel.id);
  queue.push({ message, user });

  processQueue(message.channel.id);
});

// =========================
// IDLE CHAT STARTER
// =========================
setInterval(async () => {
  if (!canSpeak()) return;
  if (Math.random() > 0.2) return;

  const channels = [...buffers.keys()];
  if (!channels.length) return;

  const id = channels[Math.floor(Math.random() * channels.length)];

  const channel = await client.channels.fetch(id).catch(() => null);
  if (!channel) return;

  botLog.push(Date.now());

  const prompts = [
    "what's everyone doing",
    "why is it so quiet here",
    "anyone alive rn",
    "lowkey bored"
  ];

  await channel.send(prompts[Math.floor(Math.random() * prompts.length)]);
}, 45000);

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);