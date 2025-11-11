/* eslint-disable camelcase */
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {MarketPriceSchema} from "../validation/marketPriceSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import {fetchCommodityPrice} from "../services/intelligentFetcher";
import {getUsdToKesRate} from "../services/fxService";

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
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(limit);
      params.push(offset);

      const result = await client.query(
        `SELECT * ${baseQuery}
        ORDER BY collected_at DESC
        LIMIT $${params.length - 1}
        OFFSET $${params.length}`,
        params
      );

      let data = result.rows;

      // ✅ Normalize currency → KES & ensure ISO string for collected_at
      const rate = await getUsdToKesRate();
      data = data.map((row) => ({
        ...row,
        collected_at: row.collected_at ?
          new Date(row.collected_at).toISOString() :
          null,
        // eslint-disable-next-line max-len
        wholesale_price: row.wholesale_price ? row.wholesale_price * rate : null,
        retail_price: row.retail_price ? row.retail_price * rate : null,
        broker_price: row.broker_price ? row.broker_price * rate : null,
        farmgate_price: row.farmgate_price ? row.farmgate_price * rate : null,
        currency: "KES",
        fx_rate: rate,
      }));

      // 🧠 Intelligent Fetch Fallback
      if (data.length === 0 && product) {
        const livePrice = await fetchCommodityPrice(product as string);
        if (livePrice) {
          const insertRes = await client.query(
            `INSERT INTO market_prices
              (product_name, category, unit, wholesale_price, retail_price,
              broker_price, farmgate_price, region, source, collected_at,
              benchmark, volatility, last_synced)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *`,
            [
              product,
              "auto_category",
              "kg",
              livePrice,
              livePrice,
              livePrice,
              livePrice,
              region || "auto",
              "auto_web",
              new Date().toISOString(), // 🔥 ISO string
              false,
              true,
              new Date().toISOString(), // 🔥 ISO string
            ]
          );
          data = insertRes.rows.map((row) => ({
            ...row,
            collected_at: row.collected_at ?
              new Date(row.collected_at).toISOString() :
              null,
          }));
        }
      }

      client.release();
      return res.json({data, total, page, limit});
    } catch (err: unknown) {
      client.release();
      if (err instanceof Error) {
        console.error("Error fetching market prices:", err.message);
      } else {
        console.error("Error fetching market prices:", err);
      }
      return res.status(500).send("Internal server error");
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
      client.release();
      return res.json({message: "market_prices_mv refreshed"});
    } catch (err: unknown) {
      client.release();
      if (err instanceof Error) {
        console.error("Error refreshing market_prices_mv:", err.message);
      } else {
        console.error("Error refreshing market_prices_mv:", err);
      }
      return res.status(500).send("Failed to refresh materialized view");
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
    },
  });

  router.get("/summary", async (_req, res) => {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT DISTINCT ON (product_name)
              id, product_name, category, unit,
              wholesale_price, retail_price, broker_price, farmgate_price,
              region, source, volatility, collected_at, benchmark, last_synced
        FROM market_prices_mv
        ORDER BY product_name, collected_at DESC;
      `);

      // ✅ Normalize collected_at here too
      const data = result.rows.map((row) => ({
        ...row,
        collected_at: row.collected_at ?
          new Date(row.collected_at).toISOString() :
          null,
      }));

      client.release();
      return res.json({data});
    } catch (err) {
      client.release();
      console.error("Error fetching summary:", err);
      return res.status(500).send("Failed to fetch summary");
    }
  });

  return router;
};
