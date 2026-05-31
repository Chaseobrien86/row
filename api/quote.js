// Vercel serverless proxy — live stock quotes with no browser CORS issues.
// GET /api/quote?symbols=TQQQ,TSM,NLR,AI,QTUM,MRVL
// GET /api/quote?symbol=TQQQ   (single, backwards-compat)
//
// Strategy: try Yahoo Finance chart API first (works from Vercel server IPs),
// fall back to stooq.com (no key needed) per symbol.

async function fetchYahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  console.log(`[quote] Yahoo → ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  console.log(`[quote] Yahoo ${sym} HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || price == null || isNaN(price)) throw new Error(`Yahoo: no price for ${sym}`);

  const prevClose = meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? meta.previousClose ?? price;
  const change = parseFloat((price - prevClose).toFixed(4));
  const changePercent = prevClose ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(4)) : 0;

  console.log(`[quote] Yahoo ${sym}: price=${price} prev=${prevClose} chg=${change}`);
  return { symbol: sym, price, change, changePercent, prevClose, source: 'yahoo' };
}

async function fetchStooq(sym) {
  const ticker = sym.toLowerCase() + '.us';
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker)}&f=sd2t2ohlcvnp&h&e=json`;
  console.log(`[quote] Stooq → ${url}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  console.log(`[quote] Stooq ${sym} HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);

  const data = await res.json();
  console.log(`[quote] Stooq ${sym} raw:`, JSON.stringify(data?.symbols?.[0] || {}));

  const row = data?.symbols?.[0];
  if (!row || row.close == null) throw new Error(`Stooq: no data for ${sym}`);

  const price = row.close;
  const prevClose = row.previous ?? row.open ?? price;
  const change = parseFloat((price - prevClose).toFixed(4));
  const changePercent = prevClose ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(4)) : 0;

  console.log(`[quote] Stooq ${sym}: price=${price} prev=${prevClose} chg=${change}`);
  return { symbol: sym, price, change, changePercent, prevClose, source: 'stooq' };
}

async function fetchOne(sym) {
  try {
    return await fetchYahoo(sym);
  } catch (yahooErr) {
    console.warn(`[quote] Yahoo failed for ${sym}: ${yahooErr.message} — trying stooq`);
    return await fetchStooq(sym);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = (req.query.symbols || req.query.symbol || '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'symbols param required' });

  const syms = raw.split(',').map(s => s.trim()).filter(Boolean);
  const invalid = syms.find(s => !/^[A-Z0-9.\-^=]{1,12}$/.test(s));
  if (invalid) return res.status(400).json({ error: `invalid symbol: ${invalid}` });

  console.log(`[quote] request for: ${syms.join(', ')}`);

  // Fetch sequentially with a small gap to avoid tripping rate limits
  const quotes = {};
  const errors = [];
  for (const sym of syms) {
    try {
      quotes[sym] = await fetchOne(sym);
      console.log(`[quote] ✓ ${sym}: $${quotes[sym].price} via ${quotes[sym].source}`);
    } catch (err) {
      errors.push(`${sym}: ${err.message}`);
      console.error(`[quote] ✗ ${sym}: ${err.message}`);
    }
    // 150 ms gap between requests
    if (syms.indexOf(sym) < syms.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`[quote] done — ${Object.keys(quotes).length}/${syms.length} succeeded`);
  if (errors.length) console.warn(`[quote] errors:`, errors);

  // No CDN cache — prices must always be fresh from the server
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({ quotes, errors });
};
