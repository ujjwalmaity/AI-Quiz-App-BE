import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import functions from '@google-cloud/functions-framework';
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { GoogleGenAI, Type } from "@google/genai";
import crypto from "crypto";

// --- Configuration ---
const USE_AI = process.env.AI_USE === 'YES';
let genAI = null;
const MODEL_NAME = "gemini-2.5-flash";
const QUESTION_COUNT = 10;
const TOPIC = 'Easy and Medium Level AI Topic'
console.log('USE_AI is ', USE_AI);
if (USE_AI) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  console.log('geminiApiKey ', geminiApiKey);
  if (!geminiApiKey) {
    console.error("CRITICAL ERROR: GEMINI_API_KEY is not set, even though AI_USE=YES. API calls will fail.");
  }
  // geminiSdk.GoogleGenerativeAI is available via require("@google/generative-ai")
  genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const app = express();
app.use(express.json());

// const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";
// app.use(cors({ origin: allowedOrigin }));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

const PORT = process.env.PORT || 8080;

// In-memory store (for production, replace with Redis/DB)
const sessions = {}; // sessionId -> Session

// Helpers
function getSessionOr404(req, res) {
  const session = sessions[req.params.sessionId];
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return null;
  }
  return session;
}

/**
 * Create new quiz session and generate questions via LLM.
 */
app.post("/api/sessions", async (req, res) => {
  try {
    const sessionId = uuidv4().substring(0, 6).toUpperCase();

    const questions = await generateQuestions();

    const session = {
      sessionId,
      questions,
      currentQuestionIndex: -1,
      status: "NOT_STARTED",
      participants: []
    };
    sessions[sessionId] = session;

    // const joinUrl = `${req.headers["x-public-base-url"] || ""}/join/${sessionId}`.replace(/\/$/, "");
    const joinUrl = `http://localhost:4200/join/${sessionId}`;

    const qrDataUrl = await QRCode.toDataURL(joinUrl || `http://localhost:4200/join/${sessionId}`);

    res.json({
      sessionId,
      joinUrl,
      qrDataUrl,
      session
    });
  } catch (err) {
    console.error("Error creating session:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/**
 * Get session state
 */
app.get("/api/sessions/:sessionId", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;
  res.json(session);
});

/**
 * Join session as participant
 */
app.post("/api/sessions/:sessionId/participants", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  const name = String(req.body.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const participant = {
    id: uuidv4(),
    name,
    score: 0,
    answers: []
  };

  session.participants.push(participant);
  res.json(participant);
});

/**
 * Start quiz
 */
app.post("/api/sessions/:sessionId/start", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  if (session.participants.length === 0) {
    return res.status(400).json({ error: "At least one participant required to start quiz." });
  }

  session.status = "IN_PROGRESS";
  session.currentQuestionIndex = 0;
  res.json(session);
});

/**
 * Advance to next question or finish quiz.
 */
app.post("/api/sessions/:sessionId/next", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  if (session.currentQuestionIndex < session.questions.length - 1) {
    session.currentQuestionIndex++;
    session.status = "FINISHED";
  } else {
    session.status = "FINISHED";
  }
  res.json(session);
});

/**
 * Submit answer for current question.
 */
app.post("/api/sessions/:sessionId/participants/:participantId/answers/:qIndex", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  if (session.status !== "IN_PROGRESS") {
    return res.status(400).json({ error: "Quiz is not in progress." });
  }

  const participant = session.participants.find(p => p.id === req.params.participantId);
  if (!participant) {
    return res.status(404).json({ error: "Participant not found" });
  }

  const question = session.questions[req.params.qIndex];
  const selectedOptionIndex = Number(req.body.selectedOptionIndex);

  // Prevent multiple submissions for same question
  const alreadyAnswered = participant.answers.some(a => a.questionId === question.id);
  if (alreadyAnswered) {
    return res.status(400).json({ error: "Question already answered." });
  }

  const isCorrect = selectedOptionIndex === question.correctAnswerIndex;

  participant.answers.push({
    questionId: question.id,
    selectedOptionIndex,
    isCorrect
  });

  if (isCorrect) {
    participant.score += 10;
  }

  res.json({ isCorrect, score: participant.score });
});

/**
 * Leaderboard JSON
 */
app.get("/api/sessions/:sessionId/leaderboard", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  const leaderboard = [...session.participants]
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      correctCount: p.answers.filter(a => a.isCorrect).length
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  res.json(leaderboard);
});

/**
 * Leaderboard CSV download
 */
