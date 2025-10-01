/* eslint-disable require-jsdoc */
import axios from "axios";

// Cache rate in memory for 1 hour
let cachedRate: number | null = null;
let lastFetched = 0;

export async function getUsdToKesRate(): Promise<number> {
  const now = Date.now();

  if (cachedRate !== null && now - lastFetched < 1000 * 60 * 60) {
    return cachedRate; // ✅ guaranteed number
  }

  try {
    const url = "https://api.exchangerate.host/latest?base=USD&symbols=KES";
    const {data} = await axios.get(url);

    if (!data || !data.rates?.KES) {
      throw new Error("KES rate not available");
    }

    cachedRate = data.rates.KES as number;
    lastFetched = now;

    return cachedRate;
  } catch (err) {
    console.error("FX fetch failed:", err);
    // fallback default (approximate)
    return cachedRate !== null ? cachedRate : 147;
  }
}
