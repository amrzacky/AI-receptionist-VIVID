require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const axios = require('axios');
const { Readable } = require('stream');
const { twiml: { VoiceResponse } } = require('twilio');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Initialize APIs
const deepgram = new Deepgram({ apiKey: process.env.DEEPGRAM_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🧠 WebSocket Handler
wss.on('connection', (ws) => {
  console.log('✅ WebSocket connected');
  
  const stream = new Readable({ read() {} });

  const dgStream = deepgram.listen.live({
    model: 'nova',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
  });

  stream.pipe(dgStream);

  dgStream.on('transcriptReceived', async (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (transcript && transcript.length > 0) {
      console.log('📝 Transcript:', transcript);

      // AI Response
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are Kate, a friendly receptionist for an IT company.' },
          { role: 'user', content: transcript }
        ],
      });

      const aiResponse = completion.choices[0].message.content;
      console.log('🤖 AI:', aiResp