app.get("/api/sessions/:sessionId/leaderboard.csv", (req, res) => {
  const session = getSessionOr404(req, res);
  if (!session) return;

  const rows = [
    ["Rank", "Name", "Score", "CorrectAnswers"]
  ];

  const leaderboard = [...session.participants]
    .map(p => ({
      name: p.name,
      score: p.score,
      correctCount: p.answers.filter(a => a.isCorrect).length
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  leaderboard.forEach((p, idx) => {
    rows.push([String(idx + 1), p.name, String(p.score), String(p.correctCount)]);
  });

  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=\"leaderboard-${req.params.sessionId}.csv\"`);
  res.send(csv);
});

app.get("/", (req, res) => {
  res.send("AI Quiz Backend is running.");
});

// app.listen(PORT, () => {
//   console.log(`AI Quiz backend listening on port ${PORT}`);
// });



function pickRandomElements(arr, n = 10) {
  if (!arr || arr.length === 0) {
    console.error("Input array is empty or undefined.");
    return [];
  }
  if (n <= 0) {
    return [];
  }
  const numToPick = Math.min(n, arr.length);
  const shuffledArray = [...arr];
  for (let i = 0; i < numToPick; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray.slice(0, numToPick);
}
// --- Define Required JSON Schema for Structured Output ---
const quizSchema = {
  type: Type.ARRAY,
  description: `An array of exactly ${QUESTION_COUNT} multiple-choice questions.`,
  items: {
    type: Type.OBJECT,
    properties: {
      text: {
        type: Type.STRING,
        description: "The text of the multiple-choice question."
      },
      options: {
        type: Type.ARRAY,
        description: "An array of 4 possible answers (strings).",
        items: {
          type: Type.STRING
        }
      },
      correctAnswerIndex: {
        type: Type.INTEGER,
        description: "The zero-based index of the correct answer in the options array (0 to 3)."
      },
      explanation: {
        type: Type.STRING,
        description: "A brief, one-sentence explanation of the correct answer."
      }
    },
    required: ["text", "options", "correctAnswerIndex", "explanation"]
  }
};

async function generateQuestions() {
  const prompt = `
    Generate exactly ${QUESTION_COUNT} multiple-choice questions (MCQs) on the topic: ${TOPIC}. 
    Ensure the questions are challenging and cover recent advancements in AI.
    The response MUST strictly adhere to the provided JSON schema.
  `;

  try {
    console.log(`\n[API Call] Generating ${QUESTION_COUNT} questions on topic: ${TOPIC}...\n`);

    // Use the models object for generation
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        // The structured schema is passed here
        responseSchema: quizSchema,
        temperature: 0.7,
      },
    });

    const rawJsonText = response.text.trim();
    const questions = JSON.parse(rawJsonText);

    console.log(`[Success] Successfully generated ${questions.length} questions from Gemini.`);

    // Output the questions in a readable JSON format
    console.log(JSON.stringify(questions, null, 2));

    return questions.map(question => {
      return {...question,
      id: crypto.randomUUID(),
      type:"MCQ"
      }
    });

  } catch (error) {
    console.error(`\n[CRITICAL ERROR] Gemini API call failed.`);
    console.error(`Error details:`, error.message);
    return pickRandomElements(FALLBACK_QUESTIONS, 10);
  }
}
// 🚀 FINAL EXPORT — CRITICAL FOR CLOUD RUN
functions.http("quizBackend", app);


const FALLBACK_QUESTIONS = [
  {
    id: "ai-001",
    type: "MCQ",
    text: "What does the 'L' stand for in LLM?",
    options: ["Linear", "Logic", "Large", "Learning"],
    correctAnswerIndex: 2,
    explanation: "LLM stands for Large Language Model."
  },
  {
    id: "ai-002",
    type: "MCQ",
    text: "Generative AI is primarily used to:",
    options: ["Analyze large spreadsheets", "Manage computer hardware", "Create new content (like text, images, or music)", "Secure a network"],
    correctAnswerIndex: 2,
    explanation: "Generative AI creates new content based on patterns learned from its training data."
  },
  {
    id: "ai-003",
    type: "MCQ",
    text: "What is the term for the text instruction given to an AI model to get a desired output?",
    options: ["Algorithm", "Prompt", "Variable", "Token"],
    correctAnswerIndex: 1,
    explanation: "A prompt is the input text that guides the generative AI model."
  },
  {
    id: "ai-004",
    type: "MCQ",
    text: "Which type of AI model is best known for creating realistic images from text descriptions?",
    options: ["Regression Model", "Diffusion Model", "Classification Model", "Support Vector Machine"],
    correctAnswerIndex: 1,
    explanation: "Diffusion models are the current state-of-the-art for generating high-quality images from text prompts."
  },
  {
    id: "ai-005",
    type: "MCQ",
    text: "When an LLM makes up facts that are incorrect, this is commonly called:",
    options: ["Prediction", "Hallucination", "Overfitting", "Clustering"],
    correctAnswerIndex: 1,
    explanation: "An AI hallucination is when the model confidently generates false or misleading information."
  },
  {
    id: "ai-006",
    type: "MCQ",
    text: "What is the core technology used inside modern LLMs (like the Gemini family)?",
    options: ["Recurrent Neural Networks (RNN)", "Convolutional Neural Networks (CNN)", "Transformer Architecture", "Decision Trees"],
    correctAnswerIndex: 2,
    explanation: "The Transformer architecture, based on attention mechanisms, is the foundation of modern large language models."
  },
  {
    id: "ai-007",
    type: "MCQ",
    text: "Adjusting the 'Temperature' setting on an LLM affects the model's:",
    options: ["Factual accuracy", "Speed of response", "Creativity or randomness", "Maximum output length"],
    correctAnswerIndex: 2,
    explanation: "Temperature controls the model's randomness; higher temperature means more creative and varied text."
  },
  {
    id: "ai-008",
    type: "MCQ",
    text: "What is the initial process where a model learns general knowledge from massive, diverse datasets?",
    options: ["Fine-tuning", "Deployment", "Pre-training", "Debugging"],
    correctAnswerIndex: 2,
    explanation: "Pre-training is the unsupervised phase where the model learns the fundamentals of language and general facts."
  },
  {
    id: "ai-009",
    type: "MCQ",
    text: "What is 'AI Alignment' concerned with?",
    options: ["Aligning the model's weights to be perfectly uniform", "Ensuring AI systems act according to human values and intentions", "Aligning data types for model input", "Aligning the model architecture with the hardware"],
    correctAnswerIndex: 1,
    explanation: "AI Alignment is the research area dedicated to ensuring AI systems are safe, helpful, and follow human ethical guidelines."
  },
  {
    id: "ai-010",
    type: "MCQ",
    text: "The main output of a language model is typically a sequence of:",
    options: ["Images", "Numbers (integers)", "Tokens (words or sub-words)", "Sound files"],
    correctAnswerIndex: 2,
    explanation: "LLMs process and generate text by breaking it down into fundamental units called tokens."
  }
];
