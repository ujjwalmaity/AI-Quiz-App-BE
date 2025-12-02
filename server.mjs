import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { generateQuestions } from "./llm.mjs";

const app = express();
app.use(express.json());

// const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:4200";
// app.use(cors({ origin: allowedOrigin }));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

const PORT = process.env.PORT || 4000;

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

app.listen(PORT, () => {
  console.log(`AI Quiz backend listening on port ${PORT}`);
});
