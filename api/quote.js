// Vercel serverless proxy — fetches live quotes from stooq.com (no API key needed)
// and returns all requested symbols in one JSON response with CORS headers.
//
// GET /api/quote?symbols=TQQQ,TSM,NLR,AI,QTUM,MRVL
// GET /api/quote?symbol=TQQQ          (single, for backwards compat)

const STOOQ_FIELDS = 'sd2t2ohlcvnp'; // includes "previous" close

async function fetchOne(sym) {
  const ticker = sym.toLowerCase() + '.us';
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(ticker)}&f=${STOOQ_FIELDS}&h&e=json`;

  console.log(`[quote] fetching ${sym} → ${url}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`stooq HTTP ${res.status} for ${sym}`);

  const data = await res.json();
  const row  = data?.symbols?.[0];
  if (!row || row.close == null) throw new Error(`no data for ${sym}`);

  const price     = row.close;
  const prevClose = row.previous ?? row.open ?? price;
  const change    = parseFloat((price - prevClose).toFixed(4));
  const changePct = prevClose
    ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(4))
    : 0;

  console.log(`[quote] ${sym}: price=${price} prev=${prevClose} chg=${change} (${changePct}%)`);

  return { symbol: sym.toUpperCase(), price, change, changePercent: changePct, prevClose };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Accept ?symbols=TQQQ,TSM,… or legacy ?symbol=TQQQ
  const raw = (req.query.symbols || req.query.symbol || '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'symbols param required' });

  const syms = raw.split(',').map(s => s.trim()).filter(Boolean);
  const invalid = syms.find(s => !/^[A-Z0-9.\-^=]{1,12}$/.test(s));
  if (invalid) return res.status(400).json({ error: `invalid symbol: ${invalid}` });

  console.log(`[quote] batch request for: ${syms.join(', ')}`);

  const results = await Promise.allSettled(syms.map(fetchOne));

  const quotes = {};
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      quotes[syms[i]] = r.value;
    } else {
      errors.push(`${syms[i]}: ${r.reason?.message}`);
      console.error(`[quote] error for ${syms[i]}:`, r.reason?.message);
    }
  });

  if (errors.length) console.warn('[quote] partial failures:', errors);

  // CDN-cache for 5 min, stale-while-revalidate 60 s
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  return res.status(200).json({ quotes, errors });
};
