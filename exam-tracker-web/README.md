# Exam Prep Tracker (self-hosted, Gemini-powered)

Same tracker as before — Today / Exams / Mocks / Drills / Current Affairs / English /
Doubts / Resources / Materials — but running as its own website instead of inside
Claude, with its own storage (this browser, via localStorage) and its own AI backend
(Google Gemini's free tier, called from a serverless function so the key never
reaches the browser).

## 1. Get a free Gemini API key
Go to https://aistudio.google.com/apikey → Create API key. No credit card required.

## 2. Run it locally (optional, but good for a first check)
```bash
npm install
cp .env.example .env.local   # then paste your real key into .env.local
npm run dev
```
Open the printed localhost URL. The Today/Exams/Drills tabs work immediately;
the AI tabs (Mocks analysis, CA, English, Doubts) need `vercel dev` instead of
plain `vite dev` to run the `/api/ask` function locally — see Vercel's docs if
you want that, or just skip straight to deploying, which handles it automatically.

## 3. Push this folder to GitHub
Easiest without the command line: create a new repo at github.com/new, then use
the "uploading an existing file" link on the empty repo page to drag this whole
folder in. (Or use GitHub Desktop, or `git init && git add . && git commit -m "init"
&& git remote add origin <your-repo-url> && git push -u origin main` if you're
comfortable with git.)

## 4. Deploy on Vercel
1. Go to vercel.com → sign in with GitHub → **Add New… → Project**.
2. Import the repo you just created. Vercel auto-detects Vite — leave the
   build settings as default.
3. Before clicking Deploy, expand **Environment Variables** and add:
   - Key: `GEMINI_API_KEY`
   - Value: the key from step 1
4. Click **Deploy**. A minute or two later you get a permanent URL like
   `your-project.vercel.app` — bookmark it, that's your tracker now.

## Notes
- **Storage lives in this browser only.** No account, no sync across devices.
  Same browser + same device = your history is there. A different browser,
  device, or "clear site data" = it's gone. Good enough for one person on
  one phone; not a backup.
- **Gemini's free tier has real limits** (roughly 10–15 requests/minute,
  a few hundred to ~1,000/day depending on the model) — generous for one
  person's daily use, but not infinite. Current numbers: https://ai.google.dev/gemini-api/docs/rate-limits
- To change the model `api/ask.js` uses, edit `GEMINI_MODEL` at the top of
  that file (e.g. to `gemini-2.5-flash-lite` for an even higher free rate limit,
  at some cost to answer quality).
