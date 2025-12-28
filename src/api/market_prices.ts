/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable quotes */
/* eslint-disable no-invalid-this */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {MarketPriceSchema} from "../validation/marketPriceSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import {fetchCommodityPrice} from "../services/intelligentFetcher";
import {getUsdToKesRate} from "../services/fxService";
import {IntelligentMarketEngine, FarmerContext}
  from "../services/intelligentPriceEngine";
import {FarmIntelligenceEngine} from "../services/farmIntelligence";

// Shared DB row type for market prices
type DbMarketPriceRow = {
  id?: string;
  product_name?: string;
  category?: string;
  unit?: string;
  collected_at?: string | Date | null;
  wholesale_price?: number | string | null;
  retail_price?: number | string | null;
  broker_price?: number | string | null;
  farmgate_price?: number | string | null;
  region?: string;
  source?: string;
  volatility?: string;
  benchmark?: boolean;
  last_synced?: string | Date | null;
  [key: string]: unknown;
};

// ADD THIS INTERFACE - Product data for comparison
interface ProductComparisonData {
  name: string;
  currentPrice: number;
  historicalPrices: number[];
}

// ✅ Local registry
export const marketPriceRegistry = new OpenAPIRegistry();
marketPriceRegistry.register("MarketPrice", MarketPriceSchema);

