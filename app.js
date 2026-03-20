// ======= VARIABILI GLOBALI =======
let products = [];
let isScanning = false;
let currentBarcode = null;
let currentFlyerImage = null;
let extractedOffers = [];
let ocrWorker = null;
let currentFilter = 'all';
let barcodeCache = {};
let html5QrcodeScanner = null;

// ======= INIZIALIZZAZIONE =======
document.addEventListener('DOMContentLoaded', function () {
    loadData();
    loadBarcodeCache();
    renderProducts();
    updateStats();
    setupEventListeners();
    showNotification('OfferteMax v4.1 caricato!', 'success');
});

function loadBarcodeCache() {
    try {
        const cached = localStorage.getItem('barcode_cache');
        if (cached) barcodeCache = JSON.parse(cached);
    } catch (error) {
        console.error('Errore caricamento cache:', error);
        barcodeCache = {};
    }
}

function saveBarcodeCache() {
    try {
        localStorage.setItem('barcode_cache', JSON.stringify(barcodeCache));
    } catch (error) {
        console.error('Errore salvataggio cache:', error);
    }
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', renderProducts);
    document.getElementById('productPrice').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') addProduct();
    });
    document.getElementById('productName').addEventListener('blur', function () {
        if (this.value.trim()) document.getElementById('productPrice').focus();
    });
}

// ======= OCR PATCH (MIGLIORATO) =======
function processOCRFlyer(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        currentFlyerImage = e.target.result;
        document.getElementById('flyerImage').src = currentFlyerImage;
        document.getElementById('flyerPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function startOCRAnalysis() {
    if (!currentFlyerImage) return;
    const analyzeBtn = document.getElementById('analyzeOCRBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="loading-spinner"></span>Analisi OCR...';
    updateOCRProgress(10, 'Caricamento worker...');
    try {
        const worker = await Tesseract.createWorker('ita', 1, {
            logger: m => console.log(m),
            errorHandler: err => console.error('Tesseract Error:', err),
            langPath: 'https://tessdata.projectnaptha.com/4.0.0_best', // Use reliable remote tessdata
        });
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
            tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ€.,% ',
            user_defined_dpi: '300' // Fix resolution warning
        });
        updateOCRProgress(50, 'Lettura testo...');
        const { data: { text, confidence } } = await worker.recognize(currentFlyerImage);
        await worker.terminate();

        // Patch: mostra testo OCR a video per debug
        console.log('Testo OCR grezzo:', text);

        updateOCRProgress(90, 'Analisi offerte...');

        let offers = [];
        let usedAI = false;

        // Tentativo con Nano AI (window.ai)
        if (window.ai) {
            try {
                updateOCRProgress(95, 'Analisi AI in corso...');
                offers = await extractOffersWithAI(text);
                usedAI = true;
                showNotification('Analisi completata con Nano AI!', 'success');
            } catch (err) {
                console.warn('Nano AI fallita o non disponibile, uso algoritmo classico.', err);
            }
        } else {
            console.log('Nano AI non supportata dal browser.');
        }

        // Fallback su Regex se AI fallisce o non trova nulla
        if (!usedAI || offers.length === 0) {
            offers = extractOffersFromText(text);
        }

        if (offers.length > 0) {
            displayExtractedOffers(offers);
            showNotification(`Trovate ${offers.length} offerte!`, 'success');
        } else {
            showNotification('Nessuna offerta chiara trovata.', 'warning');
        }
    } catch (error) {
        console.error(error);
        showNotification('Errore OCR: ' + error.message, 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '🔍 Avvia OCR';
        setTimeout(() => document.getElementById('ocrProgress').style.display = 'none', 2000);
    }
}

async function extractOffersWithAI(text) {
    // Feature detection per diverse versioni dell'API
    let session = null;

    try {
        if (window.ai.languageModel) {
            const capabilities = await window.ai.languageModel.capabilities();
            if (capabilities.available !== 'no') {
                session = await window.ai.languageModel.create();
            }
        } else if (window.ai.canCreateTextSession) {
            if ((await window.ai.canCreateTextSession()) === 'readily') {
                session = await window.ai.createTextSession();
            }
        }
    } catch (e) { console.log("AI Error creation", e); }

    if (!session) throw new Error("AI non supportata");

    const prompt = `
    Analizza il seguente testo OCR di un volantino supermercato.
    Estrai una lista di prodotti in formato JSON.
    Regole:
    1. Ignora date, indirizzi e testo inutile.
    2. Cerca di correggere nomi di prodotti frammentati o con errori di battitura.
    3. Estrai il prezzo corretto (preferisci prezzo confezione a prezzo al kg).
    4. Output DEVE essere SOLO un array JSON valido: [{"name": "Nome Prodotto", "price": 1.99}, ...]
    
    Testo OCR:
    ${text.substring(0, 4000)}
    `;

    const result = await session.prompt(prompt);

    const jsonMatch = result.match(/\[.*\]/s);
    if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map(p => ({
            ...p,
            originalPrice: p.price * 1.2,
            supermarket: detectSupermarket(text),
            fromOCR: true,
            confidence: 0.95
        }));
    }
    return [];
}

