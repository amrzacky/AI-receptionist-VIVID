// Catch and show crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Readable } = require('stream');
const { OpenAI } = require('openai');
const twilio = require('twilio');
require('dotenv').config();

// Setup Deepgram and OpenAI
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create server and app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.urlencoded({ extended: true }));

// WebSocket audio processing
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({ read() {} });

  const deepgramLive = deepgram.transcription.live({
    punctuate: true,
    interim_results: false,
  });

  deepgramLive.on('transcriptReceived', async data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Customer said:', text);

      // Send to OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Kate, a helpful AI receptionist for an IT support company named Vivid Smart. Answer naturally and professionally.' },
          { role: 'user', content: text }
        ]
      });

      const reply = completion.choices[0].message.content;
      console.log('🤖 AI replied:', reply);

      // 🚧 You can add ElevenLabs TTS and Twilio response here later
    }
  });

  deepgramLive.on('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(deepgramLive);

  ws.on('message', message => {
    audioStream.push(message);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket disconnected');
    deepgramLive.finish();
  });
});

// Test route
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio Voice Webhook
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });
  response.pause({ length: 60 }); // ⏸️ Keeps call alive for 60s

  res.type('text/xml');
  res.send(response.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
