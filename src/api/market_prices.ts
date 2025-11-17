/* eslint-disable camelcase */
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {MarketPriceSchema} from "../validation/marketPriceSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import {fetchCommodityPrice} from "../services/intelligentFetcher";
import {getUsdToKesRate} from "../services/fxService";

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
  marketPriceRegistry.registerPath({
    method: "post",
    path: "/market-prices/sync",
    description: "Refresh the materialized view market_prices_mv",
    responses: {
      200: {
        description: "Refresh successful",
        content: {
          "application/json": {
            schema: z.object({message: z.string()}),
          },
        },
      },
      500: {description: "Failed to refresh"},
    },
  });

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

      // ✅ Normalize collected_at and convert currency to KES
      const rate = await getUsdToKesRate();
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
