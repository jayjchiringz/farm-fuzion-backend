/* eslint-disable max-len */
/* eslint-disable no-trailing-spaces */
/* eslint-disable require-jsdoc */
/* eslint-disable object-curly-spacing */
/* eslint-disable valid-jsdoc */
// FarmFuzion_Firebase_MVP_Starter\functions\src\services\farmIntelligence.ts
/**
 * PURE TYPESCRIPT - No dependencies
 * Lightweight analytics for farmer intelligence
 */

export interface FarmInsight {
  product: string;
  currentPrice: number;
  trend: "UP" | "DOWN" | "STABLE";
  confidence: number;
  recommendation: "BUY" | "SELL" | "HOLD" | "STORE";
  reason: string;
  predictedPrice30d: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  optimalActionDate?: Date;
}

export interface PricePrediction {
  date: Date;
  price: number;
  lowerBound: number;
  upperBound: number;
}

export class FarmIntelligenceEngine {
  /**
   * Generate insights from historical price data (Pure TypeScript)
   */
  generateInsights(
    product: string,
    historicalPrices: number[],
    currentPrice: number
  ): FarmInsight {
    if (historicalPrices.length < 5) {
      return this.getDefaultInsight(product, currentPrice);
    }

    // 1. Analyze trend
    const trend = this.analyzeTrend(historicalPrices);
    
    // 2. Calculate volatility
    const volatility = this.calculateVolatility(historicalPrices);
    
    // 3. Predict future price
    const predictedPrice = this.predictPrice(historicalPrices);
    
    // 4. Generate recommendation
    const priceChange = ((predictedPrice - currentPrice) / currentPrice) * 100;
    const { recommendation, reason } = this.getRecommendation(priceChange, trend);
    
    // 5. Calculate confidence
    const confidence = this.calculateConfidence(historicalPrices.length, volatility);
    
    // 6. Assess risk
    const riskLevel = this.assessRisk(volatility, trend);
    
    // 7. Optimal timing
    const optimalActionDate = this.calculateOptimalDate();

    return {
      product,
      currentPrice,
      trend,
      confidence,
      recommendation,
      reason,
      predictedPrice30d: predictedPrice,
      riskLevel,
      optimalActionDate,
    };
  }

  /**
   * Generate price predictions for next 30 days
   */
  generatePredictions(historicalPrices: number[]): PricePrediction[] {
    const predictions: PricePrediction[] = [];
    
    if (historicalPrices.length < 10) {
      // Not enough data, return flat predictions
      const lastPrice = historicalPrices[historicalPrices.length - 1] || 0;
      for (let i = 1; i <= 30; i++) {
        predictions.push({
          date: this.addDays(new Date(), i),
          price: lastPrice,
          lowerBound: lastPrice * 0.9,
          upperBound: lastPrice * 1.1,
        });
      }
      return predictions;
    }

    // Calculate moving average as baseline
    const sma = this.calculateSMA(historicalPrices, 7);
    const lastSMA = sma[sma.length - 1];
    const trend = this.analyzeTrend(historicalPrices);
    const volatility = this.calculateVolatility(historicalPrices);

    for (let i = 1; i <= 30; i++) {
      const date = this.addDays(new Date(), i);
      
      // Base prediction with trend
      let predictedPrice = lastSMA;
      
      // Apply trend direction
      if (trend === "UP") predictedPrice *= (1 + (i * 0.005)); // 0.5% daily increase
      if (trend === "DOWN") predictedPrice *= (1 - (i * 0.003)); // 0.3% daily decrease
      
      // Apply seasonality
      predictedPrice *= this.getDailySeasonality(date);
      
      // Add some noise based on historical volatility
      const noise = (Math.random() - 0.5) * volatility * predictedPrice;
      predictedPrice += noise;
      
      // Calculate confidence bounds
      const margin = predictedPrice * volatility * 1.5;
      
      predictions.push({
        date,
        price: this.round(predictedPrice, 2),
        lowerBound: this.round(predictedPrice - margin, 2),
        upperBound: this.round(predictedPrice + margin, 2),
      });
    }

    return predictions;
  }

  /**
   * Compare multiple products for farming decisions
   */
  compareProducts(products: Array<{name: string; currentPrice: number; historicalPrices: number[]}>) {
    return products.map((product) => {
      if (product.historicalPrices.length < 5) {
        return {
          product: product.name,
          score: 50,
          recommendation: "NEUTRAL",
          risk: "MEDIUM" as const,
          reason: "Insufficient data",
        };
      }

      const trend = this.analyzeTrend(product.historicalPrices);
      const volatility = this.calculateVolatility(product.historicalPrices);
      
      // Scoring algorithm
      let score = 50;
      
      // Positive trend adds points
      if (trend === "UP") score += 20;
      if (trend === "DOWN") score -= 15;
      
      // Low volatility adds points
      if (volatility < 0.1) score += 15;
      if (volatility > 0.3) score -= 20;
      
      // Recent price stability adds points
      const recentStability = this.checkRecentStability(product.historicalPrices);
      if (recentStability) score += 10;
      
      // Generate recommendation
      let recommendation = "NEUTRAL";
      if (score >= 70) recommendation = "GOOD";
      if (score >= 85) recommendation = "EXCELLENT";
      if (score <= 30) recommendation = "POOR";
      if (score <= 15) recommendation = "AVOID";
      
      // Risk level
      let risk: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
      if (volatility < 0.15 && trend !== "DOWN") risk = "LOW";
      if (volatility > 0.25 || trend === "DOWN") risk = "HIGH";
      
      return {
        product: product.name,
        score: Math.max(0, Math.min(100, score)),
        recommendation,
        risk,
        reason: this.generateComparisonReason(trend, volatility, recommendation),
      };
    }).sort((a, b) => b.score - a.score);
  }

