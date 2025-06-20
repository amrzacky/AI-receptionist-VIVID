require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Deepgram } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const twilio = require('twilio');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;

// ✅ Initialize APIs
const deepgram = new Deepgram({ apiKey: process.env.DEEPGRAM_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ✅ Base route
app.get('/', (req, res) => {
  res.send('✅ AI Receptionist is live and running.');
});

// ✅ Twilio /twiml route
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('Hello! This is Kate from Zyvai Tech. How may I help you today?', { voice: 'Polly.Joanna' });
  twiml.start().stream({ url: `wss://${req.headers.host}/media` });

  res.type('text/xml');
  res.send(twiml.toString());
});

// ✅ WebSocket endpoint for Twilio media stream
app.ws('/media', async (ws, req) => {
  console.log('🎧 New media stream connected');

  const dgConnection = deepgram.listen.live({
    model: 'nova',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
  });

  dgConnection.on('open', () => {
    console.log('🧠 Deepgram connection open');
  });

  dgConnection.on('transcriptReceived', async (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript || transcript.trim() === '') return;

    console.log('📝 Transcript:', transcript);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are Kate, a professional AI receptionist for Zyvai Tech. Be polite, helpful, and ask relevant IT support questions based on the customer’s issue.',
          },
          { role: 'user', content: transcript },
        ],
      });

      const aiResponse = completion.choices[0].message.content;
      console.log('🤖 AI:', aiResponse);

      const voiceStream = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream`,
        {
          text: aiResponse,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.85,
          },
        },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      console.log('🔊 Audio response from ElevenLabs ready.');

      // ❗ At this point, you'd send audio to Twilio (out of scope for now)

    } catch (err) {
      console.error('❌ Error during AI response:', err.message);
    }
  });

  dgConnection.on('error', (err) => {
    console.error('❌ Deepgram error:', err);
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.event === 'media') {
      const audio = Buffer.from(data.media.payload, 'base64');
      dgConnection.send(audio);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio WebSocket closed');
    dgConnection.finish();
  });
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});

