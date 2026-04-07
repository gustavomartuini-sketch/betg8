# PredictIndia — Deployment Guide

## Hızlı Deployment (15 dakika)

---

### ADIM 1 — Polymarket Builder API Key Al

1. Polymarket.com'a git ve giriş yap
2. Sağ üst → Profile → **Builder API Keys**
3. **"Create API Key"** tıkla
4. Key'i kopyala ve güvenli bir yere kaydet

📌 Builder program kaydı: https://builders.polymarket.com/

---

### ADIM 2 — GitHub'a Push Et

```bash
cd predictindia

# Git başlat
git init
git add .
git commit -m "PredictIndia v1 — Polymarket India platform"

# GitHub'da yeni repo oluştur: github.com/new
# Adı: predictindia (veya istediğin isim)

git remote add origin https://github.com/KULLANICI_ADIN/predictindia.git
git branch -M main
git push -u origin main
```

---

### ADIM 3 — Vercel'e Deploy Et

**Seçenek A — Vercel CLI (önerilen):**
```bash
npm install -g vercel
vercel login
vercel --prod
```

**Seçenek B — Vercel Dashboard:**
1. vercel.com → New Project
2. GitHub repo'nu import et
3. Framework: Next.js (otomatik algılar)
4. Deploy tıkla

---

### ADIM 4 — Environment Variables Ekle

Vercel Dashboard → Project → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `BUILDER_ADDRESS` | `0xSenin_Wallet_Adresin` |
| `BUILDER_API_KEY` | `polymarket_builder_xxx` |
| `NEXT_PUBLIC_BUILDER_ADDRESS` | `0xSenin_Wallet_Adresin` |

Sonra: **Deployments → Redeploy** (env vars'ın aktif olması için)

---

### ADIM 5 — Custom Domain (opsiyonel)

Vercel Dashboard → Project → Settings → Domains

Önerilen domain isimler:
- `predictindia.io`
- `predictindia.in`
- `polyindia.com`

---

### ADIM 6 — Polymarket Builder Program'a Kayıt

https://builders.polymarket.com/ → Apply

Başvuruya yaz:
- App URL: `https://predictindia.vercel.app`
- Use case: India-focused Polymarket frontend with UPI deposit flow
- Target market: 1.4B India, cricket/IPL focus
- Expected volume: $X/month

**Verified tier** için onay aldıktan sonra haftalık USDC ödümleri başlar.

---

## Gelir Modeli

```
Kullanıcı trade yapar
    ↓
Builder code CLOB order'a eklenir
    ↓
Polymarket volume'u sana attribute eder
    ↓
Haftalık USDC ödül (volume'a göre)
```

Geçmiş builder kazançları:
- Top builders: $5K–$50K/hafta
- $50M+ volume geçildi üçüncü parti apps üzerinden

---

## Local Development

```bash
cp .env.example .env.local
# .env.local'ı doldur

npm run dev
# → http://localhost:3000
```

---

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript
- **API**: Polymarket Gamma API + CLOB API
- **Chain**: Polygon (settlement)
- **Wallet**: MetaMask + EIP-712 signing
- **Currency**: Live INR/USD via open.er-api.com
- **Hosting**: Vercel (Singapore + Mumbai edge)
- **Builder monetization**: Polymarket Builders Program
