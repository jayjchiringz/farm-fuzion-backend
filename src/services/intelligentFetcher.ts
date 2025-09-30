/* eslint-disable valid-jsdoc */
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
import axios from "axios";
import cheerio from "cheerio";

/**
 * Fetch commodity price from trusted sources (fallbacks included).
 * - TradingEconomics
 * - IndexMundi
 * - FAO / Google (fallback)
 */
export async function fetchCommodityPrice(commodity: string): Promise<number | null> {
  try {
    const normalized = commodity.toLowerCase();

    // 1️⃣ TradingEconomics
    try {
      const teUrl = `https://tradingeconomics.com/commodity/${encodeURIComponent(normalized)}`;
      const {data: teHtml} = await axios.get(teUrl, {
        headers: {"User-Agent": "Mozilla/5.0"},
      });

      const $te = cheerio.load(teHtml);
      const tePrice = $te("table.datatable tr td").first().text().trim();
      if (tePrice && !isNaN(parseFloat(tePrice))) {
        return parseFloat(tePrice);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.warn(`TradingEconomics fetch failed for ${commodity}:`, err.message);
      } else {
        console.warn(`TradingEconomics fetch failed for ${commodity}:`, err);
      }
    }

    // 2️⃣ IndexMundi
    try {
      const imUrl = `https://www.indexmundi.com/commodities/?commodity=${encodeURIComponent(normalized)}&months=1`;
      const {data: imHtml} = await axios.get(imUrl, {
        headers: {"User-Agent": "Mozilla/5.0"},
      });

      const $im = cheerio.load(imHtml);
      const imPrice = $im("table.commodityPrices tbody tr td").eq(1).text().trim();
      if (imPrice && !isNaN(parseFloat(imPrice))) {
        return parseFloat(imPrice.replace(/,/g, ""));
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.warn(`IndexMundi fetch failed for ${commodity}:`, err.message);
      } else {
        console.warn(`IndexMundi fetch failed for ${commodity}:`, err);
      }
    }

    // 3️⃣ Google fallback
    try {
      const gUrl = `https://www.google.com/search?q=${encodeURIComponent(commodity + " price today")}`;
      const {data: gHtml} = await axios.get(gUrl, {
        headers: {"User-Agent": "Mozilla/5.0"},
      });

      const $g = cheerio.load(gHtml);
      const gText = $g("body").text();
      const gMatch = gText.match(/(\d{2,5}(\.\d+)?)/);
      if (gMatch) {
        return parseFloat(gMatch[0]);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.warn(`Google fallback fetch failed for ${commodity}:`, err.message);
      } else {
        console.warn(`Google fallback fetch failed for ${commodity}:`, err);
      }
    }

    // ❌ Nothing succeeded
    return null;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("IntelligentFetcher fatal error:", err.message);
    } else {
      console.error("IntelligentFetcher fatal error:", err);
    }
    return null;
  }
}
