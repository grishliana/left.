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

// 🤖 Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🧠 Groq setup
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 💖 CRUSH USER
const CRUSH_ID = "123456789012345678";

// 🧠 MEMORY
let memory = [];

// 👥 ACTIVE USERS
let activeUsers = new Map();

// 🧠 RELATIONSHIP SYSTEM
let relationships = {};

function getRelationship(userId) {
  if (!relationships[userId]) {
    relationships[userId] = {
      affection: 0,
      familiarity: 0,
      lastInteraction: 0,
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

// 🚨 BOT LIMIT SYSTEM (5/min strict)
let botMessageTimestamps = [];
const MAX_MESSAGES_PER_MIN = 5;
const WINDOW_MS = 60000;

// 🧠 PERSONALITY
let attention = 0.55;
let fatigue = 0;
let introversion = 0.65;

// 🎭 MOOD SYSTEM
const moods = ["happy", "shy", "playful", "tired", "jealous"];
let currentMood = "shy";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
}, 120000);

// 🧠 ATTENTION DRIFT
setInterval(() => {
  attention += (Math.random() - 0.5) * 0.15;
  attention += 0.03;
  attention = Math.max(0, Math.min(1, attention));
}, 15000);

// 🧠 MEMORY DECAY + TIER UPDATE
setInterval(() => {
  for (const id in relationships) {
    relationships[id].familiarity *= 0.999;
    relationships[id].affection *= 0.999;
    updateTier(relationships[id]);
  }
}, 60000);

// 👥 RANDOM ACTIVE USER
function getRandomActiveUser() {
  const now = Date.now();

  const recent = [...activeUsers.entries()]
    .filter(([_, time]) => now - time < 300000)
    .map(([id]) => id);

  if (recent.length === 0) return null;

  return recent[Math.floor(Math.random() * recent.length)];
}

// 🧹 CLEAN BOT HISTORY
function cleanBotHistory() {
  const now = Date.now();

  botMessageTimestamps = botMessageTimestamps.filter(
    (t) => now - t < WINDOW_MS
  );
}

// 🗣️ IDLE CONVERSATION STARTER
let lastBotSpeakTime = Date.now();

setInterval(async () => {
  const now = Date.now();
  if (now - lastBotSpeakTime < 90000 + Math.random() * 90000) return;

  if (activeUsers.size === 0) return;

  const users = [...activeUsers.keys()];
  const targetId = users[Math.floor(Math.random() * users.length)];

  const rel = getRelationship(targetId);

  if (rel.familiarity < 0.2 && Math.random() < 0.7) return;

  const prompts = [
    "what are you all doing",
    "this server is kinda quiet",
    "i'm bored lol",
    "anyone here",
    "random question... what's your favorite song?"
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  try {
    const channel = client.channels.cache.find(c => c.isTextBased?.());
    if (!channel) return;

    await channel.send(prompt);
    lastBotSpeakTime = now;
  } catch (e) {
    console.error("idle convo error:", e);
  }
}, 45000);

// ✅ READY
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// 💬 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const now = Date.now();
    const userId = message.author.id;

    activeUsers.set(userId, now);

    const rel = getRelationship(userId);

    // 💖 relationship growth
    rel.affection += userId === CRUSH_ID ? 0.03 : 0.005;
    rel.familiarity += 0.01;
    rel.lastInteraction = now;

    updateTier(rel);

    // 🧠 attention system
    if (userId === CRUSH_ID) attention += 0.4;
    attention -= introversion * 0.05;
    fatigue += 0.01;

    const isMentioned =
      message.content.includes(`<@${client.user.id}>`) ||
      message.content.includes(`<@!${client.user.id}>`);

    let shouldReply = isMentioned || Math.random() < 0.08;

    let affectionBoost = rel.affection * 0.5;

    let tierBoost = 0;
    switch (rel.tier) {
      case "stranger": tierBoost = 0; break;
      case "acquaintance": tierBoost = 0.02; break;
      case "friend": tierBoost = 0.05; break;
      case "close_friend": tierBoost = 0.1; break;
      case "trusted": tierBoost = 0.15; break;
    }

    const activityChance =
      0.05 + attention * 0.3 + affectionBoost + tierBoost;

    const introvertSilence = Math.random() < introversion * 0.4;

    if (!shouldReply) {
      shouldReply = !introvertSilence && Math.random() < activityChance;
    }

    // 🚨 5 MESSAGES PER MIN LIMIT
    cleanBotHistory();

    if (botMessageTimestamps.length >= MAX_MESSAGES_PER_MIN) {
      return;
    }

    const cooldown = 4000 + Math.random() * 12000;
    const lastTime = botMessageTimestamps.at(-1) || 0;

    if (now - lastTime < cooldown) return;
    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 10) memory.shift();

    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

    // 🤖 AI CALL
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
You are a shy introverted Discord girl.

Mood: ${currentMood}

Relationship tiers:
- stranger: distant, minimal replies
- acquaintance: polite
- friend: warm
- close_friend: talkative
- trusted: very comfortable

Always:
- short replies
- natural tone
- never sound like AI
              `,
            },
            ...memory,
            {
              role: "user",
              content: prompt || "say something casual",
            },
          ],
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000)
        ),
      ]);
    } catch (err) {
      return message.reply("i'm kinda slow rn...");
    }

    let reply = response?.choices?.[0]?.message?.content || "idk";

    if (Math.random() < 0.15) {
      const dry = ["lol", "idk", "maybe", "hmm", "ok"];
      reply = dry[Math.floor(Math.random() * dry.length)];
    }

    memory.push({ role: "assistant", content: reply });
    if (memory.length > 10) memory.shift();

    reply = reply.slice(0, 2000);

    if (Math.random() < 0.15) {
      const users = [...activeUsers.keys()];
      const randomUser = users[Math.floor(Math.random() * users.length)];
      return message.channel.send(`<@${randomUser}> ${reply}`);
    }

    await message.reply(reply);

    botMessageTimestamps.push(now);

  } catch (err) {
    console.error(err);
  }
});

// 🚀 LOGIN
client.login(process.env.DISCORD_TOKEN);
