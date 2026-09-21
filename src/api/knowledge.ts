/* eslint-disable require-jsdoc */
/* eslint-disable camelcase */
/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter/functions/src/api/knowledge.ts
import express, {Request, Response, NextFunction} from "express";
import {initDbPool} from "../utils/db";
import {Pool} from "pg";
import multer from "multer";
import axios, {isAxiosError} from "axios";

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file uploads
const upload = multer({
  limits: {fileSize: 5 * 1024 * 1024}, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  },
});

// Configuration for FreeFlow service
const FREE_FLOW_URL = process.env.FREE_FLOW_URL || "http://localhost:8000";

// Helper to resolve farmer ID (UUID to numeric)
async function resolveFarmerId(db: Pool, farmerId: string | number): Promise<number> {
  const normalized = String(farmerId).trim();
  console.log("🔍 [resolveFarmerId] Input:", normalized);

  // If it's already a number, return it
  if (!isNaN(Number(normalized)) && normalized !== "") {
    return parseInt(normalized, 10);
  }

  // Check if it's a UUID and look up the numeric ID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) {
    console.log("🟢 Input is UUID, looking up numeric ID...");
    const farmerResult = await db.query(
      "SELECT id FROM farmers WHERE user_id = $1",
      [normalized]
    );
    if (farmerResult.rows.length > 0) {
      const numericId = farmerResult.rows[0].id;
      console.log("✅ Resolved UUID to numeric ID:", numericId);
      return numericId;
    }
  }

  throw new Error(`Could not resolve farmer ID: ${normalized}`);
}

// Define types for our knowledge system
interface KnowledgeDocument {
  content: string;
  title: string;
  source: string;
}

interface AIResponse {
  answer: string;
  sources: Array<{ title: string; source: string }>;
}

interface FreeFlowResponse {
  content: string;
  provider: string;
  model: string;
  usage?: Record<string, unknown>;
}

