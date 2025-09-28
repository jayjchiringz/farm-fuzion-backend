/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {MarketPriceSchema, MarketPrice} from "../validation/marketPriceSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import axios from "axios";

// External API response types
interface KilimoStatEntry {
  product?: string;
  category?: string;
  unit?: string;
  wholesale?: number;
  retail?: number;
  region?: string;
}

interface WorldBankEntry {
  commodity?: string;
  unit?: string;
  price?: number;
}


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
      201: {description: "Created", content: {"application/json":
        {schema: z.object({id: z.string()})}}},
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
          [product_name, category, unit, wholesale_price, retail_price,
            broker_price, farmgate_price, region, source,
            collected_at|| new Date(), benchmark ?? false]
        );

        res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error adding market price:", err);
        res.status(500).send("Internal server error");
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

      res.json({data: result.rows, total, page, limit});
    } catch (err) {
      console.error("Error fetching market prices:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // POST /market-prices/sync
  // ==========================
  marketPriceRegistry.registerPath({
    method: "post",
    path: "/market-prices/sync",
    // eslint-disable-next-line max-len
    description: "Sync external benchmark prices from KilimoSTAT & World Bank RTP",
    responses: {
      200: {
        description: "Sync successful",
        content: {"application/json": {schema: z.object({count: z.number()})}},
      },
      500: {description: "Failed to sync"},
    },
  });

  router.post("/sync", async (_req, res) => {
    try {
      // 🔹 Fetch from KilimoSTAT (adjust URL to real API/CSV/JSON endpoint)
      const kilimoResp = await axios.get("https://statistics.kilimo.go.ke/api/prices");
      const kilimoData = Array.isArray(kilimoResp.data) ? kilimoResp.data : [];

      const transformedKilimo = kilimoData.map((item: KilimoStatEntry) => ({
        product_name: item.product ?? "Unknown",
        category: item.category ?? "General",
        unit: item.unit ?? "kg",
        wholesale_price: item.wholesale ?? null,
        retail_price: item.retail ?? null,
        broker_price: null,
        farmgate_price: null,
        region: item.region ?? "Kenya",
        source: "KilimoSTAT",
        benchmark: true,
        collected_at: new Date().toISOString(),
      }));

      // 🔹 Fetch from World Bank RTP (example endpoint — update with real)
      const wbResp = await axios.get(
        "https://api.worldbank.org/v2/some/food-prices?format=json"
      );
      const wbData = Array.isArray(wbResp.data) ? wbResp.data : [];

      const transformedWB = wbData.map((item: WorldBankEntry) => ({
        product_name: item.commodity ?? "Unknown",
        category: "Global",
        unit: item.unit ?? "kg",
        wholesale_price: item.price ?? null,
        retail_price: null,
        broker_price: null,
        farmgate_price: null,
        region: "Global",
        source: "WorldBank RTP",
        benchmark: true,
        collected_at: new Date().toISOString(),
      }));

      const allPrices = [...transformedKilimo, ...transformedWB];

      // 🔹 Upsert into DB (avoid duplicates by product+region+source)
      for (const price of allPrices) {
        await pool.query(
          `INSERT INTO market_prices
            (product_name, category, unit, wholesale_price, retail_price,
            broker_price, farmgate_price, region, source, collected_at,
            benchmark)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (product_name, region, source) DO UPDATE
            SET wholesale_price = EXCLUDED.wholesale_price,
                retail_price = EXCLUDED.retail_price,
                collected_at = EXCLUDED.collected_at,
                benchmark = true`,
          [
            price.product_name,
            price.category,
            price.unit,
            price.wholesale_price,
            price.retail_price,
            price.broker_price,
            price.farmgate_price,
            price.region,
            price.source,
            price.collected_at,
            price.benchmark,
          ]
        );
      }

      res.json({success: true, count: allPrices.length});
    } catch (err) {
      console.error("Error syncing external market prices:", err);
      res.status(500).send("Failed to sync external market prices");
    }
  });


  // ==========================
  // GET /market-prices/sync
  // ==========================
  marketPriceRegistry.registerPath({
    method: "get",
    path: "/market-prices/sync",
    description: "Fetch and update benchmark market prices from external APIs",
    responses: {
      200: {description: "Sync successful"},
      500: {description: "Sync failed"},
    },
  });

  router.get("/sync", async (_req, res) => {
    try {
      // ✅ Example external APIs
      const kilimoUrl = "https://statistics.kilimo.go.ke/api/prices"; // adjust if real endpoint differs
      const worldBankUrl = "https://api.worldbank.org/v2/some-market-data"; // placeholder

      const [kilimoRes, wbRes] = await Promise.allSettled([
        axios.get(kilimoUrl),
        axios.get(worldBankUrl),
      ]);

      // Process Kilimo data if available
      if (kilimoRes.status === "fulfilled") {
        for (const entry of kilimoRes.value.data || []) {
          await pool.query(
            `INSERT INTO market_prices 
              (product_name, category, unit, wholesale_price, retail_price,
              broker_price, farmgate_price, region, source, benchmark,
              last_synced)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW())
            ON CONFLICT (product_name, region, source) DO UPDATE 
            SET wholesale_price=EXCLUDED.wholesale_price,
                retail_price=EXCLUDED.retail_price,
                broker_price=EXCLUDED.broker_price,
                farmgate_price=EXCLUDED.farmgate_price,
                last_synced=NOW()`,
            [
              entry.product_name,
              entry.category || "Cereal",
              entry.unit || "Kg",
              entry.wholesale_price || null,
              entry.retail_price || null,
              entry.broker_price || null,
              entry.farmgate_price || null,
              entry.region || "Kenya",
              "KilimoSTAT",
            ]
          );
        }
      }

      // Process World Bank data if available
      if (wbRes.status === "fulfilled") {
        for (const entry of wbRes.value.data || []) {
          await pool.query(
            `INSERT INTO market_prices 
              (product_name, category, unit, wholesale_price, retail_price,
              region, source, benchmark, last_synced)
            VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW())
            ON CONFLICT (product_name, region, source) DO UPDATE 
            SET wholesale_price=EXCLUDED.wholesale_price,
                retail_price=EXCLUDED.retail_price,
                last_synced=NOW()`,
            [
              entry.product_name,
              entry.category || "Cereal",
              entry.unit || "Kg",
              entry.wholesale_price || null,
              entry.retail_price || null,
              entry.region || "Global",
              "World Bank",
            ]
          );
        }
      }

      res.json({success: true, message: "Sync completed"});
    } catch (err) {
      console.error("Error syncing market prices:", err);
      res.status(500).json({error: "Sync failed"});
    }
  });

  return router;
};
