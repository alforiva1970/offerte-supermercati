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
let openRouterApiKey = localStorage.getItem('openrouter_api_key') || '';

// ======= INIZIALIZZAZIONE =======
document.addEventListener('DOMContentLoaded', function () {
    loadData();
    loadBarcodeCache();
    renderProducts();
    updateStats();
    setupEventListeners();
    document.getElementById('openRouterApiKey').value = openRouterApiKey;
    showNotification('OfferteMax v5.0 caricato!', 'success');
});

// ======= IMPOSTAZIONI =======
function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
    } else {
        modal.style.display = 'none';
    }
}

function saveSettings() {
    const key = document.getElementById('openRouterApiKey').value.trim();
    openRouterApiKey = key;
    localStorage.setItem('openrouter_api_key', key);
    toggleSettingsModal();
    showNotification('Impostazioni salvate!', 'success');
}

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

    if (!openRouterApiKey) {
        showNotification('Inserisci la API Key di OpenRouter nelle impostazioni prima di usare l\'OCR.', 'error');
        toggleSettingsModal();
        return;
    }

    const analyzeBtn = document.getElementById('analyzeOCRBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="loading-spinner"></span>Analisi AI in corso...';
    updateOCRProgress(20, 'Invio immagine al modello Vision AI...');

    try {
        let offers = await extractOffersWithOpenRouter(currentFlyerImage);
        updateOCRProgress(100, 'Analisi completata!');

        if (offers.length > 0) {
            displayExtractedOffers(offers);
            showNotification(`Trovate ${offers.length} offerte con Vision AI!`, 'success');
        } else {
            showNotification('Nessuna offerta chiara trovata nel volantino.', 'warning');
        }
    } catch (error) {
        console.error(error);
        showNotification('Errore Vision AI: ' + error.message, 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '🔍 Avvia OCR Vision';
        setTimeout(() => document.getElementById('ocrProgress').style.display = 'none', 2000);
    }
}

async function extractOffersWithOpenRouter(imageBase64) {
    const prompt = `Analizza l'immagine di questo volantino del supermercato. Estrai tutti i prodotti e i loro prezzi in offerta.
Regole:
1. Ignora date, indirizzi e scritte inutili.
2. Formatta l'output ESATTAMENTE come un array JSON valido senza alcun altro testo o formattazione markdown (niente \`\`\`json).
3. Usa la struttura: [{"name": "Nome Prodotto", "price": 1.99, "supermarket": "Nome Supermercato (se capibile, altrimenti 'Sconosciuto')"}]
4. Assicurati che "price" sia un numero (non stringa) e rappresenta il prezzo scontato.

Se non trovi prodotti chiari, restituisci []`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "nvidia/nemotron-nano-12b-v2-vl:free",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": imageBase64
                            }
                        }
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "Errore chiamata OpenRouter API");
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content;

    console.log("Raw Vision AI Response:", resultText);

    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.map(p => ({
                name: p.name || "Prodotto Sconosciuto",
                price: parseFloat(p.price) || 0,
                originalPrice: (parseFloat(p.price) || 0) * 1.2,
                supermarket: p.supermarket || detectSupermarket(""),
                fromOCR: true,
                confidence: 0.95
            })).filter(p => p.price > 0);
        } catch (e) {
            console.error("JSON parse error:", e);
            throw new Error("Il modello ha restituito JSON non valido");
        }
    }

    return [];
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

    // Rimuoviamo qrbox per permettere la messa a fuoco su tutto il frame e disabilitare lo zoom forzato.
    // Impostiamo un aspect ratio più naturale per le fotocamere dei telefoni.
    const config = { fps: 10, aspectRatio: 1.777778 };

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
