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

// 🚨 BOT LIMIT SAFETY
let botMessageTimestamps = [];
const MAX_MESSAGES_PER_MIN = 3;

// 🧠 PERSONALITY SYSTEM
let attention = 0.5;
let fatigue = 0;
let introversion = 0.85;

let affection = {};

function getAffection(userId) {
  if (!affection[userId]) affection[userId] = 0;
  return affection[userId];
}

// 🎭 MOOD SYSTEM
const moods = ["happy", "shy", "playful", "tired", "jealous"];
let currentMood = "shy";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
}, 120000);

// 🧠 ATTENTION DRIFT
setInterval(() => {
  attention += (Math.random() - 0.5) * 0.15;
  attention += 0.03; // recovery when idle
  attention = Math.max(0, Math.min(1, attention));
}, 15000);

// 👥 RANDOM USER HELPER
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
    (t) => now - t < 60000
  );
}

// ✅ READY
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ⚠️ LOGGING
client.on("error", console.error);
client.on("warn", console.warn);

// 💬 MESSAGE HANDLER
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const now = Date.now();
    const userId = message.author.id;

    activeUsers.set(userId, now);

    // 💖 AFFECTION SYSTEM
    if (userId === CRUSH_ID) {
      affection[userId] = (affection[userId] || 0) + 0.03;
      attention += 0.4;
    } else {
      affection[userId] = (affection[userId] || 0) + 0.005;
    }

    // 💤 introvert social drain
    attention -= introversion * 0.05;
    fatigue += 0.01;

    // 🧠 base detection
    const isMentioned =
      message.content.includes(`<@${client.user.id}>`) ||
      message.content.includes(`<@!${client.user.id}>`);

    let shouldReply = isMentioned || Math.random() < 0.03;

    // 💖 affection boost
    let affectionBoost = getAffection(userId) * 0.3;

    // 🎯 attention-based activity
    const activityChance =
      0.02 + attention * 0.2 + affectionBoost;

    // 💤 introvert silence chance
    const introvertSilence = Math.random() < introversion * 0.6;

    if (!shouldReply) {
      shouldReply = !introvertSilence && Math.random() < activityChance;
    }

    // 🚨 HARD LIMIT (prevents spam)
    cleanBotHistory();

    if (botMessageTimestamps.length >= MAX_MESSAGES_PER_MIN) {
      return;
    }

    // ⏱️ cooldown (human-like)
    const cooldown = 5000 + Math.random() * 15000;

    const lastTime = botMessageTimestamps.at(-1) || 0;
    if (now - lastTime < cooldown) {
      return;
    }

    if (!shouldReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, "").trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 10) memory.shift();

    await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));

    // 🤖 GROQ CALL
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
You are a shy introverted Volga Tatar girl on Discord.

Current mood: ${currentMood}

Personality:
- very introverted
- short replies (1–2 sentences max)
- sometimes awkward or quiet
- prefers listening over talking
- reacts more to a specific user she likes

Behavior:
- sometimes ignores messages
- changes topic randomly
- can be shy, soft, or playful
- reacts more to crush user
- never sounds like AI
- never writes long messages
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
          setTimeout(() => reject(new Error("Groq timeout")), 8000)
        ),
      ]);
    } catch (err) {
      console.error("Groq error:", err);
      return message.reply("i'm kinda slow rn...");
    }

    let reply =
      response?.choices?.[0]?.message?.content || "idk what to say lol";

    // 💬 occasional dry human response
    if (Math.random() < 0.15) {
      const dry = ["lol", "idk", "maybe", "hmm", "ok", "what", "eh"];
      reply = dry[Math.floor(Math.random() * dry.length)];
    }

    memory.push({ role: "assistant", content: reply });
    if (memory.length > 10) memory.shift();

    reply = reply.slice(0, 2000);

    const randomUserId = getRandomActiveUser();

    if (randomUserId && Math.random() < 0.15) {
      await message.channel.send(`<@${randomUserId}> ${reply}`);
    } else {
      await message.reply(reply);
    }

    // 🚨 TRACK BOT MESSAGE
    botMessageTimestamps.push(now);

  } catch (error) {
    console.error("❌ Message handler error:", error);
  }
});

// 🚀 LOGIN
client.login(process.env.DISCORD_TOKEN);