require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { ElevenLabsClient } = require('elevenlabs-node');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const eleven = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

let latestReplyPath = ''; // Store path to latest audio file

app.use(express.static('public')); // To serve audio files

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

app.post('/twiml', express.text({ type: '*/*' }), async (req, res) => {
  let twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say voice="Polly.Joanna">Hi, this is Kate from Vivid Smart. How may I help you today?</Say>
    </Response>
  `;

  // If there's a latestReplyPath, play it
  if (latestReplyPath) {
    twiml = `
      <Response>
        <Play>${latestReplyPath}</Play>
      </Response>
    `;
  }

  res.type('text/xml');
  res.send(twiml);
});

app.ws('/media', (ws) => {
  console.log('🔊 WebSocket connected from Twilio');

  const dgSocket = new WebSocket(`wss://api.deepgram.com/v1/listen`, {
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`
    }
  });

  dgSocket.on('open', () => {
    console.log('🔗 Connected to Deepgram');

    dgSocket.on('message', async (message) => {
      const data = JSON.parse(message);
      const transcript = data.channel?.alternatives[0]?.transcript;

      if (transcript) {
        console.log('📝 Transcription:', transcript);

        const aiResp = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful IT support receptionist. Respond with short clear sentences suitable for phone calls.' },
            { role: 'user', content: transcript }
          ]
        });

        const reply = aiResp.choices[0].message.content;
        console.log('🤖 AI:', reply);

        // Generate speech with ElevenLabs
        const audio = await eleven.textToSpeech.convert({
          voiceId: process.env.ELEVENLABS_VOICE_ID, // Add this to .env
          text: reply,
          modelId: 'eleven_monolingual_v1',
          outputFormat: 'mp3_44100_128'
        });

        const filename = `speech-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, 'public', filename);
        latestReplyPath = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com/${filename}`;

        fs.writeFileSync(filePath, Buffer.from(audio));

        console.log('🔊 Reply audio saved and ready to play.');
      }
    });
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.event === 'media') {
      const audio = Buffer.from(data.media.payload, 'base64');
      if (dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(audio);
      }
    } else if (data.event === 'stop') {
      console.log('🛑 Call ended by Twilio');
      dgSocket.close();
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio WebSocket closed');
    if (dgSocket.readyState === WebSocket.OPEN) {
      dgSocket.close();
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

