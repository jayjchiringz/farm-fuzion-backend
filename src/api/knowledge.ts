/* eslint-disable require-jsdoc */
/* eslint-disable camelcase */
/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter/functions/src/api/knowledge.ts
import express, {Request, Response, NextFunction} from "express";
import {initDbPool} from "../utils/db";
import axios from "axios";
import {Pool} from "pg";
import multer from "multer";

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

// Unified AI API client
const AI_API_KEY = process.env.SILICONFLOW_API_KEY;

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
    try {
      // 1. Search vector database for relevant documents
      const docs = await pool.query(
        `SELECT content, title, source 
         FROM knowledge_documents 
         WHERE $1::text IS NULL OR category = $1
         ORDER BY embedding <-> (SELECT embedding FROM knowledge_documents LIMIT 1)
         LIMIT 5`,
        [category || null]
      );

      // 2. Build prompt with context
      const context = docs.rows.map((d: KnowledgeDocument) => d.content).join("\n\n");
      const prompt = `Context from agricultural research:\n${context}\n\nQuestion: ${query}\n\nAnswer based on the context:`;

      // 3. Call AI API (with error handling)
      if (!AI_API_KEY) {
        console.warn("No AI API key configured, returning mock response");
        return {
          answer: "I'm currently in offline mode. Please check back later for AI-powered responses.",
          sources: docs.rows.map((d: KnowledgeDocument) => ({
            title: d.title,
            source: d.source,
          })),
        };
      }

      const response = await axios.post(
        "https://api.siliconflow.com/v1/chat/completions",
        {
          model: "tencent/Hunyuan-MT-7B", // Your chosen free model
          messages: [
            {
              role: "system",
              content: "You are Mkulima Halisi, a helpful farming assistant for Kenyan farmers. Answer in Swahili or English as appropriate. Provide practical, local farming advice based on Kenyan agriculture.",
            },
            {role: "user", content: prompt},
          ],
          temperature: 0.7,
          max_tokens: 1024,
        },
        {
          headers: {
            "Authorization": `Bearer ${AI_API_KEY}`, // Your global API key
            "Content-Type": "application/json",
          },
        }
      );

      return {
        answer: response.data.choices[0].message.content,
        sources: docs.rows.map((d: KnowledgeDocument) => ({
          title: d.title,
          source: d.source,
        })),
      };
    } catch (error) {
      console.error("Error in queryWithRAG:", error);
      throw new Error("Failed to process knowledge query");
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
      const imageFile = req.file; // Now properly typed!

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

  return router;
};