// v6.0 - Approccio basato su keyword invece di pattern linea
function extractOffersFromText(text) {
    console.log("--- INIZIO ANALISI OCR (v6.0) ---");
    const products = [];

    // Preprocessa il testo
    const cleanText = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    console.log("Testo pulito:", cleanText);

    // Pattern per prodotti comuni (nomi tipici da supermercato)
    const productKeywords = [
        /\b(gnocchi\s+\w+)/gi,
        /\b(broccoli\s*\w*)/gi,
        /\b(gamberi\s+\w+)/gi,
        /\b(pistacchi\s*\w*)/gi,
        /\b(pasta\s+\w+)/gi,
        /\b(prosciutto\s*\w*)/gi,
        /\b(formaggio\s*\w*)/gi,
        /\b(mozzarella\s*\w*)/gi,
        /\b(parmigiano\s*\w*)/gi,
        /\b(latte\s*\w*)/gi,
        /\b(yogurt\s*\w*)/gi,
        /\b(biscotti\s*\w*)/gi,
        /\b(caffè\s*\w*)/gi,
        /\b(olio\s+\w+)/gi,
        /\b(vino\s+\w+)/gi,
        /\b(birra\s*\w*)/gi,
        /\b(acqua\s*\w*)/gi,
        /\b(succo\s*\w*)/gi,
        /\b(pane\s*\w*)/gi,
        /\b(pollo\s*\w*)/gi,
        /\b(manzo\s*\w*)/gi,
        /\b(maiale\s*\w*)/gi,
        /\b(salmone\s*\w*)/gi,
        /\b(tonno\s*\w*)/gi,
        /\b(insalata\s*\w*)/gi,
        /\b(pomodori\s*\w*)/gi,
        /\b(patate\s*\w*)/gi,
        /\b(cipolle\s*\w*)/gi,
        /\b(nutella\s*\w*)/gi,
        /\b(barilla\s*\w*)/gi,
        /\b(mulino\s+bianco\s*\w*)/gi,
    ];

    // Pattern per prezzi
    const pricePattern = /(\d+)[,.\s]+(\d{2})\s*€?|€\s*(\d+)[,.](\d{2})/g;

    // Trova tutti i prezzi nel testo
    const allPrices = [];
    let priceMatch;
    while ((priceMatch = pricePattern.exec(cleanText)) !== null) {
        const euros = priceMatch[1] || priceMatch[3];
        const cents = priceMatch[2] || priceMatch[4];
        if (euros && cents) {
            const price = parseFloat(euros + '.' + cents);
            if (price > 0.10 && price < 500) {
                allPrices.push({
                    price,
                    index: priceMatch.index,
                    text: priceMatch[0]
                });
            }
        }
    }

    console.log("Prezzi trovati:", allPrices);

    // Cerca prodotti e associali ai prezzi più vicini
    for (const pattern of productKeywords) {
        let match;
        while ((match = pattern.exec(cleanText)) !== null) {
            const productName = match[1].trim();
            const productIndex = match.index;

            // Trova il prezzo più vicino (entro 100 caratteri)
            const nearbyPrices = allPrices.filter(p =>
                Math.abs(p.index - productIndex) < 100
            ).sort((a, b) =>
                Math.abs(a.index - productIndex) - Math.abs(b.index - productIndex)
            );

            if (nearbyPrices.length > 0) {
                const finalPrice = Math.min(...nearbyPrices.map(p => p.price));

                // Evita duplicati
                if (!products.some(p => p.name.toLowerCase() === productName.toLowerCase())) {
                    products.push({
                        name: capitalizeWords(productName),
                        price: finalPrice,
                        originalPrice: finalPrice * 1.2,
                        fromOCR: true,
                        supermarket: detectSupermarket(text),
                        confidence: 0.8
                    });
                    console.log(`✅ TROVATO: ${productName} @ €${finalPrice}`);
                }
            }
        }
    }

    console.log("--- FINE ANALISI OCR ---");
    console.log(`Prodotti estratti: ${products.length}`);
    return products.slice(0, 30);
}

