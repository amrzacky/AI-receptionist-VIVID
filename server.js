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
const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
const twilio = require('twilio');
require('dotenv').config();

// Setup services
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

// Setup Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Handle WebSocket audio from Twilio
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({ read() {} });

  const deepgramLive = deepgram.transcription.live({
    punctuate: true,
    interim_results: false
  });

  deepgramLive.on('transcriptReceived', async data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Heard:', text);

      try {
        // 🧠 Ask OpenAI
        const aiResponse = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are Kate, a professional, polite AI receptionist for an IT support company that also sells toner. Greet customers and help collect their business name and IT issue naturally. If they mention an issue (printer, internet, computer), ask for business name and help create a case." },
            { role: "user", content: text }
          ]
        });

        const reply = aiResponse.data.choices[0].message.content;
        console.log('💬 AI says:', reply);

        // 🎙️ Send to ElevenLabs
        const audio = await axios({
          method: "POST",
          url: "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream",
          data: {
            text: reply,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.3, similarity_boost: 0.75 }
          },
          responseType: "arraybuffer",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
          }
        });

        ws.send(audio.data);

        // 🧾 Log to Make.com
        await axios.post(process.env.MAKE_WEBHOOK_URL, {
          message: text,
          ai_response: reply
        });

      } catch (err) {
        console.error('❌ AI processing error:', err.message);
      }
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

// Twilio voice stream
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();
  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({ url: `wss://${req.headers.host}/` });

  res.type('text/xml');
  res.send(response.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

