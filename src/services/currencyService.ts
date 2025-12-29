/* eslint-disable require-jsdoc */

import {getUsdToKesRate} from "./fxService";

// src/services/currencyService.ts
export interface CurrencyRates {
  USD: number; // Always 1
  KES: number;
  UGX?: number;
  TZS?: number;
  EUR?: number;
}

export class CurrencyService {
  private static rates: CurrencyRates = {
    USD: 1,
    KES: 128.93, // Default fallback
    UGX: 3700,
    TZS: 2500,
    EUR: 0.92,
  };

  static async getRates(): Promise<CurrencyRates> {
    try {
      // Try to fetch live rates
      const kesRate = await getUsdToKesRate();
      return {
        USD: 1,
        KES: kesRate,
        UGX: kesRate * 28.7, // Approximation
        TZS: kesRate * 19.4, // Approximation
        EUR: 0.92, // Fallback
      };
    } catch (error) {
      console.warn("Using fallback currency rates:", error);
      return this.rates;
    }
  }

  static convert(
    amount: number,
    from: keyof CurrencyRates,
    to: keyof CurrencyRates,
    rates: CurrencyRates
  ): number {
    if (!amount || !rates[from] || !rates[to]) return amount;

    // Convert to USD first, then to target
    const amountInUsd = amount / rates[from];
    return amountInUsd * rates[to];
  }
}