// Riconosce righe che contengono nomi di prodotti
function isProductLine(text) {
    // Pattern positivi: nomi propri capitalizzati
    const productPatterns = [
        /^[A-Z][a-zàèéìòù]+(?:\s+[A-Z][a-zàèéìòù]+)*$/,  // "Gnocchi Ripieni"
        /^[A-Z][a-zàèéìòù]+\s+[A-Z][a-zàèéìòù]+\s+[A-Z]{2,}$/,  // "Patate Bologna DOP"
        /^[A-Z][a-zàèéìòù]+$/  // "Avocado"
    ];

    // Pattern negativi: rumore da filtrare
    const noisePatterns = [
        /^(?:dal|al|da|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i,
        /^\d{1,2}\/\d{1,2}/,  // Date
        /^(?:frutta|verdura|freschi|coltivato|ogni|giorno)/i,
        /^(?:vale|davvero|sconto|alla|cassa|ancora|più|deluxe)/i,
        /^[-\d%\.\s€]+$/,  // Solo numeri/simboli
        /^(?:al|per|pezzo|kg|confezione|rete|g\s)/i,
        /^(?:lemozione|con|radicchio|scamorza|tartufo|californiani|copripiumino)/i
    ];

    const isProduct = productPatterns.some(p => p.test(text));
    const isNoise = noisePatterns.some(n => n.test(text));

    return isProduct && !isNoise && text.length > 2;
}

// Cerca prezzi in una finestra di 3-4 righe dopo il nome prodotto
function extractPricesFromContext(lines, currentIndex) {
    const prices = [];
    const windowSize = 4;

    for (let i = currentIndex; i < Math.min(currentIndex + windowSize, lines.length); i++) {
        const line = lines[i];

        // Pattern 1: numeri con decimali (1.49, 0,99, 13.73)
        const decimalMatches = line.match(/(\d+[,.]\d{2})/g);
        if (decimalMatches) {
            decimalMatches.forEach(m => {
                const price = parseFloat(m.replace(',', '.'));
                if (price > 0.10 && price < 500) prices.push(price);
            });
        }

        // Pattern 2: "0 99" → 0.99 (spazio invece di punto)
        const spacedMatches = line.match(/(\d+)\s+(\d{2})(?!\d)/g);
        if (spacedMatches) {
            spacedMatches.forEach(m => {
                const parts = m.trim().split(/\s+/);
                if (parts.length === 2) {
                    const price = parseFloat(parts[0] + '.' + parts[1]);
                    if (price > 0.10 && price < 500) prices.push(price);
                }
            });
        }
    }

    return [...new Set(prices)]; // Rimuove duplicati
}

// Trova unità di misura nelle righe successive
function findUnit(lines, productIndex) {
    const unitPatterns = /(?:al\s+)?(pezzo|kg|confezione|rete|g\s)/i;

    for (let i = productIndex; i < Math.min(productIndex + 3, lines.length); i++) {
        const match = lines[i].match(unitPatterns);
        if (match) return match[1];
    }
    return null;
}

// Trova sconto percentuale nelle righe successive
function findDiscount(lines, productIndex) {
    const discountPattern = /-(\d+)%/;

    for (let i = productIndex; i < Math.min(productIndex + 4, lines.length); i++) {
        const match = lines[i].match(discountPattern);
        if (match) return match[0];
    }
    return null;
}

// Calcola confidenza basata su qualità nome e prezzi
function calculateConfidence(productName, prices) {
    let confidence = 0.5;

    // Nome lungo e ben formato = più confidenza
    if (productName.length > 5) confidence += 0.2;
    if (/^[A-Z]/.test(productName)) confidence += 0.1;

    // Prezzi multipli (originale + sconto) = più confidenza
    if (prices.length > 1) confidence += 0.2;

    return Math.min(confidence, 1.0);
}

function isUnitPrice(line, index, length) {
    const suffix = line.substring(index + length, index + length + 10).toLowerCase();
    if (/[\/\s](kg|hg|gr|g|l|lt|etto)\b/.test(suffix)) return true;
    const prefix = line.substring(Math.max(0, index - 10), index).toLowerCase();
    if (/(kg|hg|gr|g|l|lt|etto|al)[\s\/\.:]*$/.test(prefix)) return true;
    return false;
}

function preprocessOcrText(text) {
    return text
        .replace(/alko/gi, "all'etto ")
        .replace(/(\d)o\b/g, '$10')
        .replace(/€/g, ' € ')
        .replace(/\s{2,}/g, ' ')
        // Fix comuni OCR
        .replace(/\|/g, 'I') // Pipe -> I
        .replace(/([0-9])([a-zA-Z])/g, '$1 $2'); // Spazio tra numero e testo
}

function cleanProductName(name) {
    let cleaned = name.replace(/^[^a-zA-Z0-9]+/, ''); // Via simboli iniziali

    const stopWords = [
        'offerta', 'sconto', 'solo', 'al kg', 'al pezzo', 'conf', 'confezione',
        'prezzo', 'speciale', 'carta', 'fidaty', 'soci', 'punti', 'fragola', 'super',
        'risparmio', 'sottocosto', 'volantino', 'validi', 'salvo', 'errori', 'omiss'
    ];

    const regex = new RegExp(`\\b(${stopWords.join('|')})\\b`, 'gi');
    cleaned = cleaned.replace(regex, '').replace(/\s+/g, ' ').trim();

    // Rimuove numeri isolati all'inizio (es. "1. Pasta") o alla fine se sembrano residui
    cleaned = cleaned.replace(/^\d+[\.\s]+/, '').replace(/\s+\d+$/, '');

    return cleaned.substring(0, 60);
}

function isNoise(text) {
    if (text.length < 3) return true;
    if (/^\d+$/.test(text)) return true;
    if (text.includes('scade il')) return true;
    if (text.toLowerCase().includes('www.')) return true;
    return false;
}

function capitalizeWords(str) {
    return str.replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function detectSupermarket(text) {
    const supermarkets = {
        'conad': 'Conad', 'coop': 'Coop', 'esselunga': 'Esselunga', 'lidl': 'Lidl', 'eurospin': 'Eurospin', 'md': 'MD'
    };
    const lowerText = text.toLowerCase();
    for (const [key, name] of Object.entries(supermarkets)) {
        if (lowerText.includes(key)) return name;
    }
    return 'Supermercato';
}
function removeSimilarOffers(offers) {
    const unique = [];
    const seen = new Set();
    offers.forEach(offer => {
        const key = `${offer.name.substring(0, 10)}-${offer.price}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(offer);
        }
    });
    return unique;
}
function updateOCRProgress(pct, status) {
    document.getElementById('ocrProgress').style.display = 'block';
    document.getElementById('ocrProgressBar').style.width = pct + '%';
    document.getElementById('ocrStatus').textContent = status;
}
function displayExtractedOffers(offers) {
    extractedOffers = offers;
    const container = document.getElementById('extractedOffers');
    container.innerHTML = '';
    offers.forEach((offer, index) => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div style="font-weight:bold;">${offer.name}</div>
            <div style="color:#27ae60;font-weight:bold;">€${offer.price.toFixed(2)}</div>
            <button class="btn" style="margin-top:10px;height:30px;" onclick="addSingleExtractedOffer(${index})">Aggiungi</button>
        `;
        container.appendChild(div);
    });
    document.getElementById('flyerResults').style.display = 'block';
}
function addSingleExtractedOffer(index) {
    const offer = extractedOffers[index];
    if (!offer) return;
    products.push({ ...offer, id: Date.now() + Math.random(), date: new Date() });
    extractedOffers.splice(index, 1);
    displayExtractedOffers(extractedOffers);
    renderProducts();
    updateStats();
    saveData();
    showNotification('Aggiunto!', 'success');
}
function addAllExtractedOffers() {
    extractedOffers.forEach(offer => products.push({ ...offer, id: Date.now() + Math.random(), date: new Date() }));
    extractedOffers = [];
    document.getElementById('flyerResults').style.display = 'none';
    renderProducts();
    updateStats();
    saveData();
    showNotification('Tutti aggiunti!', 'success');
}
function clearFlyerPreview() {
    document.getElementById('flyerPreview').style.display = 'none';
    document.getElementById('flyerResults').style.display = 'none';
    currentFlyerImage = null;
}
// ======= SCANNER BARCODE =======
function toggleScanner() {
    if (isScanning) stopScanner();
    else startScanner();
}

function startScanner() {
    const container = document.getElementById('scannerContainer');
    container.classList.add('active');
    isScanning = true;

    if (!html5QrcodeScanner) {
        // Usa l'ID del div preview ('scanner-preview') per la libreria
        html5QrcodeScanner = new Html5Qrcode("scanner-preview");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };

    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onBarcodeDetected,
        (errorMessage) => {
            // Ignoriamo gli errori temporanei di scan
        }
    ).then(() => {
        showNotification('Scanner attivo - inquadra il codice', 'success');
    }).catch((err) => {
        console.error('[Barcode] Init error:', err);
        showNotification('Errore fotocamera: ' + err, 'error');
        stopScanner();
    });
}

function showFlyerSources() {
    const sources = [
        "https://www.volantinofacile.it/",
        "https://www.doveconviene.it/",
        "https://www.promoqui.it/"
    ];
    const msg = "Trova i volantini qui:\n\n" + sources.join("\n");
    if (confirm(msg + "\n\nVuoi aprire una ricerca su Google?")) {
        window.open("https://www.google.com/search?q=volantini+supermercati+offerte", "_blank");
    }
}

function stopScanner() {
    if (isScanning && html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            isScanning = false;
            document.getElementById('scannerContainer').classList.remove('active');
        }).catch((err) => {
            console.error("Failed to stop scanner.", err);
            // Ensure UI is reset even if stop fails (e.g., if start never completed)
            isScanning = false;
            document.getElementById('scannerContainer').classList.remove('active');
        });
    } else {
        isScanning = false;
        document.getElementById('scannerContainer').classList.remove('active');
    }
}

