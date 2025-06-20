require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Deepgram } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const axios = require('axios');
const twilio = require('twilio');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Initialize APIs
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('✅ AI Receptionist is running.');
});

// Twilio sends call here to start streaming audio
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Hello! This is Kate from Zyvai Tech. How may I help you today?', { voice: 'Polly.Joanna' });

  // Stream call audio to our WebSocket
  twiml.start().stream({
    url: `wss://${req.headers.host}/media`
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle incoming audio WebSocket stream from Twilio
app.ws('/media', (ws, req) => {
  console.log('🔊 Incoming Twilio Media Stream');

  const dgSocket = deepgram.transcription.live({
    punctuate: true,
    language: 'en-US'
  });

  dgSocket.on('open', () => {
    console.log('🔗 Connected to Deepgram');

    ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.event === 'media') {
        const audio = Buffer.from(msg.media.payload, 'base64');
        dgSocket.send(audio);
      }
    });

    ws.on('close', () => {
      console.log('❌ WebSocket closed');
      dgSocket.finish();
    });
  });

  dgSocket.on('transcriptReceived', async (transcription) => {
    const transcript = transcription.channel?.alternatives[0]?.transcript;
    if (!transcript || transcript.length === 0) return;

    console.log('📝 Transcript:', transcript);

    try {
      // Send to OpenAI
      const aiResp = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are Kate, an AI receptionist for Zyvai Tech. Answer helpfully and ask for business name after issue.' },
          { role: 'user', content: transcript }
        ]
      });

      const replyText = aiResp.choices[0].message.content.trim();
      console.log('🤖 AI:', replyText);

      // Convert text to voice using ElevenLabs
      const audioResp = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID/stream`,
        {
          text: replyText,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      // TODO: Play audioResp.data back to Twilio (not yet supported via WebSocket directly)

    } catch (err) {
      console.error('❌ Error handling transcript:', err.message);
    }
  });

  dgSocket.on('error', (err) => {
    console.error('❌ Deepgram error:', err);
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

