# templatefill

Play Store link daalo → app ka naam, version, requirements, overview, description
aur "what's new" apne aap fetch ho kar aapke forum-style BBCode template mein fill
ho jate hain. Fields edit bhi ho sakte hain, aur ek click mein copy.

## Vercel pe deploy karna (3 tareeqe)

### Option A — CLI se (sabse tez)
```bash
npm i -g vercel
cd appstore-template
vercel
```
Sawalon ka seedha jawab dete jao (defaults theek hain). Aakhir mein ek live URL mil
jayega.

### Option B — GitHub se
1. Ye folder ek naye GitHub repo mein push karo.
2. https://vercel.com/new pe jaake us repo ko import karo.
3. Framework "Next.js" auto-detect ho jayega — bas "Deploy" dabao.

### Option C — Drag & drop
1. `vercel.com/new` pe jaake "Deploy" wale page pe ye poora folder drag karo
   (make sure `node_modules` shamil na ho).

## Local mein chalana
```bash
npm install
npm run dev
```
Phir http://localhost:3000 kholo.

## Ye kaise kaam karta hai
- `pages/api/fetch-app.js` — serverless function jo Play Store link se package id
  nikaal kar `google-play-scraper` se app ki info fetch karti hai.
- `pages/index.js` — form + editable fields + live BBCode preview.
- Image line, "credit advertisements" line, aur download-instructions wala hissa
  jaan boojh kar fixed rakha hai — original template ke "don't change this part"
  note ke mutabiq.

## Note
Play Store scraping kabhi kabhar fail ho sakti hai (rate limits ya region ki
wajah se) — is case mein fields ko manually bhi fill kiya ja sakta hai, form
usi ke liye editable hai.
