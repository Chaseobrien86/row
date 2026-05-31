// Vercel serverless function — live stock quotes via Yahoo Finance chart API.
// GET /api/quote?symbols=TQQQ,TSM,NLR,AI,QTUM,MRVL
// GET /api/quote?symbol=TQQQ   (single, backwards-compat)
//
// Returns: { quotes: { SYMBOL: { price, change, changePercent, prevClose } }, errors: [] }

async function fetchYahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  console.log(`[quote] GET ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; portfolio-tracker/1.0)',
      'Accept': 'application/json',
    },
  });

  console.log(`[quote] ${sym} → HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;

  if (price == null || isNaN(price)) {
    throw new Error(`no price in response (keys: ${Object.keys(meta || {}).slice(0, 6).join(',')})`);
  }

  const prevClose = meta.chartPreviousClose
    ?? meta.regularMarketPreviousClose
    ?? meta.previousClose
    ?? price;

  const change = parseFloat((price - prevClose).toFixed(4));
  const changePercent = prevClose
    ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(4))
    : 0;

  console.log(`[quote] ${sym} OK: price=${price} prev=${prevClose} chg=${change} (${changePercent}%)`);
  return { symbol: sym, price, change, changePercent, prevClose };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = (req.query.symbols || req.query.symbol || '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'symbols param required' });

  const syms = raw.split(',').map(s => s.trim()).filter(Boolean);
  const invalid = syms.find(s => !/^[A-Z0-9.\-^=]{1,12}$/.test(s));
  if (invalid) return res.status(400).json({ error: `invalid symbol: ${invalid}` });

  console.log(`[quote] batch: ${syms.join(', ')}`);

  const quotes = {};
  const errors = [];

  for (const sym of syms) {
    try {
      quotes[sym] = await fetchYahoo(sym);
    } catch (err) {
      errors.push(`${sym}: ${err.message}`);
      console.error(`[quote] FAIL ${sym}:`, err.message);
    }
    if (syms.indexOf(sym) < syms.length - 1) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  console.log(`[quote] done ${Object.keys(quotes).length}/${syms.length} ok`);
  return res.status(200).json({ quotes, errors });
};
