// Vercel serverless function — POST /api/ask
// Keeps GEMINI_API_KEY on the server only (set it in the Vercel dashboard,
// never in a committed file). Accepts the same request shape the frontend
// already sends (Anthropic-style {model, max_tokens, messages}) and returns
// an Anthropic-style {content:[{type:'text', text}]} response, so App.jsx
// needed no changes beyond the fetch URL.

const GEMINI_MODEL = 'gemini-3.6-flash';

function toGeminiContents(messages) {
  // messages: [{ role: 'user', content: [ {type:'text', text} | {type:'image', source:{media_type, data}} ] }]
  const msg = messages[0];
  const parts = (msg?.content || []).map((block) => {
    if (block.type === 'image') {
      return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
    }
    return { text: block.text || '' };
  });
  return [{ role: 'user', parts }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server is missing GEMINI_API_KEY — add it in Vercel → Settings → Environment Variables, then redeploy.' } });
    return;
  }

  try {
    const { max_tokens, messages } = req.body || {};
    const contents = toGeminiContents(messages || []);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: Math.max(max_tokens || 1000, 2048),
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const data = await geminiRes.json().catch(() => ({}));

    if (!geminiRes.ok) {
      const msg = (data && data.error && data.error.message) || `Gemini request failed — HTTP ${geminiRes.status}`;
      res.status(geminiRes.status).json({ error: { message: msg } });
      return;
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');

    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason;
      res.status(502).json({
        error: { message: blockReason ? `Gemini blocked this request (${blockReason}).` : 'Gemini returned an empty response — try again.' },
      });
      return;
    }

    res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (e) {
    res.status(500).json({ error: { message: e && e.message ? e.message : 'Proxy request failed.' } });
  }
}
