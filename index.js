// 🚨 crash protection
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const OpenAI = require("openai");

// 🔐 ENV CHECK
if (!process.env.DISCORD_TOKEN || !process.env.GROQ_API_KEY) {
  console.error("❌ Missing DISCORD_TOKEN or GROQ_API_KEY");
  process.exit(1);
}

// 🔒 ONLY ALLOWED CHANNEL
const ALLOWED_CHANNEL_ID = "YOUR_CHANNEL_ID_HERE";

// 🤖 CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🧠 GROQ
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 💖 CRUSH
const CRUSH_ID = "123456789012345678";

// 🧠 MEMORY
let memory = [];

// 🔁 ANTI-REPEAT
let lastReply = "";
let recentReplies = [];

// 👥 ACTIVE USERS
let activeUsers = new Map();

// 🚨 RATE LIMIT
let botMessageTimestamps = [];
const MAX_MESSAGES_PER_MIN = 5;
const WINDOW = 60000;

// 🧠 RELATIONSHIP SYSTEM
let relationships = {};

function getRelationship(userId) {
  if (!relationships[userId]) {
    relationships[userId] = {
      affection: 0,
      familiarity: 0,
      tier: "stranger"
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

// 🎭 MOOD
const moods = ["happy", "shy", "playful", "tired", "jealous"];
let currentMood = "shy";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
}, 120000);

// 🧠 CLEAN RATE LIMIT
function cleanBotHistory() {
  const now = Date.now();
  botMessageTimestamps = botMessageTimestamps.filter(
    (t) => now - t < WINDOW
  );
}

// 🧠 DISCORD STYLE TRANSFORM
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

  const endings = [" lol", " idk", " tbh", " 😭", " haha", "..."];
  if (Math.random() < 0.4) {
    t += endings[Math.floor(Math.random() * endings.length)];
  }

  return t.replace(/\.$/, "").trim();
}

// 🧠 ANTI-REPEAT CHECK
function isRepeating(reply) {
  const cleaned = reply.toLowerCase().trim();

  if (cleaned === lastReply.toLowerCase().trim()) return true;

  const spam = ["idk", "lol", "maybe", "hmm", "ok"];
  if (spam.includes(cleaned)) {
    if (recentReplies.slice(-3).every(r => r === cleaned)) {
      return true;
    }
  }

  return false;
}

// 👥 ACTIVE USER PICKER
function getRandomActiveUser() {
  const now = Date.now();

  const recent = [...activeUsers.entries()]
    .filter(([_, t]) => now - t < 300000)
    .map(([id]) => id);

  return recent.length
    ? recent[Math.floor(Math.random() * recent.length)]
    : null;
}

// 🗣️ IDLE CHAT (SAFE CHANNEL)
let lastBotSpeakTime = Date.now();

setInterval(async () => {
  const now = Date.now();
  if (now - lastBotSpeakTime < 120000) return;
  if (activeUsers.size === 0) return;

  const channel = await client.channels.fetch(ALLOWED_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const prompts = [
    "what are u all doing",
    "this server is kinda quiet ngl",
    "im bored lol",
    "anyone here?",
    "random q… what are u listening to?"
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  try {
    await channel.send(prompt);
    lastBotSpeakTime = now;
  } catch (e) {
    console.error(e);
  }
}, 60000);

// ✅ READY
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// 💬 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const now = Date.now();
    const userId = message.author.id;

    activeUsers.set(userId, now);

    const rel = getRelationship(userId);

    // 💖 relationship growth
    rel.affection += userId === CRUSH_ID ? 0.03 : 0.005;
    rel.familiarity += 0.01;

    updateTier(rel);

    const isMentioned =
      message.content.includes(`<@${client.user.id}>`) ||
      message.content.includes(`<@!${client.user.id}>`);

    let shouldReply = isMentioned || Math.random() < 0.08;

    const tierBoost =
      rel.tier === "trusted" ? 0.15 :
      rel.tier === "close_friend" ? 0.1 :
      rel.tier === "friend" ? 0.05 :
      rel.tier === "acquaintance" ? 0.02 : 0;

    const activityChance = 0.05 + tierBoost;

    if (!shouldReply) {
      shouldReply = Math.random() < activityChance;
    }

    // 🚨 LIMIT CHECK
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
You are a shy Discord girl.

RULES:
- ONLY 1 sentence
- sound like real Discord user
- lowercase typing
- slang: im, idk, tbh, bc, lol
- sometimes dry or emotional
- NEVER sound like AI
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

    // 🔥 FINAL FIX PIPELINE
    reply = reply.toLowerCase().split(/[.!?]/)[0]; // FORCE 1 SENTENCE
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

// 🚀 LOGIN
client.login(process.env.DISCORD_TOKEN);
