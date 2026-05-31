// Vercel serverless proxy — fetches a Yahoo Finance quote server-side
// and returns it with CORS headers so browser JS can read it.
// GET /api/quote?symbol=TQQQ

const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

async function yFetch(host, symbol) {
  const url =
    'https://' + host + '/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=1d&range=1d';
  return fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sym = (req.query.symbol || '').trim().toUpperCase();
  if (!sym || !/^[A-Z0-9.\-^=]{1,12}$/.test(sym)) {
    return res.status(400).json({ error: 'invalid symbol' });
  }

  // Try query1 first; fall back to query2 on 429 or network error
  let upstream;
  try {
    upstream = await yFetch('query1.finance.yahoo.com', sym);
    if (upstream.status === 429 || upstream.status >= 500) {
      upstream = await yFetch('query2.finance.yahoo.com', sym);
    }
  } catch (_) {
    try {
      upstream = await yFetch('query2.finance.yahoo.com', sym);
    } catch (err) {
      return res.status(502).json({ error: 'upstream unreachable: ' + err.message });
    }
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'upstream ' + upstream.status });
  }

  let data;
  try { data = await upstream.json(); }
  catch { return res.status(502).json({ error: 'bad JSON from upstream' }); }

  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || price == null || Number.isNaN(price)) {
    return res.status(404).json({ error: 'no price for ' + sym });
  }

  const prevClose =
    meta.chartPreviousClose ??
    meta.regularMarketPreviousClose ??
    meta.previousClose ??
    price;

  const change       = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  // CDN-cache for 5 min, then serve stale for 60 s
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  return res.status(200).json({
    symbol:        sym,
    price,
    change:        parseFloat(change.toFixed(4)),
    changePercent: parseFloat(changePercent.toFixed(4)),
    prevClose,
  });
};
