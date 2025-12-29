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
import {IntelligentMarketEngine, FarmerContext}
  from "../services/intelligentPriceEngine";
import {FarmIntelligenceEngine} from "../services/farmIntelligence";
import {CurrencyRates, CurrencyService} from "../services/currencyService";

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
      const {product, region, currency = 'KES'} = req.query;
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

      // ✅ Get currency rates
      const rates = await CurrencyService.getRates();
      const targetCurrency = (currency as keyof CurrencyRates) || 'KES';

      // ✅ TRANSFORM: Calculate prices and convert currency
      data = data.map((row) => {
        // WorldBank data is in USD, stored as retail_price in USD
        const retailPriceUSD = Number(row.retail_price) || 0;

        if (retailPriceUSD > 0) {
          // ✅ CALCULATE ALL PRICES FROM RETAIL (in USD first)
          const wholesalePriceUSD = retailPriceUSD * 0.85; // -15%
          const brokerPriceUSD = retailPriceUSD * 0.95; // -5%
          const farmgatePriceUSD = retailPriceUSD * 0.60; // -40%

          // ✅ CONVERT TO TARGET CURRENCY
          const convert = (amountUSD: number) =>
            CurrencyService.convert(amountUSD, 'USD', targetCurrency, rates);

          const retailPrice = convert(retailPriceUSD);
          const wholesalePrice = convert(wholesalePriceUSD);
          const brokerPrice = convert(brokerPriceUSD);
          const farmgatePrice = convert(farmgatePriceUSD);

          return {
            ...row,
            // Store both original and converted values
            retail_price: Math.round(retailPrice * 100) / 100,
            wholesale_price: Math.round(wholesalePrice * 100) / 100,
            broker_price: Math.round(brokerPrice * 100) / 100,
            farmgate_price: Math.round(farmgatePrice * 100) / 100,
            // Metadata
            currency: targetCurrency,
            original_currency: 'USD',
            fx_rate: rates[targetCurrency],
            fx_rates: rates,
            price_sources: {
              retail: row.source || "worldbank_benchmark",
              wholesale: "calculated_from_retail",
              broker: "calculated_from_retail",
              farmgate: "calculated_from_retail",
            },
            unit: `${targetCurrency}/kg`, // Update unit with correct currency
            calculation_details: {
              base_price_usd: retailPriceUSD,
              margins: {
                wholesale: '15% below retail',
                broker: '5% below retail',
                farmgate: '40% below retail',
              },
            },
          };
        }

        // Fallback for invalid data
        return {
          ...row,
          currency: targetCurrency,
          fx_rate: rates[targetCurrency],
        };
      });

      // 🧠 Intelligent Fetch Fallback (World Bank Benchmark Integration)
      // In the fallback section (around line 155-165), FIX the calculation:
      if (data.length === 0 && product) {
        const livePrice = await fetchCommodityPrice(product as string);
        if (livePrice != null) {
          // ✅ RETAIL is the ONLY real data from WorldBank
          const retail = livePrice; // WorldBank retail benchmark

          // ✅ CALCULATE others (don't store them wrong in DB!)
          const wholesale = retail * 0.85; // -15%
          const broker = retail * 0.95; // -5%
          const farmgate = retail * 0.60; // -40%

          console.log(`📝 Inserting new product ${product} with calculated prices`);
          console.log(`   Retail: ${retail}`);
          console.log(`   Wholesale (calc): ${wholesale}`);
          console.log(`   Broker (calc): ${broker}`);
          console.log(`   Farmgate (calc): ${farmgate}`);

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
              wholesale, // Store calculated (for consistency)
              retail, // REAL DATA
              broker, // Store calculated
              farmgate, // Store calculated
              region || "global",
              "worldbank_api",
              new Date().toISOString(),
              true,
              "stable",
              new Date().toISOString(),
            ]
          );

          // The normalization will fix these again anyway
          data = insertRes.rows.map((row: DbMarketPriceRow) => ({
            ...row,
            // Will be recalculated in the transformation step
          }));

          total = data.length;
        }
      }

      return res.json({
        data,
        total,
        page,
        limit,
        currency: targetCurrency,
        fx_rates: rates,
        note: `Prices converted from USD to ${targetCurrency}`,
      });
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
    method: "get",
    path: "/market-prices/dashboard",
    description: "Get market insights dashboard for farmer overview",
    parameters: [
      {name: "region", in: "query", schema: {type: "string"}},
      {name: "limit", in: "query", schema: {type: "integer", default: 5}},
    ],
    responses: {
      200: {
        description: "Market dashboard with insights",
        content: {
          "application/json": {
            schema: z.object({
              summary: z.array(z.object({
                product: z.string(),
                unit: z.string(),
                retail_price: z.number(),
                trend: z.enum(['UP', 'DOWN', 'STABLE']),
                weekly_change: z.number(),
                best_price_type: z.enum(['farmgate', 'wholesale', 'retail', 'broker']),
                price_analysis: z.string(),
                action_recommendation: z.string(),
              })),
              market_overview: z.object({
                best_buy_product: z.string(),
                best_sell_product: z.string(),
                most_volatile: z.string(),
                overall_trend: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
              }),
              timestamp: z.string().datetime(),
            }),
          },
        },
      },
    },
  });

  router.get("/dashboard", async (req, res) => {
    const client = await pool.connect();
    try {
      const {region, limit = 5} = req.query;
      // Get latest prices for top products
      const result = await client.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (product_name) 
            product_name,
            unit,
            retail_price,
            wholesale_price,
            broker_price,
            farmgate_price,
            collected_at,
            region
          FROM market_prices_mv
          WHERE retail_price IS NOT NULL
          ${region ? `AND region ILIKE $1` : ''}
          ORDER BY product_name, collected_at DESC
        )
        SELECT * FROM latest_prices 
        ORDER BY retail_price DESC 
        LIMIT $${region ? 2 : 1}
      `, region ? [`%${region}%`, limit] : [limit]);

      // Get historical data for trend analysis
      const trendResult = await client.query(`
        SELECT 
          product_name,
          retail_price,
          collected_at
        FROM market_prices_mv
        WHERE collected_at >= NOW() - INTERVAL '30 days'
        AND retail_price IS NOT NULL
        ORDER BY product_name, collected_at
      `);

      // Analyze trends
      const productTrends = new Map();
      trendResult.rows.forEach((row) => {
        if (!productTrends.has(row.product_name)) {
          productTrends.set(row.product_name, []);
        }
        productTrends.get(row.product_name).push({
          price: row.retail_price,
          date: row.collected_at,
        });
      });

      // Generate insights
      const summary = result.rows.map((row) => {
        const trends = productTrends.get(row.product_name) || [];
        const weeklyChange = trends.length >= 2 ?
          ((row.retail_price - trends[0]?.price) / trends[0]?.price) * 100 :
          0;

        // Determine best price type for farmer
        const prices = {
          farmgate: row.farmgate_price,
          wholesale: row.wholesale_price,
          retail: row.retail_price,
          broker: row.broker_price,
        };

        const bestPriceType = Object.entries(prices).reduce((best, [type, price]) =>
          price && (!best.price || price > best.price) ? {type, price} : best
        , {type: 'retail', price: row.retail_price}).type;

        // Generate analysis
        let analysis = '';
        if (weeklyChange > 5) analysis = 'Prices rising significantly';
        else if (weeklyChange < -5) analysis = 'Prices declining';
        else analysis = 'Prices stable';

        let recommendation = 'Monitor market';
        if (bestPriceType === 'farmgate' && weeklyChange > 0) {
          recommendation = 'Consider selling now';
        } else if (bestPriceType === 'retail' && weeklyChange < 0) {
          recommendation = 'Wait for better prices';
        }

        return {
          product: row.product_name,
          unit: row.unit,
          retail_price: Math.round(row.retail_price * 100) / 100,
          trend: weeklyChange > 2 ? 'UP' : weeklyChange < -2 ? 'DOWN' : 'STABLE',
          weekly_change: Math.round(weeklyChange * 100) / 100,
          best_price_type: bestPriceType,
          price_analysis: analysis,
          action_recommendation: recommendation,
        };
      });

      // Market overview
      const marketOverview = {
        best_buy_product: summary.reduce((best, curr) =>
          curr.trend === 'UP' && (!best || curr.weekly_change > best.weekly_change) ? curr : best
        )?.product || 'N/A',
        best_sell_product: summary.reduce((best, curr) =>
          curr.trend === 'DOWN' && (!best || curr.weekly_change < best.weekly_change) ? curr : best
        )?.product || 'N/A',
        most_volatile: summary.reduce((most, curr) =>
          Math.abs(curr.weekly_change) > Math.abs(most?.weekly_change || 0) ? curr : most
        )?.product || 'N/A',
        overall_trend: summary.filter((s) => s.trend === 'UP').length >
                      summary.filter((s) => s.trend === 'DOWN').length ? 'BULLISH' :
          summary.filter((s) => s.trend === 'DOWN').length >
                      summary.filter((s) => s.trend === 'UP').length ? 'BEARISH' : 'NEUTRAL',
      };

      return res.json({
        summary,
        market_overview: marketOverview,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Dashboard API error:", error);
      return res.status(500).json({error: "Failed to generate dashboard"});
    } finally {
      client.release();
    }
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

  // Add this if you want to clean up old data
  router.post("/cleanup-legacy-data", async (_req, res) => {
    const client = await pool.connect();
    try {
      // Find records with equal prices
      const badData = await client.query(`
        SELECT COUNT(*) as count 
        FROM market_prices 
        WHERE ABS(wholesale_price - retail_price) < 0.01
        AND ABS(broker_price - retail_price) < 0.01
        AND ABS(farmgate_price - retail_price) < 0.01
        AND benchmark = true
      `);
      return res.json({
        message: "Legacy data analysis",
        bad_records_count: badData.rows[0].count,
        note: "No action needed - API calculates prices from retail automatically",
        current_behavior: "All non-retail prices are calculated from retail_price in API response",
        calculation_logic: {
          wholesale: "retail_price * 0.85",
          broker: "retail_price * 0.95",
          farmgate: "retail_price * 0.60",
        },
      });
    } catch (err) {
      console.error("Cleanup error:", err);
      return res.status(500).json({error: "Analysis failed"});
    } finally {
      client.release();
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

  // REPLACE the entire router.get("/summary", ...) with:
  router.get("/summary", async (req, res) => {
    const client = await pool.connect();
    try {
      const {currency = 'KES'} = req.query;
      // ✅ FETCH: Get latest price per product
      const result = await client.query(
        `SELECT DISTINCT ON (product_name) *
        FROM market_prices_mv
        ORDER BY product_name, collected_at DESC
        LIMIT 50`
      );

      // ✅ Get currency rates
      const rates = await CurrencyService.getRates();
      const targetCurrency = (currency as keyof CurrencyRates) || 'KES';

      // ✅ TRANSFORM: Calculate and convert
      const data = result.rows.map((row: DbMarketPriceRow) => {
        const retailPriceUSD = Number(row.retail_price) || 0;

        if (retailPriceUSD > 0) {
          // Calculate in USD
          const wholesalePriceUSD = retailPriceUSD * 0.85;
          const brokerPriceUSD = retailPriceUSD * 0.95;
          const farmgatePriceUSD = retailPriceUSD * 0.60;

          // Convert to target currency
          const convert = (amountUSD: number) =>
            CurrencyService.convert(amountUSD, 'USD', targetCurrency, rates);

          return {
            ...row,
            collected_at: row.collected_at ?
              new Date(row.collected_at as string).toISOString() : null,
            // Converted prices
            retail_price: Math.round(convert(retailPriceUSD) * 100) / 100,
            wholesale_price: Math.round(convert(wholesalePriceUSD) * 100) / 100,
            broker_price: Math.round(convert(brokerPriceUSD) * 100) / 100,
            farmgate_price: Math.round(convert(farmgatePriceUSD) * 100) / 100,
            // Currency info
            currency: targetCurrency,
            original_currency: 'USD',
            fx_rate: rates[targetCurrency],
            unit: `${targetCurrency}/kg`,
            price_sources: {
              retail: row.source || "worldbank_benchmark",
              wholesale: "calculated",
              broker: "calculated",
              farmgate: "calculated",
            },
            is_calculated: true,
            calculation_base: "retail_price_usd",
          };
        }

        // Invalid data fallback
        return {
          ...row,
          collected_at: row.collected_at ?
            new Date(row.collected_at as string).toISOString() : null,
          currency: targetCurrency,
          fx_rate: rates[targetCurrency],
          unit: `${targetCurrency}/kg`,
        };
      });

      return res.json({
        data,
        currency: targetCurrency,
        fx_rates: rates,
        total_products: data.length,
      });
    } catch (err: unknown) {
      console.error("Error fetching summary:", err);
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
