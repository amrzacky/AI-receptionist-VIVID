require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let latestReplyPath = null;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

app.post('/twiml', express.text({ type: '*/*' }), (req, res) => {
  const response = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say voice="Polly.Joanna">Hi, this is Kate from Vivid Smart. How may I help you today?</Say>
      ${latestReplyPath ? `<Play>${latestReplyPath}</Play>` : ''}
    </Response>
  `;
  res.type('text/xml');
  res.send(response);
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
            { role: 'system', content: 'You are a helpful IT support receptionist. Greet and ask smart follow-up questions.' },
            { role: 'user', content: transcript }
          ],
        });

        const reply = aiResp.choices[0].message.content;
        console.log('🤖 AI:', reply);

        const audioResp = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
          {
            text: reply,
            model_id: 'eleven_monolingual_v1',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          },
          {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
          }
        );

        const filename = `speech-${Date.now()}.mp3`;
        const filePath = path.join(__dirname, 'public', filename);
        fs.writeFileSync(filePath, audioResp.data);
        latestReplyPath = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com/${filename}`;
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

