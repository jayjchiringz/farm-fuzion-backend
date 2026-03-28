/* eslint-disable camelcase */
/* eslint-disable max-len */
import express, {Request, Response} from "express";
import {initDbPool} from "../utils/db";
import {authenticateJWT, getUserId, getUser} from "../middleware/auth";
import {v4 as uuidv4} from "uuid";

// Import schemas from validation folder
import {
  PublishToCooperativeSchema,
  CooperativeProductSchema,
  RecallProductSchema,
  UpdateOrderStatusSchema,
  TenderResponseSchema,
} from "../validation/cooperativeSchema";

// Define AppConfig type
interface AppConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
}

export const getCooperativesRouter = (config: AppConfig) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // Middleware to authenticate all cooperative routes
  router.use(authenticateJWT);

  // ============================================
  // GET /cooperatives/my - Get current user's group/cooperative
  // ============================================
  router.get("/my", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      // Get user's group info
      const user = getUser(req);
      console.log(`Fetching cooperative for user: ${user?.email} (${userId})`);

      // Get the group associated with this user (as group admin)
      const result = await pool.query(
        `SELECT 
          g.id,
          g.name,
          g.registration_number,
          g.county,
          g.constituency,
          g.ward,
          g.location,
          g.description,
          g.status,
          g.created_at
        FROM groups g
        INNER JOIN group_admins ga ON ga.group_id = g.id
        WHERE ga.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({error: "No group/cooperative found for this user"});
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching cooperative:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // GET /cooperatives/products - Get group products
  // ============================================
  router.get("/products", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      // First get the group ID for this user from group_admins
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Get products for this group - include source farmer info
      const result = await pool.query(
        `SELECT 
          cp.id,
          cp.group_id,
          cp.product_name,
          cp.category,
          cp.quantity,
          cp.unit,
          cp.price_per_unit,
          cp.currency,
          (cp.quantity * cp.price_per_unit) as total_price,
          cp.available,
          cp.harvest_date,
          cp.expiry_date,
          cp.certification,
          cp.description,
          cp.images,
          cp.created_at,
          cp.source_farmer_id,
          cp.source_farm_product_id,
          f.first_name || ' ' || f.last_name as source_farmer_name
        FROM cooperative_products cp
        LEFT JOIN farmers f ON cp.source_farmer_id = f.id
        WHERE cp.group_id = $1
        ORDER BY cp.created_at DESC`,
        [groupId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // POST /cooperatives/products - Create new product (Group Admin)
  // ============================================
  router.post("/products", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const validation = CooperativeProductSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({error: validation.error.errors[0].message});
        return;
      }

      const data = validation.data;

      // Get group ID from group_admins
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Insert product
      const result = await pool.query(
        `INSERT INTO cooperative_products (
          id, group_id, product_name, category, quantity, unit,
          price_per_unit, currency, available, certification, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, product_name, quantity, unit, price_per_unit, currency,
                  (quantity * price_per_unit) as total_price, available, created_at`,
        [
          uuidv4(),
          groupId,
          data.product_name,
          data.category || null,
          data.quantity,
          data.unit,
          data.price_per_unit,
          data.currency,
          data.available,
          data.certification || null,
          data.description || null,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // POST /cooperatives/products/publish - Farmer publishes to cooperative
  // ============================================
  router.post("/products/publish", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const validation = PublishToCooperativeSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({error: validation.error.errors[0].message});
        return;
      }

      const data = validation.data;

      // Get farmer's numeric ID
      const farmerResult = await pool.query(
        "SELECT id FROM farmers WHERE user_id = $1",
        [userId]
      );

      if (farmerResult.rows.length === 0) {
        res.status(404).json({error: "Farmer profile not found"});
        return;
      }

      const farmerId = farmerResult.rows[0].id;

      // Get the group the farmer belongs to
      const groupResult = await pool.query(
        "SELECT group_id FROM farmers WHERE id = $1",
        [farmerId]
      );

      if (groupResult.rows.length === 0 || !groupResult.rows[0].group_id) {
        res.status(404).json({error: "Farmer not assigned to any group"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Check if product already published to this group
      const existingProduct = await pool.query(
        `SELECT id FROM cooperative_products 
        WHERE source_farm_product_id = $1 AND group_id = $2`,
        [data.farm_product_id, groupId]
      );

      if (existingProduct.rows.length > 0) {
        res.status(409).json({error: "Product already published to this cooperative"});
        return;
      }

      // Insert into cooperative_products with source tracking
      const result = await pool.query(
        `INSERT INTO cooperative_products (
          id, group_id, product_name, category, quantity, unit,
          price_per_unit, currency, available, certification, description,
          source_farmer_id, source_farm_product_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          uuidv4(),
          groupId,
          data.product_name,
          data.category || null,
          data.quantity,
          data.unit,
          data.price_per_unit,
          "KES",
          true,
          data.certification || null,
          data.description || null,
          farmerId,
          data.farm_product_id,
        ]
      );

      // Also update the farmer's product to mark it as published to cooperative
      await pool.query(
        `UPDATE farm_products 
        SET cooperative_published = TRUE, cooperative_product_id = $1
        WHERE id = $2`,
        [result.rows[0].id, data.farm_product_id]
      );

      res.status(201).json({
        id: result.rows[0].id,
        message: "Product published to cooperative marketplace successfully",
      });
    } catch (error) {
      console.error("Error publishing to cooperative:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // POST /cooperatives/products/:id/recall - Recall product back to farmer
  // ============================================
  router.post("/products/:id/recall", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      // Verify user is group admin
      const isGroupAdmin = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (isGroupAdmin.rows.length === 0) {
        res.status(403).json({error: "Only group admins can recall products"});
        return;
      }

      const validation = RecallProductSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({error: validation.error.errors[0].message});
        return;
      }

      const {quantity, reason} = validation.data;
      const productId = req.params.id;

      await client.query("BEGIN");

      // Get the cooperative product
      const productResult = await client.query(
        "SELECT * FROM cooperative_products WHERE id = $1",
        [productId]
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({error: "Product not found"});
        return;
      }

      const product = productResult.rows[0];

      if (quantity > product.quantity) {
        await client.query("ROLLBACK");
        res.status(400).json({error: "Cannot recall more than available quantity"});
        return;
      }

      // Update cooperative product quantity
      await client.query(
        `UPDATE cooperative_products 
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2`,
        [quantity, productId]
      );

      // If product has source tracking, update farmer's inventory
      if (product.source_farm_product_id) {
        await client.query(
          `UPDATE farm_products 
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE id = $2`,
          [quantity, product.source_farm_product_id]
        );

        // Log the recall transaction
        await client.query(
          `INSERT INTO inventory_transactions (
            id, farm_product_id, cooperative_product_id, quantity, type, reason, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            product.source_farm_product_id,
            productId,
            quantity,
            "recall",
            reason,
            userId,
          ]
        );
      }

      // If quantity becomes zero, mark as unavailable
      if (product.quantity - quantity <= 0) {
        await client.query(
          `UPDATE cooperative_products 
          SET available = FALSE 
          WHERE id = $1`,
          [productId]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: `Successfully recalled ${quantity} ${product.unit} back to farmer inventory`,
        recalled_quantity: quantity,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error recalling product:", error);
      res.status(500).json({error: "Internal server error"});
    } finally {
      client.release();
    }
  });

  // ============================================
  // PATCH /cooperatives/products/:id - Update product
  // ============================================
  router.patch("/products/:id", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const productId = req.params.id;
      const updates = req.body;

      // Get group ID
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Verify product belongs to this group
      const productCheck = await pool.query(
        "SELECT id FROM cooperative_products WHERE id = $1 AND group_id = $2",
        [productId, groupId]
      );

      if (productCheck.rows.length === 0) {
        res.status(404).json({error: "Product not found"});
        return;
      }

      // Build dynamic update query
      const allowedFields = ["product_name", "category", "quantity", "unit", "price_per_unit", "available", "certification", "description"];
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${paramIndex}`);
          values.push(updates[field]);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        res.status(400).json({error: "No fields to update"});
        return;
      }

      values.push(productId);

      const result = await pool.query(
        `UPDATE cooperative_products 
         SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${paramIndex}
         RETURNING id, product_name, quantity, unit, price_per_unit, currency,
                   (quantity * price_per_unit) as total_price, available, created_at`,
        values
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // DELETE /cooperatives/products/:id - Delete product
  // ============================================
  router.delete("/products/:id", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const productId = req.params.id;

      // Get group ID
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Verify and delete
      const result = await pool.query(
        `DELETE FROM cooperative_products 
         WHERE id = $1 AND group_id = $2
         RETURNING id`,
        [productId, groupId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({error: "Product not found"});
        return;
      }

      res.json({message: "Product deleted successfully", id: productId});
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // GET /cooperatives/orders - Get orders for group products
  // ============================================
  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      // Get group ID
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Get orders for products from this group
      const result = await pool.query(
        `SELECT 
          bo.id,
          bo.cooperative_product_id,
          cp.product_name,
          bo.buyer_name,
          bo.buyer_company,
          bo.buyer_email,
          bo.buyer_phone,
          bo.buyer_country,
          bo.quantity,
          bo.total_amount,
          COALESCE(bo.status, 'pending') as status,
          bo.shipping_address,
          bo.shipping_method,
          bo.tracking_number,
          bo.created_at
        FROM bulk_orders bo
        INNER JOIN cooperative_products cp ON bo.cooperative_product_id = cp.id
        WHERE cp.group_id = $1
        ORDER BY bo.created_at DESC`,
        [groupId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // PATCH /cooperatives/orders/:id - Update order status
  // ============================================
  router.patch("/orders/:id", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const orderId = req.params.id;
      const validation = UpdateOrderStatusSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({error: validation.error.errors[0].message});
        return;
      }

      const {status, tracking_number} = validation.data;

      // Get group ID
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Verify order belongs to this group's product
      const orderCheck = await pool.query(
        `SELECT bo.id FROM bulk_orders bo
         INNER JOIN cooperative_products cp ON bo.cooperative_product_id = cp.id
         WHERE bo.id = $1 AND cp.group_id = $2`,
        [orderId, groupId]
      );

      if (orderCheck.rows.length === 0) {
        res.status(404).json({error: "Order not found"});
        return;
      }

      // Update order
      await pool.query(
        `UPDATE bulk_orders 
         SET status = $1, tracking_number = COALESCE($2, tracking_number), updated_at = NOW()
         WHERE id = $3`,
        [status, tracking_number, orderId]
      );

      res.json({message: "Order status updated", order_id: orderId, status});
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // GET /cooperatives/tenders/open - Get open tenders
  // ============================================
  router.get("/tenders/open", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT 
          id,
          title,
          description,
          category,
          quantity_needed,
          unit,
          deadline,
          buyer_name,
          buyer_company,
          buyer_email,
          status,
          created_at
        FROM tenders
        WHERE status = 'open' AND deadline > NOW()
        ORDER BY deadline ASC`,
        []
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching tenders:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // POST /cooperatives/tenders/:id/respond - Respond to tender
  // ============================================
  router.post("/tenders/:id/respond", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);

      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const tenderId = req.params.id;
      const validation = TenderResponseSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({error: validation.error.errors[0].message});
        return;
      }

      const {offered_price, available_quantity, delivery_timeline, message} = validation.data;

      // Get group ID
      const groupResult = await pool.query(
        "SELECT group_id FROM group_admins WHERE user_id = $1",
        [userId]
      );

      if (groupResult.rows.length === 0) {
        res.status(404).json({error: "No group found"});
        return;
      }

      const groupId = groupResult.rows[0].group_id;

      // Check if tender exists and is open
      const tenderCheck = await pool.query(
        "SELECT id FROM tenders WHERE id = $1 AND status = 'open' AND deadline > NOW()",
        [tenderId]
      );

      if (tenderCheck.rows.length === 0) {
        res.status(404).json({error: "Tender not found or closed"});
        return;
      }

      // Check if already responded
      const existingResponse = await pool.query(
        `SELECT id FROM tender_responses 
         WHERE tender_id = $1 AND group_id = $2`,
        [tenderId, groupId]
      );

      if (existingResponse.rows.length > 0) {
        res.status(400).json({error: "You have already responded to this tender"});
        return;
      }

      // Create response
      const result = await pool.query(
        `INSERT INTO tender_responses (
          id, tender_id, group_id, offered_price, available_quantity,
          delivery_timeline, message, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          uuidv4(),
          tenderId,
          groupId,
          offered_price,
          available_quantity,
          delivery_timeline,
          message || null,
          "pending",
        ]
      );

      res.json({
        message: "Tender response submitted successfully",
        response_id: result.rows[0].id,
      });
    } catch (error) {
      console.error("Error responding to tender:", error);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ============================================
  // PATCH /cooperatives/orders/:id/complete - Complete order and update inventory
  // ============================================
  router.patch("/orders/:id/complete", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({error: "User not authenticated"});
        return;
      }

      const orderId = req.params.id;

      await client.query("BEGIN");

      // Get order details
      const orderResult = await client.query(
        "SELECT * FROM bulk_orders WHERE id = $1",
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({error: "Order not found"});
        return;
      }

      const order = orderResult.rows[0];

      // Get the cooperative product
      const productResult = await client.query(
        "SELECT * FROM cooperative_products WHERE id = $1",
        [order.cooperative_product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({error: "Product not found"});
        return;
      }

      const product = productResult.rows[0];

      // Deduct from cooperative product
      await client.query(
        `UPDATE cooperative_products 
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2`,
        [order.quantity, order.cooperative_product_id]
      );

      // If product has source tracking, deduct from farmer's inventory
      if (product.source_farm_product_id) {
        await client.query(
          `UPDATE farm_products 
          SET quantity = quantity - $1, updated_at = NOW()
          WHERE id = $2`,
          [order.quantity, product.source_farm_product_id]
        );

        // Log the sale transaction
        await client.query(
          `INSERT INTO inventory_transactions (
            id, farm_product_id, cooperative_product_id, order_id, quantity, type, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            product.source_farm_product_id,
            order.cooperative_product_id,
            orderId,
            order.quantity,
            "sale",
            userId,
          ]
        );
      }

      // Update order status
      await client.query(
        `UPDATE bulk_orders 
        SET status = 'delivered', updated_at = NOW()
        WHERE id = $1`,
        [orderId]
      );

      await client.query("COMMIT");

      res.json({message: "Order completed successfully"});
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error completing order:", error);
      res.status(500).json({error: "Internal server error"});
    } finally {
      client.release();
    }
  });

  return router;
};