async function onBarcodeDetected(decodedText, decodedResult) {
    const code = decodedText;
    if (currentBarcode === code) return;
    currentBarcode = code;
    stopScanner();
    const info = await getProductFromBarcode(code);
    document.getElementById('barcodeCode').innerText = code;
    document.getElementById('barcodeName').innerText = info.name;
    document.getElementById('barcodeResult').style.display = 'block';
    setTimeout(() => {
        document.getElementById('productName').value = info.name;
        document.getElementById('productPrice').focus();
    }, 1000);
}
async function getProductFromBarcode(barcode) {
    // Check cache first
    if (barcodeCache[barcode]) {
        console.log('[Barcode] Cache hit:', barcode);
        return { name: barcodeCache[barcode] };
    }

    // Try OpenFoodFacts API
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await response.json();

        if (data.status === 1 && data.product) {
            const product = data.product;
            const name = product.product_name_it || product.product_name || product.brands || 'Prodotto';
            const quantity = product.quantity || '';
            const fullName = quantity ? `${name} ${quantity}` : name;

            // Cache it
            barcodeCache[barcode] = fullName;
            saveBarcodeCache();

            console.log('[Barcode] OpenFoodFacts found:', fullName);
            return { name: fullName };
        }
    } catch (error) {
        console.warn('[Barcode] OpenFoodFacts error:', error);
    }

    // Fallback
    console.log('[Barcode] Not found, using code');
    return { name: "Prodotto " + barcode };
}
function useBarcodeResult() {
    if (currentBarcode) {
        document.getElementById('barcodeResult').style.display = 'none';
        document.getElementById('productPrice').focus();
    }
}
// ======= GESTIONE PRODOTTI =======
function addProduct() {
    const name = document.getElementById('productName').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const market = document.getElementById('supermarketSelect').value;
    if (!name || isNaN(price) || price <= 0) {
        showNotification('Dati mancanti o prezzo errato!', 'warning');
        return;
    }
    products.push({
        id: Date.now(),
        name: name,
        price: price,
        supermarket: market || 'Generico',
        date: new Date()
    });
    saveData();
    renderProducts();
    updateStats();
    document.getElementById('productName').value = '';
    document.getElementById('productPrice').value = '';
    showNotification('Prodotto aggiunto!', 'success');
}
function renderProducts() {
    const container = document.getElementById('productsContainer');
    container.innerHTML = '';
    const term = document.getElementById('searchInput').value.toLowerCase();
    let list = products.filter(p => p.name.toLowerCase().includes(term));
    if (currentFilter === 'ocr') list = list.filter(p => p.fromOCR);
    if (currentFilter === 'scanner') list = list.filter(p => p.fromScanner);
    list.reverse().forEach(p => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div style="font-weight:bold;">${p.name}</div>
            <div style="display:flex; justify-content:space-between;">
                <span style="color:#27ae60;font-weight:bold;">€${p.price.toFixed(2)}</span>
                <span>${p.supermarket}</span>
            </div>
            <button onclick="deleteProduct(${p.id})" class="btn" style="background:#e74c3c;margin-top:5px;height:30px;">Elimina</button>
        `;
        container.appendChild(div);
    });
}
function deleteProduct(id) {
    if (confirm('Eliminare?')) {
        products = products.filter(p => p.id !== id);
        saveData();
        renderProducts();
        updateStats();
    }
}
function filterProducts(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-filter="${type}"]`).classList.add('active');
    renderProducts();
}
// ======= GESTIONE DATI =======
function saveData() {
    localStorage.setItem('offertemax_data', JSON.stringify(products));
}
function loadData() {
    const d = localStorage.getItem('offertemax_data');
    if (d) products = JSON.parse(d);
}
function updateStats() {
    document.getElementById('totalProducts').innerText = products.length;
    document.getElementById('totalSavings').innerText = '€' + products.reduce((acc, p) => acc + (p.originalPrice ? p.originalPrice - p.price : 0), 0).toFixed(2);

    // Miglior Affare
    const withDiscount = products.filter(p => p.originalPrice && p.price < p.originalPrice);
    if (withDiscount.length > 0) {
        const best = withDiscount.reduce((prev, current) =>
            ((current.originalPrice - current.price) > (prev.originalPrice - prev.price)) ? current : prev
        );
        document.getElementById('bestDeal').innerText = best.name;
    } else {
        document.getElementById('bestDeal').innerText = '-';
    }

    // Prezzo Medio
    if (products.length > 0) {
        const avg = products.reduce((acc, p) => acc + p.price, 0) / products.length;
        document.getElementById('avgPrice').innerText = '€' + avg.toFixed(2);
    } else {
        document.getElementById('avgPrice').innerText = '€0';
    }
}
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products));
    const node = document.createElement('a');
    node.setAttribute("href", dataStr);
    node.setAttribute("download", "backup.json");
    document.body.appendChild(node);
    node.click();
    node.remove();
}
function importData(event) {
    const reader = new FileReader();
    reader.onload = function (e) {
        products = JSON.parse(e.target.result);
        saveData();
        renderProducts();
        updateStats();
        showNotification('Dati importati!', 'success');
    };
    reader.readAsText(event.target.files[0]);
}
function clearAllData() {
    if (confirm('Cancellare tutto?')) {
        products = [];
        saveData();
        renderProducts();
        updateStats();
    }
}
function showStatistics() {
    alert('Prodotti: ' + products.length);
}
function showNotification(msg, type) {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerText = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}
