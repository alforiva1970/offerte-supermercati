// ======= VARIABILI GLOBALI =======
let products = [];
let isScanning = false;
let currentBarcode = null;
let currentFlyerImage = null;
let extractedOffers = [];
let ocrWorker = null;
let currentFilter = 'all';
let barcodeCache = {};

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
        alert('Testo OCR riconosciuto:\n\n' + text);

        updateOCRProgress(90, 'Analisi offerte...');
        const offers = extractOffersFromText(text);
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

// Regex più flessibile per estrazione prezzi/offerte
function extractOffersFromText(text) {
    const correctedText = preprocessOcrText(text);
    const lines = correctedText.split('\n').filter(line => line.trim().length > 0);
    const offers = [];

    // Regex per catturare prezzi: accetta 1.99, 1,99, 1 99. 
    // Cattura anche numeri isolati se sembrano prezzi (es. 1.29)
    const priceRegex = /(?:€\s*)?(\d{1,3}[., ]\d{2})(?:\s*€)?/g;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;

        // Reset regex
        priceRegex.lastIndex = 0;

        const pricesInLine = [];
        while ((match = priceRegex.exec(line)) !== null) {
            const priceStr = match[1].replace(/,/g, '.').replace(/\s/g, '.');
            const price = parseFloat(priceStr);
            if (isValidPrice(price, line)) {
                pricesInLine.push({ price, index: match.index, length: match[0].length });
            }
        }

        if (pricesInLine.length > 0) {
            // Se ci sono più prezzi, cerchiamo di capire quale è quello "vero" (non al kg)
            // Euristica: il prezzo al kg spesso è seguito da "kg" o "etto" o è più piccolo
            let bestPrice = pricesInLine[0].price;

            if (pricesInLine.length > 1) {
                // Se uno dei prezzi è seguito da "kg" o "etto", scartalo come prezzo principale
                const nonUnitPrices = pricesInLine.filter(p => !isUnitPrice(line, p.index + p.length));
                if (nonUnitPrices.length > 0) {
                    bestPrice = nonUnitPrices[0].price; // Prendi il primo che non sembra un prezzo unitario
                }
            } else if (isUnitPrice(line, pricesInLine[0].index + pricesInLine[0].length)) {
                // Se l'unico prezzo trovato sembra al kg, prova a cercare nella riga successiva o precedente un prezzo migliore
                // Per ora lo accettiamo ma con riserva (potremmo marcarlo)
            }

            // Costruzione Nome: Finestra di contesto (riga prima + riga corrente + riga dopo)
            let rawName = line.replace(priceRegex, '').trim(); // Rimuovi i prezzi dalla riga corrente

            // Se la riga corrente è povera di testo, prendi la riga precedente
            if (rawName.length < 5 && i > 0) {
                rawName = lines[i - 1].trim() + " " + rawName;
            }
            // Se ancora corto, prova la riga dopo (se non ha prezzi)
            if (rawName.length < 15 && i < lines.length - 1 && !priceRegex.test(lines[i + 1])) {
                rawName = rawName + " " + lines[i + 1].trim();
            }

            const cleanName = cleanProductName(rawName);

            if (cleanName.length > 3 && !isNoise(cleanName)) {
                offers.push({
                    name: capitalizeWords(cleanName),
                    price: bestPrice,
                    originalPrice: bestPrice * 1.2,
                    supermarket: detectSupermarket(text),
                    confidence: 0.8,
                    extractedText: line,
                    fromOCR: true
                });
            }
        }
    }
    return removeSimilarOffers(offers).slice(0, 30);
}

function isValidPrice(price, line) {
    if (isNaN(price) || price < 0.1 || price > 500) return false;
    // Scarta anni (es. 2023, 2024) se non c'è simbolo euro vicino
    if (price > 1900 && price < 2100 && !line.includes('€')) return false;
    return true;
}

function isUnitPrice(line, endIndex) {
    // Controlla se subito dopo il prezzo c'è "kg", "hg", "etto", "l"
    const suffix = line.substring(endIndex, endIndex + 10).toLowerCase();
    return /[\/\s](kg|hg|gr|g|l|lt|etto)\b/.test(suffix);
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
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#scanner-preview'),
            constraints: { facingMode: "environment" }
        },
        decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader"] }
    }, function (err) {
        if (err) {
            console.error(err);
            stopScanner();
            return;
        }
        Quagga.start();
    });
    Quagga.onDetected(onBarcodeDetected);
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
    if (isScanning) {
        Quagga.stop();
        isScanning = false;
        document.getElementById('scannerContainer').classList.remove('active');
    }
}
async function onBarcodeDetected(result) {
    const code = result.codeResult.code;
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
    if (barcodeCache[barcode]) return { name: barcodeCache[barcode] };
    const localProducts = { '8000139006041': 'Nutella 450g', '8076800195057': 'Barilla Spaghetti N.5 500g' };
    if (localProducts[barcode]) return { name: localProducts[barcode] };
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
