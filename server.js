require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const { createClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const { twiml: { VoiceResponse } } = require('twilio');

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL; // e.g., https://yourapp.herokuapp.com

// Clients
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Home
app.get('/', (req, res) => {
  res.send('✅ AI Receptionist is live!');
});

// Twilio XML response
app.post('/twiml', (req, res) => {
  const response = new VoiceResponse();

  const connect = response.connect();
  connect.stream({
    url: `${BASE_URL}/media`,
    track: 'inbound_track'
  });

  response.say('Hello, thank you for calling Vivid Smart Security. How may I help you today?');
  res.type('text/xml');
  res.send(response.toString());
});

// Twilio Media WebSocket
app.ws('/media', async (ws, req) => {
  console.log('🔊 WebSocket connected from Twilio');

  const deepgramLive = await deepgram.listen.live({
    model: 'nova',
    smart_format: true,
    punctuate: true
  });

  deepgramLive.on('transcriptReceived', async (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (transcript && transcript.length > 0) {
      console.log('📄 Transcript:', transcript);
      // OPTIONAL: You can forward this to OpenAI or use it however needed
    }
  });

  deepgramLive.on('error', (err) => {
    console.error('❌ Deepgram Error:', err);
  });

  deepgramLive.on('close', () => {
    console.log('🔌 Deepgram connection closed');
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === 'start') {
        console.log('🔁 Start event received');
      } else if (data.event === 'media') {
        const audio = Buffer.from(data.media.payload, 'base64');
        deepgramLive.send(audio);
      } else if (data.event === 'stop') {
        console.log('🛑 Call ended by Twilio');
        deepgramLive.finish();
      }
    } catch (err) {
      console.error('⚠️ Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio WebSocket closed');
    deepgramLive.finish();
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});




