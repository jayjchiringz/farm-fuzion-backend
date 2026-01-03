/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter\functions\src\api\marketplace.ts
/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import {
  MarketplaceProductSchema,
  PublishToMarketplaceSchema,
  AddToCartSchema,
  CheckoutSchema,
  PaymentRequestSchema,
  OrderStatusUpdateSchema,
  PublishToMarketplace,
  AddToCart,
  Checkout,
} from "../validation/marketplaceSchema";
import {Pool, PoolClient} from "pg";

// ✅ Local registry for marketplace
export const marketplaceRegistry = new OpenAPIRegistry();

// ✅ Register schemas
marketplaceRegistry.register("MarketplaceProduct", MarketplaceProductSchema);
marketplaceRegistry.register("PublishToMarketplace", PublishToMarketplaceSchema);
marketplaceRegistry.register("AddToCart", AddToCartSchema);
marketplaceRegistry.register("Checkout", CheckoutSchema);

// -------------------------------------
// Middleware for validation
// -------------------------------------
const validateRequest = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({error: result.error.errors[0].message});
      return;
    }
    next();
  };

// -------------------------------------
// Helper: Generate unique order number
// -------------------------------------
const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `FF-${timestamp}${random}`;
};

// -------------------------------------
// Helper: Resolve farmer ID
// -------------------------------------
// Replace the resolveFarmerId function:
async function resolveFarmerId(db: Pool | PoolClient, farmerId: string | number): Promise<string> {
  const normalized = String(farmerId);
  try {
    const result = await db.query(
      "SELECT id FROM farmers WHERE id::text = $1 OR auth_id::text = $1 OR user_id::text = $1 LIMIT 1",
      [normalized]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    
    return normalized;
  } catch (err) {
    console.error("Error resolving farmer ID:", err);
    return normalized;
  }
}

// Replace the getOneOrNone function:
const getOneOrNone = async (pool: Pool, query: string, params: any[] = []): Promise<any | null> => {
  const result = await pool.query(query, params);
  return result.rows.length > 0 ? result.rows[0] : null;
};

// Update the router factory signature:
export const getMarketplaceRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  // ============================================
  // MARKETPLACE PRODUCT ENDPOINTS
  // ============================================

  // POST /marketplace/products/publish
  marketplaceRegistry.registerPath({
    method: "post",
    path: "/marketplace/products/publish",
    description: "Publish a farm product to the marketplace",
    request: {
      body: {
        content: {
          "application/json": {schema: PublishToMarketplaceSchema},
        },
      },
    },
    responses: {
      201: {
        description: "Product published successfully",
        content: {
          "application/json": {
            schema: z.object({
              id: z.string().uuid(),
              message: z.string(),
            }),
          },
        },
      },
      400: {description: "Validation error"},
      404: {description: "Farm product not found or not owned by farmer"},
      409: {description: "Product already published"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/products/publish",
    validateRequest(PublishToMarketplaceSchema),
    async (req: Request<object, object, PublishToMarketplace & { farmer_id: string }>, res: Response) => {
      const {farm_product_id, price, is_public = true} = req.body;
      const farmer_id = req.body.farmer_id || (req as any).user?.farmer_id;

      if (!farmer_id) {
        return res.status(400).json({error: "Farmer ID is required"});
      }

      try {
        // 1. Verify farm product exists and belongs to farmer
        const farmProduct = await getOneOrNone(
          pool,
          `SELECT fp.*, f.location 
           FROM farm_products fp
           LEFT JOIN farmers f ON fp.farmer_id = f.id
           WHERE fp.id = $1 AND fp.farmer_id = $2`,
          [farm_product_id, farmer_id]
        );

        if (!farmProduct) {
          return res.status(404).json({
            error: "Farm product not found or you don't own it",
          });
        }

        // 2. Check if already published
        const existing = await getOneOrNone(
          pool,
          "SELECT id FROM marketplace_products WHERE farm_product_id = $1 AND status != 'hidden'",
          [farm_product_id]
        );

        if (existing) {
          return res.status(409).json({
            error: "This product is already published to marketplace",
          });
        }

        // 3. Publish to marketplace
        const result = await pool.query(
          `INSERT INTO marketplace_products (
            farm_product_id, farmer_id, product_name, quantity, unit,
            price, category, status, location
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            farm_product_id,
            farmer_id,
            farmProduct.product_name,
            farmProduct.quantity,
            farmProduct.unit,
            price,
            farmProduct.category || "produce",
            is_public ? "available" : "hidden",
            farmProduct.storage_location || farmProduct.location || "Unknown",
          ]
        );

        res.status(201).json({
          id: result.rows[0].id,
          message: "Product published successfully to marketplace",
        });
      } catch (err) {
        console.error("Error publishing product:", err);
        res.status(500).json({error: "Internal server error"});
      }
    }
  );

  // GET /marketplace/products
  marketplaceRegistry.registerPath({
    method: "get",
    path: "/marketplace/products",
    description: "Browse marketplace products with filters",
    parameters: [
      {name: "category", in: "query", schema: {type: "string"}},
      {name: "minPrice", in: "query", schema: {type: "number"}},
      {name: "maxPrice", in: "query", schema: {type: "string"}},
      {name: "location", in: "query", schema: {type: "string"}},
      {name: "farmer_id", in: "query", schema: {type: "string"}},
      {name: "status", in: "query", schema: {type: "string", default: "available"}},
      {name: "sort", in: "query", schema: {type: "string", default: "newest"}},
      {name: "page", in: "query", schema: {type: "integer", default: 1}},
      {name: "limit", in: "query", schema: {type: "integer", default: 20}},
      {name: "search", in: "query", schema: {type: "string"}},
    ],
    responses: {
      200: {
        description: "Paginated list of marketplace products",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(MarketplaceProductSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/products", async (req: Request, res: Response) => {
    try {
      const {
        category,
        minPrice,
        maxPrice,
        location,
        farmer_id,
        status = "available",
        sort = "newest",
        page = 1,
        limit = 20,
        search,
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      const offset = (pageNum - 1) * limitNum;

      // Build WHERE clause
      let whereClause = "WHERE status = $1";
      const params: any[] = [status];
      let paramCount = 1;

      if (category) {
        paramCount++;
        whereClause += ` AND category = $${paramCount}`;
        params.push(category);
      }

      if (minPrice) {
        paramCount++;
        whereClause += ` AND price >= $${paramCount}`;
        params.push(parseFloat(minPrice as string));
      }

      if (maxPrice) {
        paramCount++;
        whereClause += ` AND price <= $${paramCount}`;
        params.push(parseFloat(maxPrice as string));
      }

      if (location) {
        paramCount++;
        whereClause += ` AND location ILIKE $${paramCount}`;
        params.push(`%${location}%`);
      }

      if (farmer_id) {
        paramCount++;
        whereClause += ` AND farmer_id = $${paramCount}`;
        params.push(farmer_id);
      }

      if (search) {
        paramCount++;
        whereClause += ` AND search_vector @@ to_tsquery('english', $${paramCount})`;
        params.push(`${search}:*`);
      }

      // Build ORDER BY clause
      let orderBy = "ORDER BY ";
      switch (sort) {
      case "price_asc":
        orderBy += "price ASC";
        break;
      case "price_desc":
        orderBy += "price DESC";
        break;
      case "rating":
        orderBy += "rating DESC, created_at DESC";
        break;
      case "sales":
        orderBy += "total_sales DESC, created_at DESC";
        break;
      default: // "newest"
        orderBy += "created_at DESC";
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM marketplace_products ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.ceil(total / limitNum);

      // Get paginated data
      params.push(limitNum);
      params.push(offset);

      const result = await pool.query(
        `SELECT 
          id,
          farm_product_id,
          farmer_id,
          product_name,
          quantity,
          unit,
          price::float,
          category,
          status,
          location,
          rating::float,
          total_sales,
          created_at,
          updated_at
        FROM marketplace_products
        ${whereClause}
        ${orderBy}
        LIMIT $${params.length - 1}
        OFFSET $${params.length}`,
        params
      );

      res.json({
        data: result.rows,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      });
    } catch (err) {
      console.error("Error fetching marketplace products:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // GET /marketplace/products/:id
  marketplaceRegistry.registerPath({
    method: "get",
    path: "/marketplace/products/{id}",
    description: "Get marketplace product details",
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
        description: "Product details",
        content: {
          "application/json": {schema: MarketplaceProductSchema},
        },
      },
      404: {description: "Product not found"},
      500: {description: "Internal server error"},
    },
  });

  router.get("/products/:id", async (req: Request, res: Response) => {
    try {
      const {id} = req.params;

      const result = await pool.query(
        `SELECT 
          mp.*,
          f.first_name,
          f.last_name,
          f.mobile,
          f.rating as farmer_rating
        FROM marketplace_products mp
        LEFT JOIN farmers f ON mp.farmer_id = f.id
        WHERE mp.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching product:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // PUT /marketplace/products/:id
  marketplaceRegistry.registerPath({
    method: "put",
    path: "/marketplace/products/{id}",
    description: "Update marketplace product",
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
          "application/json": {schema: MarketplaceProductSchema.partial()},
        },
      },
    },
    responses: {
      200: {
        description: "Product updated successfully",
        content: {
          "application/json": {schema: MarketplaceProductSchema},
        },
      },
      403: {description: "Not authorized to update this product"},
      404: {description: "Product not found"},
      500: {description: "Internal server error"},
    },
  });

  router.put("/products/:id", async (req: Request, res: Response) => {
    try {
      const {id} = req.params;
      const farmer_id = req.body.farmer_id || (req as any).user?.farmer_id;
      const {price, quantity, status, location} = req.body;

      // Verify ownership
      const productResult = await pool.query(
        "SELECT farmer_id FROM marketplace_products WHERE id = $1",
        [id]
      );

      if (productResult.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }

      const product = productResult.rows[0];

      if (product.farmer_id !== farmer_id) {
        return res.status(403).json({error: "Not authorized to update this product"});
      }

      // Update product
      const result = await pool.query(
        `UPDATE marketplace_products
         SET 
           price = COALESCE($1, price),
           quantity = COALESCE($2, quantity),
           status = COALESCE($3, status),
           location = COALESCE($4, location),
           updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [price, quantity, status, location, id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating product:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // SHOPPING CART ENDPOINTS
  // ============================================

  // GET /marketplace/cart/:buyerId
  marketplaceRegistry.registerPath({
    method: "get",
    path: "/marketplace/cart/{buyerId}",
    description: "Get buyer's active shopping carts",
    parameters: [
      {
        name: "buyerId",
        in: "path",
        required: true,
        schema: {type: "string"},
      },
    ],
    responses: {
      200: {
        description: "Active shopping carts with items",
        content: {
          "application/json": {
            schema: z.object({
              carts: z.array(z.object({
                cart: z.any(),
                items: z.array(z.any()),
                seller: z.object({
                  first_name: z.string(),
                  last_name: z.string(),
                  mobile: z.string().optional(),
                }),
                total: z.number(),
              })),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/cart/:buyerId", async (req: Request, res: Response) => {
    try {
      const {buyerId} = req.params;
      const resolvedBuyerId = await resolveFarmerId(pool, buyerId);

      // Get all active carts for this buyer
      const cartsResult = await pool.query(
        `SELECT sc.*, f.first_name, f.last_name, f.mobile
         FROM shopping_carts sc
         LEFT JOIN farmers f ON sc.seller_id = f.id
         WHERE sc.buyer_id = $1 AND sc.status = 'active'
         ORDER BY sc.created_at DESC`,
        [resolvedBuyerId]
      );

      const cartsWithItems = await Promise.all(
        cartsResult.rows.map(async (cart: any) => {
          const itemsResult = await pool.query(
            `SELECT 
              ci.*,
              mp.product_name,
              mp.unit,
              mp.farmer_id as seller_id,
              (ci.quantity * ci.unit_price) as item_total
             FROM cart_items ci
             LEFT JOIN marketplace_products mp ON ci.marketplace_product_id = mp.id
             WHERE ci.cart_id = $1`,
            [cart.id]
          );

          const total = itemsResult.rows.reduce((sum: number, item: any) =>
            sum + (item.quantity * item.unit_price), 0
          );

          return {
            cart,
            items: itemsResult.rows,
            seller: {
              first_name: cart.first_name,
              last_name: cart.last_name,
              mobile: cart.mobile,
            },
            total,
          };
        })
      );

      res.json({carts: cartsWithItems});
    } catch (err) {
      console.error("Error fetching cart:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // POST /marketplace/cart/add
  marketplaceRegistry.registerPath({
    method: "post",
    path: "/marketplace/cart/add",
    description: "Add item to shopping cart",
    request: {
      body: {
        content: {
          "application/json": {schema: AddToCartSchema},
        },
      },
    },
    responses: {
      200: {
        description: "Item added to cart successfully",
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
              cart_id: z.string().uuid(),
              item_id: z.string().uuid(),
            }),
          },
        },
      },
      400: {description: "Validation error or insufficient stock"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/cart/add",
    validateRequest(AddToCartSchema),
    async (req: Request<object, object, AddToCart & { buyer_id: string }>, res: Response) => {
      const {marketplace_product_id, quantity} = req.body;
      const buyer_id = req.body.buyer_id || (req as any).user?.farmer_id;

      if (!buyer_id) {
        return res.status(400).json({error: "Buyer ID is required"});
      }

      try {
        const resolvedBuyerId = await resolveFarmerId(pool, buyer_id);

        // 1. Get product details and verify stock
        const product = await getOneOrNone(
          pool,
          `SELECT 
            mp.*,
            fp.quantity as farm_quantity,
            mp.quantity as market_quantity
           FROM marketplace_products mp
           LEFT JOIN farm_products fp ON mp.farm_product_id = fp.id
           WHERE mp.id = $1 AND mp.status = 'available'`,
          [marketplace_product_id]
        );

        if (!product) {
          return res.status(404).json({error: "Product not available"});
        }

        if (product.market_quantity < quantity) {
          return res.status(400).json({
            error: `Insufficient stock. Only ${product.market_quantity} available`,
          });
        }

        // 2. Get or create cart for this buyer-seller pair
        const cartResult = await pool.query(
          `SELECT id FROM shopping_carts 
           WHERE buyer_id = $1 AND seller_id = $2 AND status = 'active'`,
          [resolvedBuyerId, product.farmer_id]
        );

        let cart = cartResult.rows[0];

        if (!cart) {
          const newCartResult = await pool.query(
            `INSERT INTO shopping_carts (buyer_id, seller_id) 
             VALUES ($1, $2) RETURNING id`,
            [resolvedBuyerId, product.farmer_id]
          );
          cart = newCartResult.rows[0];
        }

        // 3. Check if item already in cart
        const existingItemResult = await pool.query(
          `SELECT id, quantity FROM cart_items 
           WHERE cart_id = $1 AND marketplace_product_id = $2`,
          [cart.id, marketplace_product_id]
        );

        const existingItem = existingItemResult.rows[0];

        if (existingItem) {
          // Update quantity
          const newQuantity = existingItem.quantity + quantity;
          if (newQuantity > product.market_quantity) {
            return res.status(400).json({
              error: `Cannot add ${quantity} more. Total would exceed available stock`,
            });
          }

          await pool.query(
            `UPDATE cart_items 
             SET quantity = $1, created_at = NOW()
             WHERE id = $2`,
            [newQuantity, existingItem.id]
          );

          return res.json({
            message: "Cart item quantity updated",
            cart_id: cart.id,
            item_id: existingItem.id,
          });
        }

        // 4. Add new item to cart
        const itemResult = await pool.query(
          `INSERT INTO cart_items 
           (cart_id, marketplace_product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [cart.id, marketplace_product_id, quantity, product.price]
        );

        res.json({
          message: "Item added to cart",
          cart_id: cart.id,
          item_id: itemResult.rows[0].id,
        });
      } catch (err) {
        console.error("Error adding to cart:", err);
        res.status(500).json({error: "Internal server error"});
      }
    }
  );

  // DELETE /marketplace/cart/item/:itemId
  router.delete("/cart/item/:itemId", async (req: Request, res: Response) => {
    try {
      const {itemId} = req.params;
      const buyer_id = req.body.buyer_id || (req as any).user?.farmer_id;

      if (!buyer_id) {
        return res.status(400).json({error: "Buyer ID is required"});
      }

      const resolvedBuyerId = await resolveFarmerId(pool, buyer_id);

      // Verify ownership and delete
      const result = await pool.query(
        `DELETE FROM cart_items ci
         USING shopping_carts sc
         WHERE ci.id = $1 
           AND ci.cart_id = sc.id 
           AND sc.buyer_id = $2
         RETURNING ci.id`,
        [itemId, resolvedBuyerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Item not found in your cart"});
      }

      res.json({message: "Item removed from cart", id: result.rows[0].id});
    } catch (err) {
      console.error("Error removing cart item:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // CHECKOUT & ORDER ENDPOINTS
  // ============================================

  // POST /marketplace/cart/checkout
  marketplaceRegistry.registerPath({
    method: "post",
    path: "/marketplace/cart/checkout",
    description: "Checkout cart and create order",
    request: {
      body: {
        content: {
          "application/json": {schema: CheckoutSchema},
        },
      },
    },
    responses: {
      200: {
        description: "Order created successfully",
        content: {
          "application/json": {
            schema: z.object({
              order_id: z.string().uuid(),
              order_number: z.string(),
              total_amount: z.number(),
              payment_required: z.boolean(),
            }),
          },
        },
      },
      400: {description: "Validation error or insufficient funds/stock"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/cart/checkout",
    validateRequest(CheckoutSchema),
    async (req: Request<object, object, Checkout & { buyer_id: string }>, res: Response) => {
      const {cart_id, shipping_address, payment_method = "wallet", notes} = req.body;
      const buyer_id = req.body.buyer_id || (req as any).user?.farmer_id;

      if (!buyer_id) {
        return res.status(400).json({error: "Buyer ID is required"});
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const resolvedBuyerId = await resolveFarmerId(client, buyer_id);

        // 1. Verify cart exists and get items
        const cartResult = await client.query(
          `SELECT sc.*, f.first_name as seller_name 
           FROM shopping_carts sc
           LEFT JOIN farmers f ON sc.seller_id = f.id
           WHERE sc.id = $1 AND sc.buyer_id = $2 AND sc.status = 'active'`,
          [cart_id, resolvedBuyerId]
        );

        if (cartResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({error: "Cart not found"});
        }

        const cart = cartResult.rows[0];

        const cartItemsResult = await client.query(
          `SELECT 
            ci.*,
            mp.product_name,
            mp.quantity as available_quantity,
            mp.farmer_id,
            mp.price as current_price
           FROM cart_items ci
           LEFT JOIN marketplace_products mp ON ci.marketplace_product_id = mp.id
           WHERE ci.cart_id = $1`,
          [cart_id]
        );

        if (cartItemsResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({error: "Cart is empty"});
        }

        // 2. Validate stock and calculate total
        let totalAmount = 0;
        const orderItems = [];

        for (const item of cartItemsResult.rows) {
          if (item.quantity > item.available_quantity) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              error: `Insufficient stock for ${item.product_name}`,
            });
          }

          const itemTotal = item.quantity * item.unit_price;
          totalAmount += itemTotal;

          orderItems.push({
            marketplace_product_id: item.marketplace_product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: itemTotal,
          });
        }

        // 3. Create order
        const orderNumber = generateOrderNumber();
        const orderResult = await client.query(
          `INSERT INTO marketplace_orders (
            order_number, buyer_id, seller_id, total_amount,
            shipping_address, payment_method, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            orderNumber,
            resolvedBuyerId,
            cart.seller_id,
            totalAmount,
            shipping_address,
            payment_method,
            notes,
          ]
        );

        const orderId = orderResult.rows[0].id;

        // 4. Create order items
        for (const item of orderItems) {
          await client.query(
            `INSERT INTO order_items (
              order_id, marketplace_product_id, product_name,
              quantity, unit_price, total_price
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              orderId,
              item.marketplace_product_id,
              item.product_name,
              item.quantity,
              item.unit_price,
              item.total_price,
            ]
          );

          // 5. Update marketplace product quantity
          await client.query(
            `UPDATE marketplace_products 
             SET quantity = quantity - $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.marketplace_product_id]
          );
        }

        // 6. Update cart status
        await client.query(
          `UPDATE shopping_carts 
           SET status = 'pending', updated_at = NOW()
           WHERE id = $1`,
          [cart_id]
        );

        await client.query("COMMIT");

        res.json({
          order_id: orderId,
          order_number: orderNumber,
          total_amount: totalAmount,
          payment_required: payment_method === "wallet",
          message: "Order created successfully",
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Error during checkout:", err);
        res.status(500).json({error: "Internal server error"});
      } finally {
        client.release();
      }
    }
  );

  // GET /marketplace/orders/buyer/:buyerId
  router.get("/orders/buyer/:buyerId", async (req: Request, res: Response) => {
    try {
      const {buyerId} = req.params;
      const {status, page = 1, limit = 20} = req.query;

      const resolvedBuyerId = await resolveFarmerId(pool, buyerId);
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      const offset = (pageNum - 1) * limitNum;

      let whereClause = "WHERE buyer_id = $1";
      const params: any[] = [resolvedBuyerId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        params.push(status);
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM marketplace_orders ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get orders
      params.push(limitNum);
      params.push(offset);

      const ordersResult = await pool.query(
        `SELECT 
          mo.*,
          f.first_name as seller_first_name,
          f.last_name as seller_last_name,
          f.mobile as seller_mobile
         FROM marketplace_orders mo
         LEFT JOIN farmers f ON mo.seller_id = f.id
         ${whereClause}
         ORDER BY mo.created_at DESC
         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
      );

      // Get items for each order
      const ordersWithItems = await Promise.all(
        ordersResult.rows.map(async (order: any) => {
          const itemsResult = await pool.query(
            "SELECT * FROM order_items WHERE order_id = $1",
            [order.id]
          );
          return {...order, items: itemsResult.rows};
        })
      );

      res.json({
        data: ordersWithItems,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      });
    } catch (err) {
      console.error("Error fetching buyer orders:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // GET /marketplace/orders/seller/:sellerId
  router.get("/orders/seller/:sellerId", async (req: Request, res: Response) => {
    try {
      const {sellerId} = req.params;
      const {status, page = 1, limit = 20} = req.query;

      const resolvedSellerId = await resolveFarmerId(pool, sellerId);
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 20;
      const offset = (pageNum - 1) * limitNum;

      let whereClause = "WHERE seller_id = $1";
      const params: any[] = [resolvedSellerId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        params.push(status);
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM marketplace_orders ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get orders
      params.push(limitNum);
      params.push(offset);

      const ordersResult = await pool.query(
        `SELECT 
          mo.*,
          f.first_name as buyer_first_name,
          f.last_name as buyer_last_name,
          f.mobile as buyer_mobile
         FROM marketplace_orders mo
         LEFT JOIN farmers f ON mo.buyer_id = f.id
         ${whereClause}
         ORDER BY mo.created_at DESC
         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
      );

      // Get items for each order
      const ordersWithItems = await Promise.all(
        ordersResult.rows.map(async (order: any) => {
          const itemsResult = await pool.query(
            "SELECT * FROM order_items WHERE order_id = $1",
            [order.id]
          );
          return {...order, items: itemsResult.rows};
        })
      );

      res.json({
        data: ordersWithItems,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      });
    } catch (err) {
      console.error("Error fetching seller orders:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // POST /marketplace/orders/:orderId/pay
  router.post(
    "/orders/:orderId/pay",
    validateRequest(PaymentRequestSchema),
    async (req: Request, res: Response) => {
      const {orderId} = req.params;
      const {payment_method, phone_number, account_number} = req.body;
      const buyer_id = req.body.buyer_id || (req as any).user?.farmer_id;

      if (!buyer_id) {
        return res.status(400).json({error: "Buyer ID is required"});
      }

      try {
        const resolvedBuyerId = await resolveFarmerId(pool, buyer_id);

        // Get order details
        const orderResult = await pool.query(
          `SELECT * FROM marketplace_orders 
           WHERE id = $1 AND buyer_id = $2 AND payment_status = 'pending'`,
          [orderId, resolvedBuyerId]
        );

        if (orderResult.rows.length === 0) {
          return res.status(404).json({error: "Order not found or already paid"});
        }

        const order = orderResult.rows[0];

        // Use existing wallet payment endpoint
        // For now, simulate payment success
        await pool.query(
          `UPDATE marketplace_orders 
           SET payment_status = 'paid',
               payment_method = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [payment_method, orderId]
        );

        // Record wallet transaction (using your existing wallet logic)
        // This would integrate with your /wallet/payment endpoint
        const walletTransaction = {
          farmer_id: resolvedBuyerId,
          destination: order.seller_id,
          amount: order.total_amount,
          service: "marketplace_purchase",
          merchant: `Order: ${order.order_number}`,
        };

        // Call your existing wallet payment endpoint
        // await processWalletPayment(walletTransaction);

        res.json({
          success: true,
          message: "Payment processed successfully",
          order_id: orderId,
          payment_status: "paid",
        });
      } catch (err) {
        console.error("Error processing payment:", err);
        res.status(500).json({error: "Internal server error"});
      }
    }
  );

  // PUT /marketplace/orders/:orderId/status
  router.put(
    "/orders/:orderId/status",
    validateRequest(OrderStatusUpdateSchema),
    async (req: Request, res: Response) => {
      const {orderId} = req.params;
      const {status, tracking_number, delivery_date} = req.body;
      const farmer_id = req.body.farmer_id || (req as any).user?.farmer_id;

      if (!farmer_id) {
        return res.status(400).json({error: "Farmer ID is required"});
      }

      try {
        const resolvedFarmerId = await resolveFarmerId(pool, farmer_id);

        // Verify seller owns this order
        const orderResult = await pool.query(
          `SELECT * FROM marketplace_orders 
           WHERE id = $1 AND seller_id = $2`,
          [orderId, resolvedFarmerId]
        );

        if (orderResult.rows.length === 0) {
          return res.status(403).json({
            error: "Not authorized to update this order",
          });
        }

        // Update order status
        const updateQuery = tracking_number ?
          `UPDATE marketplace_orders 
             SET status = $1,
                 shipping_address = COALESCE($3, shipping_address),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *` :
          `UPDATE marketplace_orders 
             SET status = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *`;

        const updateParams = tracking_number ?
          [status, orderId, tracking_number] :
          [status, orderId];

        const result = await pool.query(updateQuery, updateParams);

        // If order is delivered, update product sales count
        if (status === "delivered") {
          await pool.query(
            `UPDATE marketplace_products mp
             SET total_sales = total_sales + oi.quantity,
                 updated_at = NOW()
             FROM order_items oi
             WHERE oi.order_id = $1 
               AND oi.marketplace_product_id = mp.id`,
            [orderId]
          );
        }

        res.json({
          success: true,
          order: result.rows[0],
          message: `Order status updated to ${status}`,
        });
      } catch (err) {
        console.error("Error updating order status:", err);
        res.status(500).json({error: "Internal server error"});
      }
    }
  );

  return router;
};
