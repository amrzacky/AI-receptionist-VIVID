require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    </Response>
  `;
  res.type('text/xml');
  res.send(response);
});

app.ws('/media', (ws) => {
  console.log('🔊 WebSocket connected from Twilio');

  const dgSocket = new WebSocket(
    `wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1`,
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`
      }
    }
  );

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

        await axios.post(process.env.MAKE_WEBHOOK_URL, {
          message: reply,
          original: transcript
        });
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




