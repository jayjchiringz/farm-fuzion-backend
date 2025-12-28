/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {Pool} from "pg";
import {getUsdToKesRate} from "./fxService";

/**
 * Represents historical price pattern data for a product.
 */
interface HistoricalPattern {
  product_name: string;
  month: number;
  seasonal_avg: number;
  price_25p: number;
  price_75p: number;
  trend_direction: number;
}

export interface IntelligentPriceRecommendation {
  product: string;
  region: string;
  currentPrices: {
    wholesale: number;
    retail: number;
    broker: number;
    farmgate: number;
  };
  recommendedAction: "BUY" | "SELL" | "HOLD" | "STORE";
  confidenceScore: number; // 0-100
  priceProjection30d: {
    min: number;
    max: number;
    expected: number;
  };
  optimalTiming: {
    bestBuyDate: Date;
    bestSellDate: Date;
    reason: string;
  };
  riskFactors: Array<{
    factor: string;
    impact: "HIGH" | "MEDIUM" | "LOW";
    description: string;
  }>;
  alternativeProducts: Array<{
    product: string;
    profitMargin: number;
    reason: string;
  }>;
}

export interface FarmerContext {
  location: string;
  farmSize: number; // hectares
  currentInventory: Array<{
    product: string;
    quantity: number;
    unit: string;
    harvestDate: Date;
  }>;
  storageCapacity: number; // days
  capitalAvailable: number; // KES
}

// eslint-disable-next-line require-jsdoc
export class IntelligentMarketEngine {
  /**
   * Creates an instance of IntelligentMarketEngine.
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(private pool: Pool) {}

  /**
   * Gets intelligent price recommendations for a farmer based on context.
   * @param {FarmerContext} farmerContext - Farmer's location, inventory,
   * and capabilities
   * @return {Promise<IntelligentPriceRecommendation[]>} Price recommendations
   */
  async getIntelligentRecommendations(
    farmerContext: FarmerContext
  ): Promise<IntelligentPriceRecommendation[]> {
    // 1. Analyze historical patterns
    const historicalPatterns =
      await this.analyzeHistoricalPatterns(farmerContext.location);

    // 2. Calculate seasonality adjustments
    const seasonality = this.calculateSeasonalityAdjustments();

    // 3. Generate personalized recommendations
    return this.generateRecommendations(
      farmerContext,
      historicalPatterns,
      seasonality,
    );
  }

  /**
   * Analyzes historical price patterns for a region.
   * @param {string} region - The region to analyze
   * @return {Promise<HistoricalPattern[]>} Historical patterns data
   */
  private async analyzeHistoricalPatterns(
    region: string
  ): Promise<HistoricalPattern[]> {
    const query = `
      WITH monthly_avg AS (
        SELECT 
          product_name,
          EXTRACT(YEAR FROM collected_at) as year,
          EXTRACT(MONTH FROM collected_at) as month,
          AVG(wholesale_price) as avg_price,
          STDDEV(wholesale_price) as price_volatility
        FROM market_prices_mv
        WHERE region ILIKE $1
          AND collected_at >= NOW() - INTERVAL '5 years'
        GROUP BY product_name, year, month
      ),
      seasonal_patterns AS (
        SELECT 
          product_name,
          month,
          AVG(avg_price) as seasonal_avg,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_price) as price_25p,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_price) as price_75p
        FROM monthly_avg
        GROUP BY product_name, month
      ),
      trend_analysis AS (
        SELECT 
          product_name,
          CORR(
            EXTRACT(EPOCH FROM collected_at),
            wholesale_price
          ) as price_trend
        FROM market_prices_mv
        WHERE region ILIKE $1
        GROUP BY product_name
      )
      SELECT 
        sp.product_name,
        sp.month,
        sp.seasonal_avg,
        sp.price_25p,
        sp.price_75p,
        COALESCE(ta.price_trend, 0) as trend_direction
      FROM seasonal_patterns sp
      LEFT JOIN trend_analysis ta ON sp.product_name = ta.product_name
      WHERE sp.month = EXTRACT(MONTH FROM NOW())
    `;

    const result = await this.pool.query(query, [`%${region}%`]);
    return result.rows;
  }

