// import OpenAI from "openai";
//
// console.log("OPENAI KEY FROM ENV:", process.env.OPENAI_API_KEY);
//
// const client = new OpenAI({
//   apiKey: "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"
// });
//
// /**
//  * Generate 10 AI quiz questions (easy/medium) mixing AI tech and business.
//  * Returns an array of Question objects:
//  * { id, type, text, options, correctAnswerIndex, explanation }
//  */
// export async function generateQuestions() {
//   const systemPrompt = `
// You are an expert AI quiz generator.
//
// Generate exactly 10 quiz questions focused on:
// - AI technology: LLMs, transformers, RAG, ML fundamentals, evaluation, limitations, ethics.
// - Recent AI business updates: major product launches, corporate moves, partnerships, acquisitions since around 2023.
//
// Difficulty: easy to medium only.
//
// Question types:
// - "MCQ" with exactly 4 options.
// - "TRUE_FALSE" with exactly 2 options: "True", "False".
//
// Return ONLY a JSON array (no extra text) with 10 objects, each:
// {
//   "id": "q1",
//   "type": "MCQ" or "TRUE_FALSE",
//   "text": "Question text",
//   "options": ["A", "B", "C", "D"] or ["True","False"],
//   "correctAnswerIndex": 0,
//   "explanation": "Short explanation"
// }
//
// Rules:
// - Exactly 10 questions.
// - For TRUE_FALSE, options must be ["True","False"] (capitalization not critical).
// - correctAnswerIndex must be a valid index into options.
// - Mix technology and business questions.
// `;
//
//   const completion = await client.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages: [
//       { role: "system", content: systemPrompt },
//       { role: "user", content: "Generate the 10 questions now in JSON." }
//     ],
//     temperature: 0.7
//   });
//
//   const raw = completion.choices[0]?.message?.content ?? "[]";
//
//   let parsed;
//   try {
//     parsed = JSON.parse(raw);
//   } catch (err) {
//     console.error("Failed to parse LLM JSON:", err, raw);
//     throw new Error("Invalid LLM JSON response.");
//   }
//
//   if (!Array.isArray(parsed) || parsed.length !== 10) {
//     throw new Error("LLM did not return exactly 10 questions.");
//   }
//
//   // Simple validation
//   parsed.forEach((q, idx) => {
//     if (!q.id) q.id = `q${idx + 1}`;
//     if (!["MCQ", "TRUE_FALSE"].includes(q.type)) {
//       throw new Error("Invalid question type from LLM.");
//     }
//     if (!Array.isArray(q.options)) {
//       throw new Error("Question options missing or not array.");
//     }
//     if (typeof q.correctAnswerIndex !== "number" ||
//         q.correctAnswerIndex < 0 ||
//         q.correctAnswerIndex >= q.options.length) {
//       throw new Error("Invalid correctAnswerIndex from LLM.");
//     }
//   });
//
//   return parsed;
// }


// llm.mjs — MOCK LLM MODE (NO API KEY REQUIRED)

/**
 * This mock generator simulates an LLM and always returns
 * 10 AI-related questions (easy–medium).
 * This avoids OpenAI/Gemini quota/billing issues.
 */

export async function generateQuestions() {
  return [
    {
      id: "q1",
      type: "MCQ",
      text: "What does LLM stand for in AI?",
      options: ["Large Language Model", "Local Learning Machine", "Linear Logic Model", "Long Latent Memory"],
      correctAnswerIndex: 0,
      explanation: "LLM stands for Large Language Model."
    },
    {
      id: "q2",
      type: "TRUE_FALSE",
      text: "Transformers are commonly used in modern LLMs.",
      options: ["True", "False"],
      correctAnswerIndex: 0,
      explanation: "Transformers are the core architecture behind modern LLMs."
    },
    {
      id: "q3",
      type: "MCQ",
      text: "What is RAG in AI?",
      options: ["Random AI Generator", "Retrieval Augmented Generation", "Recursive AI Graph", "Real-time AI Gateway"],
      correctAnswerIndex: 1,
      explanation: "RAG combines retrieval with generation."
    },
    {
      id: "q4",
      type: "MCQ",
      text: "Which company launched ChatGPT?",
      options: ["Google", "Microsoft", "OpenAI", "Amazon"],
      correctAnswerIndex: 2,
      explanation: "ChatGPT was launched by OpenAI."
    },
    {
      id: "q5",
      type: "TRUE_FALSE",
      text: "Fine-tuning is a way to adapt a base AI model for specific tasks.",
      options: ["True", "False"],
      correctAnswerIndex: 0,
      explanation: "Fine-tuning adjusts pre-trained model weights for a specific use case."
    },
    {
      id: "q6",
      type: "MCQ",
      text: "Which hardware is most commonly used to train large AI models?",
      options: ["CPU", "GPU", "Hard Disk", "Router"],
      correctAnswerIndex: 1,
      explanation: "GPUs are optimized for parallel compute required in AI training."
    },
    {
      id: "q7",
      type: "MCQ",
      text: "Which company partnered heavily with OpenAI for cloud infrastructure?",
      options: ["AWS", "Google Cloud", "Microsoft Azure", "Oracle"],
      correctAnswerIndex: 2,
      explanation: "Microsoft Azure is OpenAI’s primary cloud partner."
    },
    {
      id: "q8",
      type: "TRUE_FALSE",
      text: "AI hallucinations refer to incorrect or fabricated responses by models.",
      options: ["True", "False"],
      correctAnswerIndex: 0,
      explanation: "Hallucinations are false but confident AI outputs."
    },
    {
      id: "q9",
      type: "MCQ",
      text: "What does the token represent in LLMs?",
      options: ["A word or part of a word", "Only a sentence", "Only a character", "Only a number"],
      correctAnswerIndex: 0,
      explanation: "Tokens are word pieces used for model processing."
    },
    {
      id: "q10",
      type: "MCQ",
      text: "Which AI feature allows models to use external documents for answers?",
      options: ["Pretraining", "Fine-tuning", "RAG", "Quantization"],
      correctAnswerIndex: 2,
      explanation: "RAG allows models to retrieve answers from external sources."
    }
  ];
}