  // ========== PRIVATE HELPER METHODS ==========

  private analyzeTrend(prices: number[]): "UP" | "DOWN" | "STABLE" {
    if (prices.length < 2) return "STABLE";
    
    const firstThird = prices.slice(0, Math.floor(prices.length / 3));
    const lastThird = prices.slice(-Math.floor(prices.length / 3));
    
    const avgFirst = this.average(firstThird);
    const avgLast = this.average(lastThird);
    
    const change = ((avgLast - avgFirst) / avgFirst) * 100;
    
    if (change > 10) return "UP";
    if (change < -10) return "DOWN";
    return "STABLE";
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(dailyReturn);
    }
    
    const avgReturn = this.average(returns);
    const squaredDiffs = returns.map((r) => Math.pow(r - avgReturn, 2));
    const variance = this.average(squaredDiffs);
    
    return Math.sqrt(variance);
  }

  private predictPrice(prices: number[]): number {
    if (prices.length < 5) return prices[prices.length - 1] || 0;
    
    // Simple linear regression
    const n = prices.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumXX += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict 30 days ahead
    const predicted = slope * (n + 30) + intercept;
    
    // Apply seasonality for future date
    const futureDate = this.addDays(new Date(), 30);
    return this.round(predicted * this.getDailySeasonality(futureDate), 2);
  }

  private getRecommendation(priceChange: number, trend: "UP" | "DOWN" | "STABLE") {
    if (priceChange > 20 && trend === "UP") {
      return {
        recommendation: "BUY" as const,
        reason: `Strong upward trend with expected ${priceChange.toFixed(1)}% increase`,
      };
    }
    
    if (priceChange > 10) {
      return {
        recommendation: "HOLD" as const,
        reason: `Expected price increase of ${priceChange.toFixed(1)}%`,
      };
    }
    
    if (priceChange < -15 && trend === "DOWN") {
      return {
        recommendation: "SELL" as const,
        reason: `Price declining with expected ${Math.abs(priceChange).toFixed(1)}% drop`,
      };
    }
    
    return {
      recommendation: "STORE" as const,
      reason: "Market conditions stable. Consider storage for better timing.",
    };
  }

  private calculateConfidence(dataPoints: number, volatility: number): number {
    // More data points = higher confidence
    let confidence = Math.min(100, dataPoints * 2);
    
    // Lower volatility = higher confidence
    confidence -= volatility * 50;
    
    return Math.max(0, Math.min(100, this.round(confidence, 0)));
  }

  private assessRisk(volatility: number, trend: "UP" | "DOWN" | "STABLE"): "LOW" | "MEDIUM" | "HIGH" {
    if (volatility < 0.1 && trend !== "DOWN") return "LOW";
    if (volatility > 0.25 || trend === "DOWN") return "HIGH";
    return "MEDIUM";
  }

  private calculateOptimalDate(): Date {
    const now = new Date();
    // Default: 2 weeks from now
    return this.addDays(now, 14);
  }

  private calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  private getDailySeasonality(date: Date): number {
    const month = date.getMonth();
    const dayOfWeek = date.getDay();
    
    // Kenyan market patterns
    const monthFactors = [
      1.05, 1.08, 1.12, 1.10, 1.06, 0.95,
      0.88, 0.85, 0.90, 0.95, 1.02, 1.08,
    ];
    
    const dayFactors = [0.95, 1.02, 1.05, 1.03, 1.01, 1.00, 0.98];
    
    return monthFactors[month] * dayFactors[dayOfWeek];
  }

  private checkRecentStability(prices: number[]): boolean {
    if (prices.length < 5) return false;
    
    const recentPrices = prices.slice(-5);
    const avg = this.average(recentPrices);
    const maxDeviation = Math.max(...recentPrices.map((p) => Math.abs(p - avg) / avg));
    
    return maxDeviation < 0.05; // Less than 5% deviation
  }

  private generateComparisonReason(
    trend: "UP" | "DOWN" | "STABLE",
    volatility: number,
    recommendation: string
  ): string {
    const reasons: string[] = [];
    
    if (trend === "UP") reasons.push("upward trend");
    if (trend === "DOWN") reasons.push("downward trend");
    if (volatility < 0.1) reasons.push("low volatility");
    if (volatility > 0.25) reasons.push("high volatility");
    
    return `${recommendation} choice due to ${reasons.join(" and ")}`;
  }

  private getDefaultInsight(product: string, currentPrice: number): FarmInsight {
    return {
      product,
      currentPrice,
      trend: "STABLE",
      confidence: 30,
      recommendation: "HOLD",
      reason: "Insufficient historical data for accurate analysis",
      predictedPrice30d: currentPrice,
      riskLevel: "MEDIUM",
    };
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private round(num: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
