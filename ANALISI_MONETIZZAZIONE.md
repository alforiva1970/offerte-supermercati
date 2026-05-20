# OfferteMax — Analisi Monetizzazione

## Stato Attuale
- **PWA client-side pura** (HTML/JS/CSS, zero backend)
- OCR volantini (Tesseract.js), scanner barcode (html5-qrcode + OpenFoodFacts)
- Dati solo in localStorage dell'utente
- Chart.js importato ma MAI usato (nessun grafico)
- Service Worker registrato ma senza caching (PWA non funzionante)
- AI Nano (`window.ai`) solo Chrome Canary — inutilizzabile per il 99% degli utenti
- **Zero monetizzazione**: niente ads, niente premium, niente backend

## 3 Strade

### A. SaaS B2C (classica)
Backend + account + cloud sync. Modello freemium.
- **Pro**: modello noto, scalabile
- **Contro**: richiede server, moderazione, utenti, supporto. Costi vivi. Concorrenza con DoveConviene/PromoQui.
- **Verdetto**: non consigliato — risorse infinite per un mercato saturo.

### B. B2B — Dati ai supermercati
I prezzi inseriti dagli utenti diventano dati di intelligence.
- **Pro**: il dato ha valore, zero concorrenza su questo
- **Contro**: serve massa critica di utenti, legalmente grigio (TOS chiara necessaria)
- **Potenziale**: catene medie/locali senza infrastruttura dati propria
- **Verdetto**: interessante MA strategico, non tattico

### C. Prodotto + Ecosistema Siliceo (consigliata)
Non vendere l'app. Vendere **l'agente** che usa l'app.

## Strategia Consigliata: Agente Prezzi Siliceo

OfferteMax diventa un **sensor** nell'ecosistema Siliceo. L'app rimane gratuita per l'utente. Il valore sta in ciò che Siliceo CI costruisce sopra.

### Cosa fare (ordine di impatto):

1. **Backend minimo** (1 settimana)
   - `backend.py` con SQLite + API sync
   - Account anonimi (no password, solo token device)
   - Endpoint: `POST /sync` per upload prezzi, `GET /analytics` per trend

2. **Sync sull'app** (2 giorni)
   - App.pusha prezzi a backend
   - Backend aggrega: prezzo medio/mediano per prodotto per supermercato

3. **Agente prezzo** (Siliceo skill, 3 giorni)
   - L'utente dice: "dammi la lista della spesa"
   - Siliceo cerca nel database OfferteMax i prezzi migliori oggi
   - Risposta: "Esselunga costa 32€, Conad 38€. Vai da Esselunga."

4. **Monetizzazione**: **Consulenza + White Label**
   - Non vendi l'app. Offri l'agente AI a piccole attività commerciali:
     - "Il tuo agente che monitora i prezzi dei fornitori"
     - RNN mensile: 50-100€/attività
   - **Target**: piccoli supermercati, gastronomie, farmers market — nessuno fa AI per loro

### Quanto può rendere?

| Fase | Cosa | Ricavo |
|------|------|--------|
| 0 | App gratuita (oggi) | 0€ |
| 1 | Backend + sync | 0€ (infrastruttura) |
| 2 | Agente prezzo personale | 0€ (valore ecosistema) |
| 3 | White label per attività | 50-100€/mese x cliente |
| 4 | Dati aggregati anonimi (B2B) | 200-500€/report |

### Cosa NON fare
- Non inseguire DoveConviene (hanno i volantini digitali, tu no)
- Non fare pubblicità (distrugge UX, rende zero senza traffico)
- Non cercare VCs (mercatino morto, non finanziano più)

### Conclusione
OfferteMax **non è il prodotto**. È il **sensore** per un prodotto più grande: un agente AI che sa dove conviene comprare. Il vero valore non è nell'app — è in Siliceo che la usa.