export const getKnowledgeRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  // Store conversation for fine-tuning
  const storeConversation = async (
    farmerId: string,
    query: string,
    response: string,
    sources: unknown[]
  ): Promise<void> => {
    try {
      // First resolve the farmer ID to numeric
      const numericFarmerId = await resolveFarmerId(pool, farmerId);

      await pool.query(
        `INSERT INTO knowledge_conversations 
         (farmer_id, query, response, sources) 
         VALUES ($1, $2, $3, $4)`,
        [numericFarmerId, query, response, JSON.stringify(sources)]
      );
    } catch (error) {
      console.error("Error storing conversation:", error);
      // Don't throw - we don't want to fail the response if storage fails
    }
  };

  // Query knowledge base with RAG
  const queryWithRAG = async (query: string, category?: string): Promise<AIResponse> => {
    // Define a proper type for the query result
    interface DocumentQueryResult {
      rows: KnowledgeDocument[];
    }

    // Declare docs with proper type
    let docs: DocumentQueryResult = {rows: []};

    try {
      // 1. Search vector database for relevant documents
      console.log("📚 Searching knowledge base for:", query);
      const result = await pool.query<KnowledgeDocument>(
        `SELECT content, title, source 
        FROM knowledge_documents 
        WHERE $1::text IS NULL OR category = $1
        LIMIT 5`,
        [category || null]
      );
      docs = result;
      console.log(`📖 Found ${docs.rows.length} relevant documents`);

      // 2. Build context from documents
      const context = docs.rows.map((d: KnowledgeDocument) => d.content).join("\n\n");

      // 3. Create system prompt with context
      const systemPrompt = `You are Mkulima Halisi, a helpful farming assistant for Kenyan farmers. 
  Answer in Swahili or English as appropriate. Provide practical, local farming advice based on Kenyan agriculture.

  Use this context from agricultural research when relevant:
  ${context}`;

      // 4. Call FreeFlow Python service
      console.log("🤖 Calling FreeFlow LLM service at:", FREE_FLOW_URL);

      const response = await axios.post<FreeFlowResponse>(`${FREE_FLOW_URL}/chat`, {
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: query},
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }, {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(`✅ AI response received from provider: ${response.data.provider}`);

      return {
        answer: response.data.content,
        sources: docs.rows.map((d: KnowledgeDocument) => ({
          title: d.title,
          source: d.source,
        })),
      };
    } catch (error: unknown) {
      console.error("❌ Error in queryWithRAG:");

      if (isAxiosError(error)) {
        console.error("FreeFlow service error:", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          code: error.code,
        });

        if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
          console.error("❌ FreeFlow service is not running or unreachable");
          return {
            answer: "Samahani, huduma ya AI kwa sasa haiko tayari. Tafadhali jaribu tena baadaye. (Sorry, the AI service is currently unavailable. Please try again later.)",
            sources: docs.rows.map((d: KnowledgeDocument) => ({
              title: d.title,
              source: d.source,
            })),
          };
        }

        return {
          answer: "Samahani, kuna tatizo la kiufundi. Tafadhali jaribu tena baadaye. (Sorry, there's a technical issue. Please try again later.)",
          sources: docs.rows.map((d: KnowledgeDocument) => ({
            title: d.title,
            source: d.source,
          })),
        };
      }

      console.error("Non-Axios error:", error);
      return {
        answer: "Samahani, kuna tatizo la kiufundi. Tafadhali jaribu tena baadaye. (Sorry, there's a technical issue. Please try again later.)",
        sources: docs.rows.map((d: KnowledgeDocument) => ({
          title: d.title,
          source: d.source,
        })),
      };
    }
  };

  // Analyze plant image (placeholder)
  const analyzePlantImage = async (imageFile: Express.Multer.File): Promise<AIResponse> => {
    console.log("Image received:", imageFile.originalname, imageFile.mimetype);
    return {
      answer: "🌱 Plant Disease Detection coming soon! This feature will help identify diseases from photos.",
      sources: [
        {
          title: "PlantVillage - Penn State University",
          source: "https://plantvillage.psu.edu",
        },
      ],
    };
  };

  // Handle knowledge request (used by both JSON and multipart)
  async function handleKnowledgeRequest(req: MulterRequest, res: Response) {
    try {
      const {query, category, farmer_id} = req.body;
      const imageFile = req.file;

      if (!query && !imageFile) {
        return res.status(400).json({error: "Query or image required"});
      }

      // Handle image upload
      if (imageFile) {
        const imageResult = await analyzePlantImage(imageFile);
        return res.json(imageResult);
      }

      // Handle text query
      const result = await queryWithRAG(query, category);

      // Store for fine-tuning (with ID resolution)
      if (farmer_id) {
        await storeConversation(farmer_id, query, result.answer, result.sources);
      }

      return res.json(result);
    } catch (error) {
      console.error("Knowledge API error:", error);
      return res.status(500).json({error: "Failed to process query"});
    }
  }

  // POST /knowledge/ask - handle both JSON and multipart
  router.post("/ask", (req: Request, res: Response, next: NextFunction) => {
    // Check if it's multipart form data (has file)
    if (req.is("multipart/form-data")) {
      upload.single("image")(req as MulterRequest, res, (err) => {
        if (err) return next(err);
        handleKnowledgeRequest(req as MulterRequest, res);
      });
    } else {
      // Regular JSON request
      express.json()(req, res, () => handleKnowledgeRequest(req as MulterRequest, res));
    }
  });

  // POST /knowledge/feedback
  router.post("/feedback", async (req: Request, res: Response) => {
    try {
      const {message_id, feedback} = req.body;

      if (!message_id || !feedback) {
        return res.status(400).json({error: "message_id and feedback required"});
      }

      await pool.query(
        `UPDATE knowledge_conversations 
         SET feedback_score = $1 
         WHERE id = $2`,
        [feedback === "positive" ? 5 : 1, message_id]
      );

      return res.json({success: true});
    } catch (error) {
      console.error("Feedback error:", error);
      return res.status(500).json({error: "Failed to save feedback"});
    }
  });

  // ============================================================
  // HERO INSIGHTS — rotating marketplace intelligence
  // ============================================================
  const INSIGHT_SYSTEM_PROMPT = `You are Mkulima Halisi, the AI agronomist for FarmFuzion — a Kenyan agricultural marketplace connecting cooperatives to global buyers.

  Generate 4 short, timely, action-oriented insights for the global marketplace hero section. Each insight must be:
  - One sentence, max 160 characters
  - Concrete and specific (mention crops, regions, prices, weather, or seasons)
  - Relevant to Kenyan agriculture right now (weather patterns, planting/harvest windows, price trends, export opportunities, pest risks)
  - Useful to BOTH farmers and international bulk buyers

  Prioritize these topics in order:
  1. Weather risks (El Niño/La Niña, drought, floods) and their agricultural impact
  2. Market price movements or demand signals
  3. Seasonal planting or harvest advisories
  4. Export opportunities or trade developments
  5. Pest/disease alerts

  Output ONLY valid JSON, no markdown fences, no extra text:
  {
    "insights": [
      {"type": "weather", "severity": "warning", "text": "..."},
      {"type": "market", "severity": "info", "text": "..."},
      {"type": "advisory", "severity": "info", "text": "..."},
      {"type": "opportunity", "severity": "info", "text": "..."}
    ]
  }

  Types allowed: weather, market, advisory, opportunity, alert
  Severity allowed: info, warning, critical`;

  interface HeroInsight {
    type: "weather" | "market" | "advisory" | "opportunity" | "alert";
    severity: "info" | "warning" | "critical";
    text: string;
  }

  interface ParsedInsight {
    type?: string;
    severity?: string;
    text: string;
  }

  interface ParsedInsights {
    insights: ParsedInsight[];
  }

  interface InsightsPayload {
    insights: HeroInsight[];
    source: string;
    generated_at: string;
    cached?: boolean;
    cache_age_seconds?: number;
    fallback_reason?: string;
  }

  // In-memory cache — one payload per server instance, refreshed hourly
  let insightsCache: { data: InsightsPayload; ts: number } | null = null;
  const INSIGHTS_TTL_MS = 60 * 60 * 1000; // 1 hour

  async function gatherMarketContext(pool: Pool): Promise<Record<string, unknown>> {
    const month = new Date().toLocaleString("en-US", { month: "long" });
    const year = new Date().getFullYear();

    let products: Array<{ name: string; category?: string; unit?: string }> = [];
    try {
      const r = await pool.query(
        `SELECT product_name AS name, category, unit
        FROM cooperative_products
        WHERE available = TRUE AND quantity > 0
        ORDER BY created_at DESC
        LIMIT 10`
      );
      products = r.rows;
    } catch (e) {
      console.warn("⚠️ Context: cooperative_products unavailable:", e);
    }

    let counties: Array<{ county: string; groups: number }> = [];
    try {
      const r = await pool.query(
        `SELECT MIN(TRIM(county)) AS county, COUNT(*)::int AS groups
        FROM groups
        WHERE status = 'active'
          AND county IS NOT NULL
          AND TRIM(county) <> ''
        GROUP BY LOWER(TRIM(county))
        ORDER BY groups DESC
        LIMIT 6`
      );
      counties = r.rows;
    } catch (e) {
      console.warn("⚠️ Context: groups unavailable:", e);
    }

    return { products, counties, month, year };
  }

  function getFallbackInsights(): InsightsPayload {
    return {
      insights: [
        {
          type: "weather",
          severity: "warning",
          text: "Monitor seasonal rainfall forecasts — short rains typically begin in October across most Kenyan counties.",
        },
        {
          type: "market",
          severity: "info",
          text: "Cross-border demand for Kenyan avocados, French beans and mangoes remains strong in EU and Gulf markets.",
        },
        {
          type: "advisory",
          severity: "info",
          text: "Coffee and tea harvesting in Central Kenya — good window for buyers to secure cooperative contracts.",
        },
        {
          type: "opportunity",
          severity: "info",
          text: "Verified cooperatives now listing directly — transparent pricing, export-ready documentation.",
        },
      ],
      source: "curated",
      generated_at: new Date().toISOString(),
    };
  }

  function parseInsights(raw: string): InsightsPayload {
    let cleaned = (raw || "").trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.split("```")[1];
      if (cleaned.startsWith("json")) cleaned = cleaned.slice(4);
      cleaned = cleaned.trim();
    }

    try {
      const parsed: ParsedInsights = JSON.parse(cleaned);
      if (!parsed || !Array.isArray(parsed.insights)) {
        throw new Error("Missing 'insights' array");
      }

      const validTypes = new Set(["weather", "market", "advisory", "opportunity", "alert"]);
      const validSeverities = new Set(["info", "warning", "critical"]);

      const insights: HeroInsight[] = parsed.insights
        .slice(0, 6)
        .filter((i: ParsedInsight): i is ParsedInsight =>
          typeof i === "object" && i !== null && typeof (i as any).text === "string"
        )
        .map((i: any) => ({
          type: validTypes.has(i.type) ? i.type : "advisory",
          severity: validSeverities.has(i.severity) ? i.severity : "info",
          text: String(i.text).trim().slice(0, 200),
        }))
        .filter((i: HeroInsight): boolean => i.text.length > 0);

      if (insights.length === 0) throw new Error("No valid insights after parsing");

      return {
        insights,
        source: "mkulima_halisi",
        generated_at: new Date().toISOString(),
      };
    } catch (e) {
      console.error("⚠️ Insight parse error:", e);
      console.error("   Raw response preview:", cleaned.slice(0, 300));
      return getFallbackInsights();
    }
  }

  // ============================================================
  // GET /knowledge/insights — rotating hero insights for marketplace
  // ============================================================
  router.get("/insights", async (_req: Request, res: Response) => {
    try {
      // Serve from cache when fresh
      if (insightsCache && Date.now() - insightsCache.ts < INSIGHTS_TTL_MS) {
        return res.json({
          ...insightsCache.data,
          cached: true,
          cache_age_seconds: Math.floor((Date.now() - insightsCache.ts) / 1000),
        });
      }

      // Gather grounding context from the live DB
      const context = await gatherMarketContext(pool);

      // Ask Mkulima Halisi via FreeFlow
      console.log("🤖 Generating hero insights via Mkulima Halisi…");
      const response = await axios.post<FreeFlowResponse>(
        `${FREE_FLOW_URL}/chat`,
        {
          messages: [
            { role: "system", content: INSIGHT_SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Current market context (JSON):\n${JSON.stringify(context)}\n\n` +
                "Generate the 4 insights now. Respond with JSON only.",
            },
          ],
          temperature: 0.7,
          max_tokens: 600,
        },
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        }
      );

      const parsed = parseInsights(response.data.content);
      insightsCache = { data: parsed, ts: Date.now() };

      return res.json({ ...parsed, cached: false });
    } catch (error: unknown) {
      console.error("❌ Insights endpoint error:", error);

      // Never 500 — return fallback so the hero still renders
      const fallback = getFallbackInsights();
      return res.json({
        ...fallback,
        cached: false,
        fallback_reason: "ai_unavailable",
      });
    }
  });

  // Debug endpoint to check FreeFlow connection
  router.get("/debug", async (req: Request, res: Response) => {
    try {
      // Check FreeFlow service health
      let freeflowStatus = "unknown";
      let freeflowProviders: string[] = [];

      try {
        const ffResponse = await axios.get(`${FREE_FLOW_URL}/health`, {timeout: 5000});
        freeflowStatus = ffResponse.data.status;
        freeflowProviders = ffResponse.data.providers_available || [];
      } catch (ffError) {
        freeflowStatus = "unreachable";
        console.error("FreeFlow health check failed:", ffError);
      }

      const envVars = {
        freeflow_url: FREE_FLOW_URL,
        freeflow_status: freeflowStatus,
        freeflow_providers: freeflowProviders,
        has_database: !!config.PGUSER,
        node_env: process.env.NODE_ENV || "not set",
        timestamp: new Date().toISOString(),
      };

      return res.json({
        status: "debug info",
        env: envVars,
        message: freeflowStatus === "ok" ?
          "FreeFlow service is connected" :
          "FreeFlow service is not reachable",
      });
    } catch (error) {
      return res.status(500).json({error: String(error)});
    }
  });

  return router;
};
