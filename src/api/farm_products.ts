/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {FarmProductSchema, FarmProduct} from "../validation/farmProductSchema";
// eslint-disable-next-line max-len
import {OpenAPIRegistry, extendZodWithOpenApi} from "@asteasolutions/zod-to-openapi";

// ✅ Add this line once in your codebase (ideally in a common setup file)
extendZodWithOpenApi(z);

// ✅ Create a registry just for farm products
export const farmProductRegistry = new OpenAPIRegistry();

// ✅ Register schema normally (now `.openapi` exists)
farmProductRegistry.register("FarmProduct", FarmProductSchema);


// Middleware for validation
const validateRequest = (schema: z.ZodSchema) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error.errors[0].message});
    return;
  }
  next();
};

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
    description: "Get all farm products (with optional filters)",
    parameters: [
      {name: "category", in: "query", schema: {type: "string"}},
      {name: "status", in: "query", schema: {type: "string"}},
    ],
    responses: {
      200: {
        description: "List of products",
        content: {"application/json": {schema: z.array(FarmProductSchema)}},
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/", async (req, res) => {
    try {
      const {category, status} = req.query;

      let baseQuery = "SELECT * FROM farm_products WHERE 1=1";
      const params: unknown[] = [];

      if (category) {
        params.push(category);
        baseQuery += ` AND category = $${params.length}`;
      }

      if (status) {
        params.push(status);
        baseQuery += ` AND status = $${params.length}`;
      }

      baseQuery += " ORDER BY created_at DESC";

      const result = await pool.query(baseQuery, params);
      res.json(result.rows);
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
    description: "Get all products belonging to a farmer",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    responses: {
      200: {
        description: "List of farmer products",
        content: {"application/json": {schema: z.array(FarmProductSchema)}},
      },
      404: {description: "Farmer not found"},
      500: {description: "Internal server error"},
    },
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const result = await pool.query(
        `SELECT * FROM farm_products WHERE farmer_id = $1
        ORDER BY created_at DESC`,
        [farmer_id]
      );
      res.json(result.rows);
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
        // eslint-disable-next-line max-len
        content: {"application/json": {schema: z.object({message: z.string(), id: z.string()})}},
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
