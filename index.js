// 🚨 crash protection (PUT AT TOP)
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

// ⚠️ REMOVE express (not used, causes install issues)
// const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 🔐 SAFETY CHECK (prevents Render crash)
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN in environment variables");
  process.exit(1);
}

// 💘 SET YOUR CRUSH USER ID HERE
const CRUSH_ID = "PUT_USER_ID_HERE";

// 🧠 memory
let memory = [];

// 🎭 mood system
const moods = ["happy", "shy", "playful", "tired", "jealous"];
let currentMood = "shy";

setInterval(() => {
  currentMood = moods[Math.floor(Math.random() * moods.length)];
  console.log("Mood changed to:", currentMood);
}, 120000);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ⚠️ extra stability logging
client.on("error", console.error);
client.on("warn", console.warn);

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  let isReplyToBot = false;

  if (message.reference) {
    try {
      const repliedMsg = await message.fetchReference();
      if (repliedMsg.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (err) {
      console.error("Reply check error:", err);
    }
  }

  const isMentioned =
    message.content.includes(`<@${client.user.id}>`) ||
    message.content.includes(`<@!${client.user.id}>`);

  let randomChance = Math.random() < 0.10;

  if (message.author.id === CRUSH_ID) {
    randomChance = Math.random() < 0.40;
  }

  if (isMentioned || isReplyToBot || randomChance) {

    const prompt = message.content
      .replace(/<@!?\d+>/g, "")
      .trim();

    memory.push({ role: "user", content: prompt });
    if (memory.length > 6) memory.shift();

    try {
      await new Promise(res =>
        setTimeout(res, 1500 + Math.random() * 2500)
      );

      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        max_tokens: 60,
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `
You are a Volga Tatar girl chatting on Discord.

Personality:
- short replies (1 sentence, max 2)
- casual, lowercase sometimes
- playful, slightly shy
- loves volleyball
- has a crush on one boy (acts different with him)

Mood behavior:
- happy: energetic, light
- shy: soft, a bit awkward
- playful: teasing
- jealous: slightly annoyed if others talk

Never sound like AI. Never write long messages.
            `
          },
          ...memory,
          { role: "user", content: prompt || "say something casual" }
        ],
      });

      let reply = response.choices[0].message.content;

      memory.push({ role: "assistant", content: reply });
      if (memory.length > 6) memory.shift();

      if (reply.length > 2000) {
        reply = reply.slice(0, 2000);
      }

      message.reply(reply);

    } catch (error) {
      console.error("Message handler error:", error);
    }
  }
});

// 🔐 final safety login check
client.login(process.env.DISCORD_TOKEN);