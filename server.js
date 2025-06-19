const express = require('express');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

app.post('/twiml', (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="Polly.Joanna">Hello, this is Kate from Zyvai Tech. How may I help you today?</Say>
    </Response>
  `;
  res.set('Content-Type', 'text/xml');
  res.send(twiml);
});

app.ws('/media', async (ws) => {
  const dgSocket = await deepgram.transcription.live({
    model: 'nova',
    language: 'en-US',
    interim_results: false,
    punctuate: true,
  });

  dgSocket.on('transcriptReceived', async (transcript) => {
    const text = transcript.channel.alternatives[0]?.transcript;
    if (text) {
      console.log('🎙 Caller:', text);

      const ai = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful AI receptionist for an IT support and toner sales company.' },
            { role: 'user', content: text },
          ],
        },
        {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        }
      );

      const responseText = ai.data.choices[0].message.content;
      console.log('🤖 AI:', responseText);

      await axios.post(
        'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream',
        {
          text: responseText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      await axios.post(MAKE_WEBHOOK_URL, {
        question: text,
        response: responseText,
      });
    }
  });

  dgSocket.on('error', (err) => {
    console.error('❌ Deepgram error:', err);
  });

  dgSocket.on('close', () => {
    console.log('🔒 Deepgram connection closed');
  });

  ws.on('message', (msg) => {
    const parsed = JSON.parse(msg);

    if (parsed.event === 'media' && parsed.media?.payload) {
      const audio = Buffer.from(parsed.media.payload, 'base64');
      dgSocket.send(audio);
    }

    if (parsed.event === 'stop') {
      dgSocket.finish();
    }
  });

  ws.on('close', () => {
    dgSocket.finish();
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

