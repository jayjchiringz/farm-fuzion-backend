/* eslint-disable camelcase */
import express, {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import {PaymentSchema} from "../validation/paymentSchema";
import {initDbPool} from "../utils/db";

const WrappedPaymentSchema = {
  validate: (data: unknown) => {
    const result = PaymentSchema.safeParse(data);
    if (!result.success) {
      return {
        error: {
          details: result.error.issues.map((issue) => ({
            message: issue.message,
          })),
        },
      };
    }
    return {};
  },
};

interface ValidationSchema {
  validate: (data: unknown) => { error?: { details: { message: string }[] } };
}

export const validateRequest =
  (schema: ValidationSchema): RequestHandler =>
    (req: Request, res: Response, next: NextFunction): void => {
      const {error} = schema.validate(req.body);
      if (error) {
        res.status(400).json({error: error.details[0].message});
        return;
      }
      next();
    };

export const getPaymentsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.post("/", validateRequest(WrappedPaymentSchema), async (req, res) => {
    const {
      declaration_id,
      farmer_id,
      business_id,
      tax_id,
      tax_obligation,
      payment_date,
      reference_no,
      payment_type,
      paid_amount,
      paid,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO tax_payments 
          (
            declaration_id,
            farmer_id,
            business_id,
            tax_id,
            tax_obligation,
            payment_date,
            reference_no,
            payment_type,
            paid_amount,
            paid
          )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          declaration_id,
          farmer_id,
          business_id,
          tax_id,
          tax_obligation,
          payment_date,
          reference_no,
          payment_type,
          paid_amount,
          paid,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating payment:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM tax_payments");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching payments:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM tax_payments WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmer payments:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
