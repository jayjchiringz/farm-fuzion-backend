/* eslint-disable @typescript-eslint/no-non-null-assertion */
import fs from "fs";
import path from "path";
import {parse} from "papaparse";
import {initDbPool, DbConfig} from "../db";
import {WorldBankPriceSchema} from "../../validation/worldBankPriceSchema";

interface Row {
  YearMonth: string;
  [key: string]: string;
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

export const importWorldBank = async (config: DbConfig, csvPath: string) => {
  const pool = initDbPool(config);
  const csvFile = fs.readFileSync(path.resolve(csvPath), "utf8");
  const parsed = parse<Row>(csvFile, {header: true});

  if (parsed.errors.length > 0) {
    throw new Error("CSV parse errors: " + JSON.stringify(parsed.errors));
  }

  const headers = parsed.meta.fields?.filter((f) => f !== "YearMonth") || [];
  const headerMap = headers.map((h) => ({raw: h, ...parseHeader(h)}));

  console.log(`🛠️ Found ${headerMap.length} commodities in CSV`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of parsed.data) {
      if (!row.YearMonth) continue;
      const date = parseYearMonth(row.YearMonth);

      for (const h of headerMap) {
        const val = row[h.raw];
        if (!val || val.trim() === "…" || val.trim() === "") continue;

        const price = parseFloat(val);
        if (isNaN(price)) continue;

        // ✅ Build candidate row
        const candidate = {
          date,
          commodity: h.commodity,
          unit: h.unit,
          price,
        };

        // ✅ Validate against schema
        const parsedRow = WorldBankPriceSchema.safeParse(candidate);
        if (!parsedRow.success) {
          console.warn("⚠️ Skipping invalid row:", parsedRow.error.errors);
          continue;
        }

        // ✅ Insert if valid
        await client.query(
          `
          INSERT INTO worldbank_prices (date, commodity, unit, price)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (date, commodity, unit) DO NOTHING;
          `,
          [candidate.date, candidate.commodity, candidate.unit, candidate.price]
        );
      }
    }

    await client.query("COMMIT");
    console.log("✅ Import complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Import failed", err);
  } finally {
    client.release();
  }
};

// Run directly if invoked
if (require.main === module) {
  const config: DbConfig = {
    PGUSER: process.env.PGUSER!,
    PGPASS: process.env.PGPASS!,
    PGHOST: process.env.PGHOST!,
    PGDB: process.env.PGDB!,
    PGPORT: process.env.PGPORT!,
  };

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: ts-node importWorldBank.ts <path/to/file.csv>");
    process.exit(1);
  }

  importWorldBank(config, csvPath).catch(console.error);
}
