/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {MarketPriceSchema, MarketPrice} from "../validation/marketPriceSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";

// ✅ Local registry
export const marketPriceRegistry = new OpenAPIRegistry();
marketPriceRegistry.register("MarketPrice", MarketPriceSchema);

// Middleware for validation
const validateRequest = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({error: result.error.errors[0].message});
      return;
    }
    next();
  };

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
  // POST /market-prices
  // ==========================
  marketPriceRegistry.registerPath({
    method: "post",
    path: "/market-prices",
    description: "Add a new market price entry",
    request: {
      body: {content: {"application/json": {schema: MarketPriceSchema}}},
    },
    responses: {
      201: {description: "Created",
        content: {"application/json": {schema: z.object({id: z.string()})}}},
      400: {description: "Validation error"},
      500: {description: "Internal server error"},
    },
  });

  router.post("/", validateRequest(MarketPriceSchema),
    async (req: Request<object, object, MarketPrice>, res: Response) => {
      try {
        const {
          product_name,
          category,
          unit,
          wholesale_price,
          retail_price,
          broker_price,
          farmgate_price,
          region,
          source,
          collected_at,
          benchmark,
        } = req.body;

        const result = await pool.query(
          `INSERT INTO market_prices 
            (product_name, category, unit, wholesale_price, retail_price,
             broker_price, farmgate_price, region, source,
             collected_at, benchmark)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            product_name,
            category,
            unit,
            wholesale_price,
            retail_price,
            broker_price,
            farmgate_price,
            region,
            source,
            collected_at || new Date(),
            benchmark ?? false,
          ]
        );

        return res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error adding market price:", err);
        return res.status(500).send("Internal server error");
      }
    });

  // ==========================
  // GET /market-prices
  // ==========================
  marketPriceRegistry.registerPath({
    method: "get",
    path: "/market-prices",
    description: "Get market prices with filters + pagination",
    parameters: [
      {name: "product", in: "query", schema: {type: "string"}},
      {name: "region", in: "query", schema: {type: "string"}},
      {name: "page", in: "query", schema: {type: "integer", minimum: 1}},
      {name: "limit", in: "query", schema: {type: "integer", minimum: 1}},
    ],
    responses: {
      200: {
        description: "Paginated list of market prices",
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
    try {
      const {product, region} = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      let baseQuery = "FROM market_prices WHERE 1=1";
      const params: unknown[] = [];

      if (product) {
        params.push(product);
        baseQuery += ` AND product_name ILIKE $${params.length}`;
      }

      if (region) {
        params.push(region);
        baseQuery += ` AND region ILIKE $${params.length}`;
      }

      const countResult = await pool.query(
        `SELECT COUNT(*) ${baseQuery}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(limit);
      params.push(offset);

      const result = await pool.query(
        `SELECT * ${baseQuery}
         ORDER BY collected_at DESC
         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
      );

      return res.json({data: result.rows, total, page, limit});
    } catch (err) {
      console.error("Error fetching market prices:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // POST /market-prices/sync
  // ==========================
  marketPriceRegistry.registerPath({
    method: "post",
    path: "/market-prices/sync",
    description: "Sync benchmark prices from world_bank into market_prices",
    responses: {
      200: {
        description: "Sync successful",
        content: {
          "application/json": {
            schema: z.object({
              inserted: z.number(),
              updated: z.number(),
              total: z.number(),
            }),
          },
        },
      },
      500: {description: "Failed to sync"},
    },
  });

  router.post("/sync", async (_req, res) => {
    const client = await pool.connect();
    try {
      // 1. Fetch from world_bank
      const wbResult = await client.query(`
        SELECT product_name, category, unit, region,
              wholesale_price, retail_price, broker_price, farmgate_price,
              collected_at
        FROM world_bank
      `);

      if (wbResult.rows.length === 0) {
        client.release();
        return res.json({inserted: 0, updated: 0, total: 0});
      }

      // 2. Build bulk insert
      const values: unknown[] = [];
      const valueClauses = wbResult.rows
        .map((row, idx) => {
          const i = idx * 11;
          values.push(
            row.product_name ?? "Unknown",
            row.category ?? null,
            row.unit ?? "kg",
            row.wholesale_price ?? null,
            row.retail_price ?? null,
            row.broker_price ?? null,
            row.farmgate_price ?? null,
            row.region ?? "Unknown",
            "world_bank", // 🔹 source
            row.collected_at ?? new Date(),
            true // benchmark
          );
          // eslint-disable-next-line max-len
          return `($${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},$${i + 6},$${i + 7},$${i + 8},$${i + 9},$${i + 10},$${i + 11})`;
        })
        .join(",");

      const result = await client.query(
        `INSERT INTO market_prices
          (product_name, category, unit, wholesale_price, retail_price,
          broker_price, farmgate_price, region, source, collected_at, benchmark)
        VALUES ${valueClauses}
        ON CONFLICT (product_name, region, source) DO UPDATE
        SET wholesale_price = EXCLUDED.wholesale_price,
            retail_price    = EXCLUDED.retail_price,
            broker_price    = EXCLUDED.broker_price,
            farmgate_price  = EXCLUDED.farmgate_price,
            collected_at    = EXCLUDED.collected_at,
            benchmark       = true`,
        values
      );

      client.release();
      return res.json({
        inserted: wbResult.rows.length,
        updated: result.rowCount ?? 0,
        total: wbResult.rows.length,
      });
    } catch (err) {
      client.release();
      console.error("Error syncing world_bank → market_prices:", err);
      return res.status(500).send("Failed to sync world_bank → market_prices");
    }
  });

  return router;
};