  // FIXED: Complete seasonality adjustments
  private calculateSeasonalityAdjustments() {
    const currentMonth = new Date().getMonth() + 1;
    // Agricultural calendar for Kenya - COMPLETE VERSION
    const seasonalityMap: Record<number, Record<string, number>> = {
      1: {"Maize": 1.15, "Beans": 1.10, "Tomatoes": 0.85, "Wheat": 1.05, "Rice": 1.02, "Coffee": 1.08, "Tea": 1.06},
      2: {"Maize": 1.20, "Beans": 1.15, "Tomatoes": 0.80, "Wheat": 1.08, "Rice": 1.05, "Coffee": 1.10, "Tea": 1.08},
      3: {"Maize": 1.18, "Beans": 1.12, "Tomatoes": 0.90, "Wheat": 1.10, "Rice": 1.08, "Coffee": 1.12, "Tea": 1.10},
      4: {"Maize": 1.12, "Beans": 1.08, "Tomatoes": 1.05, "Wheat": 1.05, "Rice": 1.03, "Coffee": 1.08, "Tea": 1.06},
      5: {"Maize": 1.08, "Beans": 1.05, "Tomatoes": 1.10, "Wheat": 1.02, "Rice": 1.00, "Coffee": 1.05, "Tea": 1.03},
      6: {"Maize": 1.02, "Beans": 1.00, "Tomatoes": 1.15, "Wheat": 0.98, "Rice": 0.97, "Coffee": 1.00, "Tea": 0.98},
      7: {"Maize": 0.95, "Beans": 0.95, "Tomatoes": 1.20, "Wheat": 0.95, "Rice": 0.95, "Coffee": 0.95, "Tea": 0.93},
      8: {"Maize": 0.90, "Beans": 0.90, "Tomatoes": 1.15, "Wheat": 0.92, "Rice": 0.93, "Coffee": 0.90, "Tea": 0.88},
      9: {"Maize": 0.95, "Beans": 0.95, "Tomatoes": 1.10, "Wheat": 0.95, "Rice": 0.96, "Coffee": 0.95, "Tea": 0.93},
      10: {"Maize": 1.00, "Beans": 1.00, "Tomatoes": 1.05, "Wheat": 0.98, "Rice": 0.98, "Coffee": 1.00, "Tea": 0.98},
      11: {"Maize": 1.05, "Beans": 1.05, "Tomatoes": 1.00, "Wheat": 1.02, "Rice": 1.01, "Coffee": 1.05, "Tea": 1.03},
      12: {"Maize": 1.10, "Beans": 1.08, "Tomatoes": 0.95, "Wheat": 1.05, "Rice": 1.03, "Coffee": 1.08, "Tea": 1.06},
    };

    return seasonalityMap[currentMonth] || {};
  }

  // FIXED: Generate recommendations with all methods
  private async generateRecommendations(
    farmerContext: FarmerContext,
    patterns: HistoricalPattern[],
    seasonality: Record<string, number>
  ): Promise<IntelligentPriceRecommendation[]> {
    const recommendations: IntelligentPriceRecommendation[] = [];
    const fxRate = await getUsdToKesRate();

    for (const inventoryItem of farmerContext.currentInventory) {
      const pattern = patterns.find(
        (p) =>
          p.product_name.toLowerCase() ===
          inventoryItem.product.toLowerCase()
      );

      if (!pattern) continue;

      // Calculate expected price with seasonality
      const seasonalityMultiplier = seasonality[inventoryItem.product] || 1;
      const expectedPrice = pattern.seasonal_avg * seasonalityMultiplier * fxRate;

      // Calculate price bands
      const priceLowerBand = pattern.price_25p * 0.9 * fxRate;
      const priceUpperBand = pattern.price_75p * 1.1 * fxRate;

      // Determine action based on current price vs expected
      const currentPrice = await this.getCurrentPrice(inventoryItem.product);
      const priceDifference =
      ((expectedPrice - currentPrice) / currentPrice) * 100;

      let action: "BUY" | "SELL" | "HOLD" | "STORE";
      let confidence = 0;

      if (priceDifference > 20) {
        action = "SELL";
        confidence = 85;
      } else if (priceDifference > 10) {
        action = "HOLD";
        confidence = 70;
      } else if (priceDifference < -15) {
        action = "BUY";
        confidence = 80;
      } else {
        action = "STORE";
        confidence = 60;
      }

      // Calculate optimal timing based on historical patterns
      const bestMonth = await this.findOptimalMonth(inventoryItem.product);
      const currentDate = new Date();
      const bestSellDate =
      new Date(currentDate.getFullYear(), bestMonth - 1, 15);

      recommendations.push({
        product: inventoryItem.product,
        region: farmerContext.location,
        currentPrices: {
          wholesale: currentPrice,
          retail: currentPrice * 1.15,
          broker: currentPrice * 0.95,
          farmgate: currentPrice * 0.75,
        },
        recommendedAction: action,
        confidenceScore: confidence,
        priceProjection30d: {
          min: priceLowerBand,
          max: priceUpperBand,
          expected: expectedPrice,
        },
        optimalTiming: {
          bestBuyDate: new Date(), // Immediate for BUY, otherwise calculate
          bestSellDate: bestSellDate,
          reason: `Historically, ${inventoryItem.product} prices peak in ${this.getMonthName(bestMonth)}`,
        },
        riskFactors: this.assessRiskFactors(inventoryItem.product, pattern),
        alternativeProducts: await this.findAlternativeProducts(inventoryItem.product, farmerContext),
      });
    }

    return recommendations;
  }

