// Vercel serverless function – Yahoo Finance live quotes
// GET /api/quote?symbols=TQQQ,TSM,NLR,AI,QTUM,MRVL
// Returns: [{symbol, price, change, changePercent, previousClose}]
// Null entry for any symbol that fails.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = (req.query.symbols || req.query.symbol || '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'symbols param required' });

  const syms = raw.split(',').map(s => s.trim()).filter(Boolean);

  const results = [];
  for (const sym of syms) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      console.log(`[quote] fetching ${sym}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        console.error(`[quote] ${sym} HTTP ${response.status}`);
        results.push(null);
        continue;
      }

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (!meta) {
        console.error(`[quote] ${sym} no meta in response`);
        results.push(null);
        continue;
      }

      const price         = meta.regularMarketPrice ?? null;
      const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change        = (price != null && previousClose != null)
        ? parseFloat((price - previousClose).toFixed(4))
        : (meta.regularMarketChange ?? null);
      const changePercent = (price != null && previousClose != null && previousClose !== 0)
        ? parseFloat(((price - previousClose) / previousClose * 100).toFixed(4))
        : (meta.regularMarketChangePercent ?? null);

      console.log(`[quote] ${sym} OK price=${price} prev=${previousClose} chg=${change} chgPct=${changePercent}`);
      results.push({ symbol: sym, price, change, changePercent, previousClose });
    } catch (err) {
      console.error(`[quote] ${sym} error:`, err.message);
      results.push(null);
    }

    // small gap to avoid triggering rate limits
    if (syms.indexOf(sym) < syms.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return res.status(200).json(results);
};
