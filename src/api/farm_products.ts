/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {FarmProductSchema, FarmProduct} from "../validation/farmProductSchema";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";

// ✅ Local registry for farm products (merged later in swagger.ts)
export const farmProductRegistry = new OpenAPIRegistry();

// ✅ Register schema once per feature
farmProductRegistry.register("FarmProduct", FarmProductSchema);

// -------------------------------------
// Middleware for request body validation
// -------------------------------------
const validateRequest = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({error: result.error.errors[0].message});
      return; // ✅ explicitly return to stop execution after sending response
    }
    next();
  };

// -------------------------------------
// Router factory
// -------------------------------------
export const getFarmProductsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ==========================
  // POST /farm-products
  // ==========================
  farmProductRegistry.registerPath({
    method: "post",
    path: "/farm-products",
    description: "Add a new farm product",
    request: {
      body: {
        content: {
          "application/json": {schema: FarmProductSchema},
        },
      },
    },
    responses: {
      201: {
        description: "Product created successfully",
        content: {"application/json": {schema: z.object({id: z.string()})}},
      },
      400: {description: "Validation error"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/",
    validateRequest(FarmProductSchema),
    async (req: Request<object, object, FarmProduct>, res: Response) => {
      const {
        farmer_id,
        product_name,
        quantity,
        unit,
        harvest_date,
        storage_location,
        category,
        price,
        status,
      } = req.body;

      try {
        const result = await pool.query(
          `INSERT INTO farm_products 
            (
              farmer_id, product_name, quantity, unit, harvest_date,
              storage_location, category, price, status, created_at, updated_at
            )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
           RETURNING id`,
          [
            farmer_id,
            product_name,
            quantity,
            unit,
            harvest_date || null,
            storage_location || null,
            category || null,
            price ?? 0,
            status || "available",
          ]
        );
        res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error adding farm product:", err);
        res.status(500).send("Internal server error");
      }
    }
  );

  // ==========================
  // GET /farm-products
  // ==========================
  farmProductRegistry.registerPath({
    method: "get",
    path: "/farm-products",
    description: "Get all farm products (with optional filters + pagination)",
    parameters: [
      {name: "category", in: "query", schema: {type: "string"}},
      {name: "status", in: "query", schema: {type: "string"}},
      {name: "page", in: "query", schema: {type: "integer", minimum: 1}},
      {name: "limit", in: "query", schema: {type: "integer", minimum: 1}},
    ],
    responses: {
      200: {
        description: "Paginated list of products",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(FarmProductSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/", async (req, res) => {
    try {
      const {category, status} = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      let baseQuery = "FROM farm_products WHERE 1=1";
      const params: unknown[] = [];

      if (category) {
        params.push(category);
        baseQuery += ` AND category = $${params.length}`;
      }

      if (status) {
        params.push(status);
        baseQuery += ` AND status = $${params.length}`;
      }

      // ✅ Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) ${baseQuery}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // ✅ Get paginated products
      params.push(limit);
      params.push(offset);
      const result = await pool.query(
        `SELECT * ${baseQuery}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1}
        OFFSET $${params.length}`,
        params
      );

      res.json({data: result.rows, total, page, limit});
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // GET /farm-products/farmer/:farmer_id
  // ==========================
  farmProductRegistry.registerPath({
    method: "get",
    path: "/farm-products/farmer/{farmer_id}",
    description: "Get all products belonging to a farmer (with pagination)",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
      {name: "page", in: "query", schema: {type: "integer", minimum: 1}},
      {name: "limit", in: "query", schema: {type: "integer", minimum: 1}},
    ],
    responses: {
      200: {
        description: "Paginated list of farmer products",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(FarmProductSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            }),
          },
        },
      },
      404: {description: "Farmer not found"},
      500: {description: "Internal server error"},
    },
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // ✅ Count total
      const countResult = await pool.query(
        "SELECT COUNT(*) FROM farm_products WHERE farmer_id = $1",
        [farmer_id]
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // ✅ Paginated data
      const result = await pool.query(
        `SELECT * FROM farm_products 
        WHERE farmer_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
        [farmer_id, limit, offset]
      );

      res.json({data: result.rows, total, page, limit});
    } catch (err) {
      console.error("Error fetching farmer products:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // PUT /farm-products/:id
  // ==========================
  farmProductRegistry.registerPath({
    method: "put",
    path: "/farm-products/{id}",
    description: "Update a farm product",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    request: {
      body: {
        content: {
          "application/json": {schema: FarmProductSchema.partial()},
        },
      },
    },
    responses: {
      200: {
        description: "Product updated successfully",
        content: {"application/json": {schema: FarmProductSchema}},
      },
      404: {description: "Product not found"},
      500: {description: "Internal server error"},
    },
  });

  router.put("/:id", async (req, res) => {
    const {id} = req.params;
    const {product_name, quantity, unit, price, status, category} = req.body;

    try {
      const result = await pool.query(
        `UPDATE farm_products
         SET product_name = COALESCE($1, product_name),
             quantity = COALESCE($2, quantity),
             unit = COALESCE($3, unit),
             price = COALESCE($4, price),
             status = COALESCE($5, status),
             category = COALESCE($6, category),
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [product_name, quantity, unit, price, status, category, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating product:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // DELETE /farm-products/:id
  // ==========================
  farmProductRegistry.registerPath({
    method: "delete",
    path: "/farm-products/{id}",
    description: "Delete a farm product",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    responses: {
      200: {
        description: "Product deleted successfully",
        content: {
          "application/json": {
            schema: z.object({message: z.string(), id: z.string()}),
          },
        },
      },
      404: {description: "Product not found"},
      500: {description: "Internal server error"},
    },
  });

  router.delete("/:id", async (req, res) => {
    const {id} = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM farm_products WHERE id = $1 RETURNING id",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }
      return res.json({message: "Product deleted", id});
    } catch (err) {
      console.error("Error deleting product:", err);
      return res.status(500).send("Internal server error");
    }
  });

  return router;
};
