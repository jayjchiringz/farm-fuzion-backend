/* eslint-disable camelcase */
/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter/functions/src/api/knowledge.ts
import express, {Request, Response} from "express";
import {initDbPool} from "../utils/db";
import axios from "axios";
import {Pool} from "pg";
import multer from "multer";

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

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
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
const AI_API_URL = process.env.AI_API_URL || "https://api.siliconflow.com/v1";
const AI_API_KEY = process.env.AI_API_KEY;

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
    await pool.query(
      `INSERT INTO knowledge_conversations 
       (farmer_id, query, response, sources) 
       VALUES ($1, $2, $3, $4)`,
      [farmerId, query, response, JSON.stringify(sources)]
    );
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
        `${AI_API_URL}/chat/completions`,
        {
          model: "mistral-7b-agriculture",
          messages: [
            {role: "system", content: "You are a helpful farming assistant."},
            {role: "user", content: prompt},
          ],
          temperature: 0.3,
        },
        {headers: {Authorization: `Bearer ${AI_API_KEY}`}}
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

  // POST /knowledge/ask - with multer middleware
  router.post("/ask", upload.single("image"), async (req: MulterRequest, res: Response) => {
    try {
      const {query, category, farmer_id} = req.body;

      // Access file through multer - now properly typed
      const imageFile = req.file;

      if (!query && !imageFile) {
        return res.status(400).json({error: "Query or image required"});
      }

      // Handle image upload for disease detection
      if (imageFile) {
        const imageResult = await analyzePlantImage(imageFile);
        return res.json(imageResult);
      }

      // Text query with RAG
      const result = await queryWithRAG(query, category);

      // Store for fine-tuning
      if (farmer_id) {
        await storeConversation(farmer_id, query, result.answer, result.sources);
      }

      return res.json(result);
    } catch (error) {
      console.error("Knowledge API error:", error);
      return res.status(500).json({error: "Failed to process query"});
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