  // FIXED: Added missing findOptimalMonth method
  private async findOptimalMonth(product: string): Promise<number> {
    const query = `
      SELECT 
        EXTRACT(MONTH FROM collected_at) as month,
        AVG(wholesale_price) as avg_price
      FROM market_prices_mv
      WHERE product_name ILIKE $1
      GROUP BY month
      ORDER BY avg_price DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [`%${product}%`]);
    return result.rows[0]?.month || new Date().getMonth() + 1;
  }

  // FIXED: Single assessRiskFactors method (removed duplicate)
  private assessRiskFactors(product: string, pattern: HistoricalPattern) {
    const factors: Array<{
      factor: string;
      impact: "HIGH" | "MEDIUM" | "LOW";
      description: string;
    }> = [];

    const volatility = pattern.price_75p - pattern.price_25p;

    if (volatility > pattern.seasonal_avg * 0.3) {
      factors.push({
        factor: "High Price Volatility",
        impact: "HIGH",
        description: `Prices vary significantly (${(volatility/pattern.seasonal_avg*100).toFixed(1)}%)`,
      });
    }

    if (pattern.trend_direction < -0.5) {
      factors.push({
        factor: "Downward Price Trend",
        impact: "HIGH",
        description: "Consistent price decline detected",
      });
    }

    // Add seasonality risk if applicable
    const currentMonth = new Date().getMonth() + 1;
    if ([6, 7, 8].includes(currentMonth)) { // Jun-Aug = harvest season for many crops
      factors.push({
        factor: "Harvest Season Pressure",
        impact: "MEDIUM",
        description: "Increased supply typically lowers prices this season",
      });
    }

    return factors;
  }

  // FIXED: Typing and implementation
  private async findAlternativeProducts(
    currentProduct: string,
    farmerContext: FarmerContext
  ): Promise<Array<{product: string; profitMargin: number; reason: string}>> {
    try {
      const query = `
        SELECT 
          product_name,
          AVG(wholesale_price) as avg_price,
          STDDEV(wholesale_price) as volatility
        FROM market_prices_mv
        WHERE category = (
          SELECT category FROM market_prices_mv 
          WHERE product_name ILIKE $1 LIMIT 1
        )
        AND product_name != $1
        GROUP BY product_name
        ORDER BY (AVG(wholesale_price) / NULLIF(STDDEV(wholesale_price), 0)) DESC
        LIMIT 3
      `;

      const result = await this.pool.query(query, [`%${currentProduct}%`]);

      // If no alternatives found, return empty array
      if (!result.rows.length) {
        return [];
      }

      return result.rows.map((row: any) => ({
        product: row.product_name,
        profitMargin: this.calculateProfitMargin(row),
        reason: `Lower volatility (${((row.volatility/row.avg_price)*100).toFixed(1)}%) than ${currentProduct}`,
      }));
    } catch (error) {
      console.error("Error finding alternative products:", error);
      return [];
    }
  }

  // FIXED: Typing for profit margin calculation
  private calculateProfitMargin(row: { avg_price: number }): number {
    // Simplified profit margin calculation (30% of avg price)
    return row.avg_price * 0.3;
  }

  // FIXED: Month name function
  private getMonthName(month: number): string {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return months[month - 1] || "Unknown";
  }

  // FIXED: Get current price from database
  private async getCurrentPrice(product: string): Promise<number> {
    try {
      const query = `
        SELECT wholesale_price
        FROM market_prices_mv
        WHERE product_name ILIKE $1
        ORDER BY collected_at DESC
        LIMIT 1
      `;

      const result = await this.pool.query(query, [`%${product}%`]);
      return result.rows[0]?.wholesale_price || 0;
    } catch (error) {
      console.error(`Error getting current price for ${product}:`, error);
      return 0;
    }
  }
}