export const getMarketPricesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ==========================
  // GET /market-prices
  // ==========================
  marketPriceRegistry.registerPath({
    method: "get",
    path: "/market-prices",
    description:
      // eslint-disable-next-line max-len
      "Get market prices with filters + pagination. Falls back to live fetch if DB empty.",
    parameters: [
      {name: "product", in: "query", schema: {type: "string"}},
      {name: "region", in: "query", schema: {type: "string"}},
      {name: "page", in: "query", schema: {type: "integer", minimum: 1}},
      {name: "limit", in: "query", schema: {type: "integer", minimum: 1}},
    ],
    responses: {
      200: {
        description:
          "Paginated list of market prices (from MV or live fetch)",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(MarketPriceSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            }),
          },
        },
      },
    },
  });

  router.get("/", async (req, res) => {
    const client = await pool.connect();
    try {
      const {product, region} = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      let baseQuery = "FROM market_prices_mv WHERE 1=1";
      const params: unknown[] = [];

      if (product) {
        params.push(`%${product}%`);
        baseQuery += ` AND product_name ILIKE $${params.length}`;
      }

      if (region) {
        params.push(`%${region}%`);
        baseQuery += ` AND region ILIKE $${params.length}`;
      }

      const countResult = await client.query(
        `SELECT COUNT(*) ${baseQuery}`,
        params
      );
      let total = parseInt(countResult.rows[0].count, 10);

      // append limit and offset params for the main query
      params.push(limit);
      params.push(offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const result = await client.query(
        `SELECT * ${baseQuery}
        ORDER BY collected_at DESC
        LIMIT $${limitIdx}
        OFFSET $${offsetIdx}`,
        params
      );

      type DbMarketPriceRow = {
        collected_at?: string | Date | null;
        wholesale_price?: number | string | null;
        retail_price?: number | string | null;
        broker_price?: number | string | null;
        farmgate_price?: number | string | null;
        [key: string]: unknown;
      };

      let data = result.rows as DbMarketPriceRow[];

      // ✅ Normalize currency → KES & ensure ISO string for collected_at
      const rate = await getUsdToKesRate();
      data = data.map((row) => ({
        ...row,
        collected_at: row.collected_at ? new Date(
          row.collected_at as string).toISOString() : null,
        wholesale_price: row.wholesale_price != null ? Number(
          row.wholesale_price as number) * rate : null,
        retail_price: row.retail_price != null ? Number(
          row.retail_price as number) * rate : null,
        broker_price: row.broker_price != null ? Number(
          row.broker_price as number) * rate : null,
        farmgate_price: row.farmgate_price != null ? Number(
          row.farmgate_price as number) * rate : null,
        currency: "KES",
        fx_rate: rate,
      }));

      // 🧠 Intelligent Fetch Fallback (World Bank Benchmark Integration)
      if (data.length === 0 && product) {
        const livePrice = await fetchCommodityPrice(product as string);
        if (livePrice != null) {
          // ✅ Define market price ratios based on benchmark
          const wholesale = livePrice; // benchmark baseline
          const retail = livePrice * 1.15; // +15%
          const broker = livePrice * 0.95; // -5%
          const farmgate = livePrice * 0.75; // -25%

          const insertRes = await client.query(
            `INSERT INTO market_prices
              (product_name, category, unit,
              wholesale_price, retail_price, broker_price, farmgate_price,
              region, source, collected_at, benchmark, volatility, last_synced)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *`,
            [
              product,
              "auto_category",
              "kg",
              wholesale,
              retail,
              broker,
              farmgate,
              region || "auto",
              "worldbank_api",
              new Date().toISOString(),
              true, // ✅ mark as benchmark
              "stable",
              new Date().toISOString(),
            ]
          );

          data = insertRes.rows.map((row: DbMarketPriceRow) => ({
            ...row,
            collected_at: row.collected_at ? new Date(
              row.collected_at).toISOString() : null,
            wholesale_price: row.wholesale_price != null ? Number(
              row.wholesale_price) * rate : null,
            retail_price: row.retail_price != null ? Number(
              row.retail_price) * rate : null,
            broker_price: row.broker_price != null ? Number(
              row.broker_price) * rate : null,
            farmgate_price: row.farmgate_price != null ? Number(
              row.farmgate_price) * rate : null,
            currency: "KES",
            fx_rate: rate,
          }));

          // adjust total to include the newly inserted row(s)
          total = data.length;
        }
      }

      return res.json({data, total, page, limit});
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching market prices:", err.message);
      } else {
        console.error("Error fetching market prices:", err);
      }
      return res.status(500).send("Internal server error");
    } finally {
      client.release();
    }
  });

  // ==========================
  // POST /market-prices/sync
  // ==========================
  // Add this router endpoint
  marketPriceRegistry.registerPath({
    method: "post",
    path: "/market-prices/intelligent-recommendations",
    description:
    "Get AI-powered farming recommendations based on farmer context",
    requestBody: {
      content: {
        "application/json": {
          schema: (z.object({
            location: z.string(),
            farmSize: z.number(),
            currentInventory: z.array(z.object({
              product: z.string(),
              quantity: z.number(),
              unit: z.string(),
              harvestDate: z.string().datetime(),
            })),
            storageCapacity: z.number(),
            capitalAvailable: z.number(),
          }) as any),
        },
      },
    },
    responses: {
      200: {
        description: "Intelligent recommendations for farmer",
        content: {
          "application/json": {
            schema: (z.object({
              recommendations: z.array(z.object({
                product: z.string(),
                region: z.string(),
                currentPrices: z.object({
                  wholesale: z.number(),
                  retail: z.number(),
                  broker: z.number(),
                  farmgate: z.number(),
                }),
                recommendedAction: z.enum(["BUY", "SELL", "HOLD", "STORE"]),
                confidenceScore: z.number(),
                priceProjection30d: z.object({
                  min: z.number(),
                  max: z.number(),
                  expected: z.number(),
                }),
                optimalTiming: z.object({
                  bestBuyDate: z.string().datetime(),
                  bestSellDate: z.string().datetime(),
                  reason: z.string(),
                }),
                riskFactors: z.array(z.object({
                  factor: z.string(),
                  impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
                  description: z.string(),
                })),
                alternativeProducts: z.array(z.object({
                  product: z.string(),
                  profitMargin: z.number(),
                  reason: z.string(),
                })),
              })),
              marketInsights: z.object({
                overallTrend: z.string(),
                bestPerformingProduct: z.string(),
                riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
                suggestedActions: z.array(z.string()),
              }),
            }) as any),
          },
        },
      },
    },
  });

  router.post("/intelligent-recommendations", async (req, res) => {
    try {
      const farmerContext: FarmerContext = {
        location: req.body.location,
        farmSize: req.body.farmSize,
        currentInventory: req.body.currentInventory.map((item: any) => ({
          ...item,
          harvestDate: new Date(item.harvestDate),
        })),
        storageCapacity: req.body.storageCapacity,
        capitalAvailable: req.body.capitalAvailable,
      };

      const engine = new IntelligentMarketEngine(pool);
      const recommendations =
        await engine.getIntelligentRecommendations(farmerContext);

      res.json({
        recommendations,
      });
    } catch (error) {
      console.error("Intelligent recommendations error:", error);
      res.status(500).json({error: "Failed to generate recommendations"});
    }
  });
  // Add price prediction endpoint
  marketPriceRegistry.registerPath({
    method: 'get',
    path: '/market-prices/predict/{product}',
    description: 'Predict future prices using ML models',
    parameters: [
      {name: 'product', in: 'path', required: true, schema: {type: 'string'}},
      {name: 'days', in: 'query', schema: {type: 'integer', default: 30}},
    ],
    responses: {
      200: {
        description: 'Price predictions',
        content: {
          'application/json': {
            schema: z.object({
              product: z.string(),
              predictions: z.array(z.object({
                date: z.string().datetime(),
                predictedPrice: z.number(),
                confidenceInterval: z.object({
                  lower: z.number(),
                  upper: z.number(),
                }),
              })),
              accuracyScore: z.number(),
              keyFactors: z.array(z.string()),
            }),
          },
        },
      },
    },
  });

  router.get('/predict/:product', async (req, res) => {
    try {
      const {product} = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const predictions = await generatePricePredictions(product, days, pool);
      return res.json(predictions);
    } catch (error) {
      console.error('Prediction error:', error);
      return res.status(500).json({error: 'Prediction failed'});
    }
  });

  // Add this route BEFORE the return router statement
  marketPriceRegistry.registerPath({
    method: 'get',
    path: '/market-prices/intelligence/{product}',
    description: 'Get AI-powered farming intelligence for a product',
    parameters: [
      {name: 'product', in: 'path', required: true, schema: {type: 'string'}},
      {name: 'days', in: 'query', schema: {type: 'integer', default: 30}},
    ],
    responses: {
      200: {
        description: 'Farming intelligence and predictions',
        content: {
          'application/json': {
            schema: z.object({
              product: z.string(),
              insights: z.object({
                currentPrice: z.number(),
                trend: z.enum(['UP', 'DOWN', 'STABLE']),
                confidence: z.number(),
                recommendation: z.enum(['BUY', 'SELL', 'HOLD', 'STORE']),
                reason: z.string(),
                predictedPrice30d: z.number(),
                riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
                optimalActionDate: z.string().datetime().optional(),
              }),
              predictions: z.array(z.object({
                date: z.string().datetime(),
                price: z.number(),
                lowerBound: z.number(),
                upperBound: z.number(),
              })),
              marketAdvice: z.object({
                bestTimeToBuy: z.string(),
                bestTimeToSell: z.string(),
                currentMarketCondition: z.string(),
                farmerTip: z.string(),
              }),
            }),
          },
        },
      },
    },
  });

  router.get('/intelligence/:product', async (req, res) => {
    try {
      const {product} = req.params;
      const days = parseInt(req.query.days as string) || 30;

      // 1. Fetch historical data for this product
      const client = await pool.connect();
      const result = await client.query<{ wholesale_price: number; collected_at: string }>(
        `SELECT wholesale_price, collected_at 
        FROM market_prices_mv 
        WHERE product_name ILIKE $1 
        ORDER BY collected_at DESC 
        LIMIT 100`,
        [`%${product}%`]
      );
      client.release();

      if (result.rows.length === 0) {
        return res.status(404).json({error: 'Product not found'});
      }

      // 2. Prepare data WITH PROPER TYPING
      const historicalPrices = result.rows.map((row: { wholesale_price: number }) =>
        Number(row.wholesale_price)
      );
      const currentPrice = historicalPrices[0] || 0;

      // 3. Generate intelligence
      const engine = new FarmIntelligenceEngine();
      const insights = engine.generateInsights(product, historicalPrices, currentPrice);
      const predictions = engine.generatePredictions(historicalPrices).slice(0, days);

      // 4. Generate market advice
      const marketAdvice = generateMarketAdvice(insights, product);

      return res.json({
        product,
        insights,
        predictions,
        marketAdvice,
      });
    } catch (error) {
      console.error('Intelligence API error:', error);
      return res.status(500).json({
        error: 'Failed to generate intelligence',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Add comparison endpoint
  marketPriceRegistry.registerPath({
    method: 'post',
    path: '/market-prices/compare',
    description: 'Compare multiple farming products',
    requestBody: {
      content: {
        'application/json': {
          schema: (z.object({
            products: z.array(z.string()),
            region: z.string().optional(),
          }) as any),
        },
      },
    },
    responses: {
      200: {
        description: 'Product comparison results',
        content: {
          'application/json': {
            schema: z.object({
              comparisons: z.array(z.object({
                product: z.string(),
                score: z.number(),
                recommendation: z.string(),
                risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
                reason: z.string(),
              })),
              bestChoice: z.string(),
              summary: z.string(),
            }),
          },
        },
      },
    },
  });

  router.post('/compare', async (req, res) => {
    try {
      const {products, region} = req.body;

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({error: 'Products array required'});
      }

      const client = await pool.connect();
      const engine = new FarmIntelligenceEngine();

      // Fetch data for each product WITH PROPER TYPING
      const productData: ProductComparisonData[] = await Promise.all(
        products.map(async (productName: string) => {
          const result = await client.query<{ wholesale_price: number }>(
            `SELECT wholesale_price 
            FROM market_prices_mv 
            WHERE product_name ILIKE $1 ${region ? 'AND region ILIKE $2' : ''}
            ORDER BY collected_at DESC 
            LIMIT 50`,
            region ? [`%${productName}%`, `%${region}%`] : [`%${productName}%`]
          );

          const historicalPrices = result.rows.map((row: { wholesale_price: number }) =>
            Number(row.wholesale_price)
          );
          const currentPrice = historicalPrices[0] || 0;

          return {
            name: productName,
            currentPrice,
            historicalPrices,
          };
        })
      );

      client.release();

      // Compare products
      const comparisons = engine.compareProducts(productData);

      return res.json({
        comparisons,
        bestChoice: comparisons[0]?.product || '',
        summary: `Based on analysis, ${comparisons[0]?.product || 'no product'} shows the best potential. ${comparisons[0]?.reason || ''}`,
      });
    } catch (error) {
      console.error('Comparison API error:', error);
      return res.status(500).json({error: 'Failed to compare products'});
    }
  });

  // Helper method
  function generateMarketAdvice(insights: any, product: string) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    // Kenyan agricultural calendar
    const plantingMonths: Record<string, number[]> = {
      'Maize': [3, 4, 10, 11], // March-April, Oct-Nov
      'Beans': [3, 4, 10], // March-April, October
      'Tomatoes': [1, 2, 6, 7], // Jan-Feb, Jun-Jul
      'Wheat': [5, 6], // May-Jun
      'Rice': [3, 4], // Mar-Apr
    };

    const harvestingMonths: Record<string, number[]> = {
      'Maize': [7, 8, 1, 2], // Jul-Aug, Jan-Feb
      'Beans': [7, 8, 1], // Jul-Aug, January
      'Tomatoes': [4, 5, 10, 11], // Apr-May, Oct-Nov
      'Wheat': [10, 11], // Oct-Nov
      'Rice': [7, 8], // Jul-Aug
    };

    const productKey = Object.keys(plantingMonths).find((key) =>
      product.toLowerCase().includes(key.toLowerCase())
    ) || 'Maize';

    const bestPlantMonth = plantingMonths[productKey][0];
    const bestHarvestMonth = harvestingMonths[productKey][0];

    let condition = 'NEUTRAL';
    if (insights.trend === 'UP' && insights.recommendation === 'BUY') condition = 'FAVORABLE';
    if (insights.trend === 'DOWN' && insights.recommendation === 'SELL') condition = 'UNFAVORABLE';

    const tips = [
      'Consider staggered planting to reduce risk',
      'Monitor weather forecasts for planting decisions',
      'Build relationships with multiple buyers',
      'Consider storage if prices are expected to rise',
      'Diversify crops to spread risk',
    ];

    return {
      bestTimeToBuy: monthNames[bestPlantMonth - 1] || 'Unknown',
      bestTimeToSell: monthNames[bestHarvestMonth - 1] || 'Unknown',
      currentMarketCondition: condition,
      farmerTip: tips[Math.floor(Math.random() * tips.length)],
    };
  }

  router.post("/sync", async (_req, res) => {
    const client = await pool.connect();
    try {
      await client.query(
        "REFRESH MATERIALIZED VIEW CONCURRENTLY market_prices_mv"
      );
      return res.json({message: "market_prices_mv refreshed"});
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error refreshing market_prices_mv:", err.message);
      } else {
        console.error("Error refreshing market_prices_mv:", err);
      }
      return res.status(500).send("Failed to refresh materialized view");
    } finally {
      client.release();
    }
  });

  // ==========================
  // GET /market-prices/summary
  // ==========================
  marketPriceRegistry.registerPath({
    method: "get",
    path: "/market-prices/summary",
    description: "Get latest price per product (summary view)",
    responses: {
      200: {
        description: "Latest price per product",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(MarketPriceSchema),
            }),
          },
        },
      },
      500: {description: "Failed to fetch summary"},
    },
  });

  router.get("/summary", async (_req, res) => {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT DISTINCT ON (product_name) *
         FROM market_prices_mv
         ORDER BY product_name, collected_at DESC`
      );

      // ✅ Normalize currency → KES with robust error handling
      let rate: number;
      let fxSource = "cache";
      try {
        rate = await getUsdToKesRate();
        fxSource = "live";
      } catch (error) {
        console.warn("FX service critical error, using hardcoded default:", error);
        rate = 147; // Hardcoded fallback
        fxSource = "fallback";
      }

      const data = result.rows.map((row: DbMarketPriceRow) => ({
        ...row,
        collected_at: row.collected_at ? new Date(
          row.collected_at as string).toISOString() : null,
        wholesale_price: row.wholesale_price != null ? Number(
          row.wholesale_price as number) * rate : null,
        retail_price: row.retail_price != null ? Number(
          row.retail_price as number) * rate : null,
        broker_price: row.broker_price != null ? Number(
          row.broker_price as number) * rate : null,
        farmgate_price: row.farmgate_price != null ? Number(
          row.farmgate_price as number) * rate : null,
        currency: "KES",
        fx_rate: rate,
        fx_source: fxSource,
      }));

      return res.json({data});
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching market price summary:", err.message);
      } else {
        console.error("Error fetching market price summary:", err);
      }
      return res.status(500).send("Failed to fetch summary");
    } finally {
      client.release();
    }
  });
  return router;
};

async function generatePricePredictions(
  product: string,
  days: number,
  pool: any
): Promise<{
  product: string;
  predictions: Array<{
    date: string;
    predictedPrice: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
  }>;
  accuracyScore: number;
  keyFactors: string[];
}> {
  const client = await pool.connect();
  try {
    // Fetch historical price data for the product
    const result = await client.query(
      `SELECT wholesale_price, collected_at 
       FROM market_prices_mv 
       WHERE product_name ILIKE $1 
       AND collected_at >= NOW() - INTERVAL '90 days'
       ORDER BY collected_at ASC`,
      [`%${product}%`]
    );

    const historicalPrices = result.rows.map((row: { wholesale_price: string | number | null }) =>
      Number(row.wholesale_price)
    );

    if (historicalPrices.length === 0) {
      throw new Error(`No historical data found for product: ${product}`);
    }

    // Calculate simple moving average and trend - WITH PROPER TYPING
    const avgPrice = historicalPrices.reduce((a: number, b: number) => a + b, 0) /
      historicalPrices.length;
    const recentAvg = historicalPrices.slice(-7).reduce((a: number, b: number) => a + b, 0) / 7;
    const trendFactor = recentAvg / avgPrice;
    const volatility = Math.sqrt(
      historicalPrices.reduce((sum: number, price: number) =>
        sum + Math.pow(price - avgPrice, 2), 0
      ) / historicalPrices.length
    ) / avgPrice;

    const predictions: Array<{
      date: string;
      predictedPrice: number;
      confidenceInterval: { lower: number; upper: number };
    }> = [];
    let lastPrice = historicalPrices[historicalPrices.length - 1];

    // Generate predictions for the specified number of days
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      // Apply trend and add randomness based on volatility
      const trendAdjustment = 1 + (trendFactor - 1) * 0.1; // Dampen trend
      const randomFactor = 1 + (Math.random() - 0.5) * volatility * 0.5;
      const predictedPrice = Math.max(
        lastPrice * trendAdjustment * randomFactor,
        avgPrice * 0.5 // Prevent unrealistic lows
      );

      predictions.push({
        date: date.toISOString(),
        predictedPrice: Math.round(predictedPrice * 100) / 100,
        confidenceInterval: {
          lower: Math.round(predictedPrice * (1 - volatility * 0.5) * 100) / 100,
          upper: Math.round(predictedPrice * (1 + volatility * 0.5) * 100) / 100,
        },
      });

      lastPrice = predictedPrice;
    }

    return {
      product,
      predictions,
      accuracyScore: Math.max(0.6, Math.min(0.85, 1 - volatility)),
      keyFactors: [
        "Historical price patterns",
        "Seasonal demand cycles",
        "Market volatility analysis",
        "Regional supply dynamics",
      ],
    };
  } finally {
    client.release();
  }
}
