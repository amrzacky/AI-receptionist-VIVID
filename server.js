require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Deepgram } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const axios = require('axios');
const twilio = require('twilio');
const WebSocket = require('ws');
const expressWs = require('express-ws');

const app = express();
expressWs(app); // Enable WebSocket support on Express

const port = process.env.PORT || 8080;

// Initialize APIs
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('✅ AI Receptionist is up and running.');
});

// Handle Twilio call with greeting and stream setup
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Hello! This is Kate from Zyvai Tech. How may I help you today?', { voice: 'Polly.Joanna' });

  twiml.start().stream({
    url: `wss://${req.headers.host}/media`
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// WebSocket endpoint to receive media stream from Twilio
app.ws('/media', (ws) => {
  console.log('🎧 Media stream connected');

  const dgSocket = deepgram.transcription.live({
    model: 'nova',
    language: 'en-US',
    smart_format: true,
    interim_results: false
  });

  dgSocket.on('open', () => {
    console.log('🔗 Connected to Deepgram');

    ws.on('message', (msg) => {
      const data = JSON.parse(msg);
      if (data.event === 'media') {
        const audioBuffer = Buffer.from(data.media.payload, 'base64');
        dgSocket.send(audioBuffer);
      }
    });

    ws.on('close', () => {
      console.log('❌ WebSocket closed');
      dgSocket.finish();
    });
  });

  dgSocket.on('transcriptReceived', async (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (!transcript || transcript.trim() === '') return;

    console.log('📝 Transcript:', transcript);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Kate, an AI receptionist for Zyvai Tech. Ask smart questions based on what the caller says. Be polite and helpful.'
          },
          { role: 'user', content: transcript }
        ]
      });

      const aiResponse = completion.choices[0].message.content;
      console.log('🤖 AI:', aiResponse);

      const elevenResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream`,
        {
          text: aiResponse,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.85
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

      console.log('🔊 Voice generated (ElevenLabs).');
      // You would stream this audio back to Twilio here if supported

    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  });

  dgSocket.on('error', (err) => {
    console.error('❌ Deepgram error:', err);
  });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
