/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-jsdoc */
import axios from "axios";

// Cache rate in memory for 1 hour
let cachedRate: number | null = null;
let lastFetched = 0;

// Default fallback rate (updated December 2024)
const DEFAULT_KES_RATE = 147;

export async function getUsdToKesRate(): Promise<number> {
  const now = Date.now();
  const ONE_HOUR = 1000 * 60 * 60;

  // Return cached rate if valid and not expired
  if (cachedRate !== null && now - lastFetched < ONE_HOUR) {
    console.log(`✅ Using cached FX rate: 1 USD = ${cachedRate} KES`);
    return cachedRate;
  }

  try {
    console.log("🔄 Fetching fresh FX rate...");

    // Try multiple reliable APIs with fallback
    const apiAttempts = [
      {
        name: "exchangerate.host",
        url: "https://api.exchangerate.host/latest?base=USD&symbols=KES",
        parser: (data: any) => data?.rates?.KES,
      },
      {
        name: "frankfurter.app",
        url: "https://api.frankfurter.app/latest?from=USD",
        parser: (data: any) => data?.rates?.KES,
      },
      {
        name: "open.er-api",
        url: "https://open.er-api.com/v6/latest/USD",
        parser: (data: any) => data?.rates?.KES,
      },
    ];

    let fetchedRate: number | null = null;

    // Try each API in sequence
    for (const api of apiAttempts) {
      try {
        console.log(`  Trying ${api.name}...`);
        const response = await axios.get(api.url, {
          timeout: 3000,
          headers: {
            "User-Agent": "FarmFuzion/1.0 (https://farmfuzion.com)",
          },
        });

        const rate = api.parser(response.data);

        if (rate && typeof rate === "number" && rate > 50 && rate < 500) {
          // Sanity check: rate should be reasonable
          fetchedRate = rate;
          console.log(`✅ ${api.name} returned: 1 USD = ${rate} KES`);
          break;
        } else {
          console.warn(`⚠️ ${api.name} returned invalid rate: ${rate}`);
        }
      } catch (apiError) {
        console.warn(`  ${api.name} failed:`, (apiError as Error).message);
        continue;
      }
    }

    // If we got a rate, cache and return it
    if (fetchedRate !== null) {
      cachedRate = fetchedRate;
      lastFetched = now;
      return cachedRate;
    }

    // All APIs failed
    console.warn("❌ All FX APIs failed, using default rate");

    // Use cached rate if available (even if expired)
    if (cachedRate !== null) {
      console.log(`⚠️ Using expired cached rate: 1 USD = ${cachedRate} KES`);
      lastFetched = now; // Refresh cache timestamp to avoid repeated failures
      return cachedRate;
    }

    // No cache, use hardcoded default
    console.log(`⚠️ Using hardcoded default: 1 USD = ${DEFAULT_KES_RATE} KES`);
    cachedRate = DEFAULT_KES_RATE;
    lastFetched = now;
    return cachedRate;
  } catch (error) {
    // This should only happen for unexpected errors
    console.error("💥 Unexpected FX error:", error);

    // Ultimate fallbacks in order of preference:
    if (cachedRate !== null) {
      return cachedRate; // Expired cache better than nothing
    }

    return DEFAULT_KES_RATE; // Final fallback
  }
}

// Helper to manually update the rate (for admin use)
export function setManualUsdToKesRate(rate: number): void {
  if (rate > 50 && rate < 500) { // Sanity check
    cachedRate = rate;
    lastFetched = Date.now();
    console.log(`📝 Manually set FX rate: 1 USD = ${rate} KES`);
  } else {
    console.error("Invalid manual rate:", rate);
  }
}
