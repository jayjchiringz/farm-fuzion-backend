/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fs from "fs";
import path from "path";
import {parse, ParseResult} from "papaparse";
import {initDbPool, DbConfig} from "../db";
import {WorldBankPriceSchema} from "../../validation/worldBankPriceSchema";
import * as dotenv from "dotenv";
import {PoolClient} from "pg";

dotenv.config(); // Load .env when running locally

interface Row {
  YearMonth: string;
  [key: string]: string;
}

// Define type-safe row structure
interface CandidateRow {
  date: string;
  commodity: string;
  unit: string;
  price: number;
}

// Define error types
interface CsvParseError {
  row?: number;
  message: string;
  code?: string;
}

const parseYearMonth = (ym: string): string => {
  const year = ym.slice(0, 4);
  const month = ym.slice(5, 7);
  return `${year}-${month}-01`; // YYYY-MM-01
};

const parseHeader = (header: string) => {
  const parts = header.split("\n").map((s) => s.trim());
  return {
    commodity: parts[0],
    unit: parts[1]?.replace(/[()]/g, "") || "",
  };
};

export const importWorldBank = async (config: DbConfig, csvPath: string): Promise<void> => {
  const pool = initDbPool(config);

  try {
    const csvFile = fs.readFileSync(path.resolve(csvPath), "utf8");
    const parsed: ParseResult<Row> = parse<Row>(csvFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      console.warn("⚠️ CSV parse issues detected:");
      parsed.errors.forEach((err: CsvParseError) => {
        console.warn(
          `  → Row ${err.row ?? "?"}: ${err.message} (code: ${err.code})`
        );
        if (typeof err.row === "number" && parsed.data[err.row]) {
          console.log("  🔎 Problematic row data:", parsed.data[err.row]);
        }
      });
    }

    const headers = parsed.meta.fields?.filter((f) => f !== "YearMonth") || [];
    const headerMap = headers.map((h) => ({raw: h, ...parseHeader(h)}));

    console.log(`🛠️ Found ${headerMap.length} commodities in CSV`);

    const client = await pool.connect();
    try {
      let counter = 0;
      let skipped = 0;
      const batchSize = 250; // Safe batch size
      let buffer: CandidateRow[] = [];

      for (const row of parsed.data as Row[]) {
        if (!row.YearMonth) continue;
        const date = parseYearMonth(row.YearMonth);

        for (const h of headerMap) {
          const val = row[h.raw];
          if (!val || val.trim() === "…" || val.trim() === "") {
            skipped++;
            continue;
          }

          const price = parseFloat(val);
          if (isNaN(price)) {
            skipped++;
            continue;
          }

          const candidate: CandidateRow = {
            date,
            commodity: h.commodity,
            unit: h.unit,
            price,
          };

          const parsedRow = WorldBankPriceSchema.safeParse(candidate);
          if (!parsedRow.success) {
            skipped++;
            continue;
          }

          buffer.push(candidate);
          counter++;

          // Flush when buffer hits batchSize
          if (buffer.length >= batchSize) {
            await insertBatch(client, buffer);
            console.log(`✅ Inserted ${counter} rows so far...`);
            buffer = [];
          }
        }
      }

      // Insert remaining rows
      if (buffer.length > 0) {
        await insertBatch(client, buffer);
        console.log(`✅ Final flush of ${buffer.length} rows`);
      }

      console.log(
        `🎉 Import complete. Inserted ${counter} rows, skipped ${skipped}.`
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error("❌ Import failed:", error.message);
      throw error;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ Failed to read or parse CSV file:", error.message);
    throw error;
  }
};

const insertBatch = async (
  client: PoolClient,
  rows: CandidateRow[]
): Promise<void> => {
  if (rows.length === 0) return;

  const values: (string | number)[] = [];
  const placeholders = rows.map((row, i) => {
    const idx = i * 4;
    values.push(row.date, row.commodity, row.unit, row.price);
    return `($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`;
  });

  const query = `
    INSERT INTO worldbank_prices (date, commodity, unit, price)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (date, commodity, unit) DO NOTHING;
  `;

  await client.query(query, values);
};

// Run directly if invoked
if (require.main === module) {
  // Load environment variables
  dotenv.config();

  // Validate required environment variables
  const requiredEnvVars = ["PGUSER", "PGPASS", "PGHOST", "PGDB", "PGPORT"];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  const config: DbConfig = {
    PGUSER: process.env.PGUSER!,
    PGPASS: process.env.PGPASS!,
    PGHOST: process.env.PGHOST!,
    PGDB: process.env.PGDB!,
    PGPORT: process.env.PGPORT!,
  };

  console.log("🔐 Using environment variables for database connection");

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("❌ Usage: ts-node importWorldBank.ts <path/to/file.csv>");
    console.error("   Example: ts-node importWorldBank.ts ./data/worldbank-prices.csv");
    process.exit(1);
  }

  importWorldBank(config, csvPath)
    .then(() => {
      console.log("✅ Import completed successfully");
      process.exit(0);
    })
    .catch((error: Error) => {
      console.error("❌ Import failed:", error.message);
      process.exit(1);
    });
}
