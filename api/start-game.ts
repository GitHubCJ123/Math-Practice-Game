import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { getRoom, startGame, setGamePlaying } from "./room-store";
import { Question, Operation } from "../types";

// Question generation logic (copied from App.tsx to keep server-side)
export function generateQuestions(
  operation: Operation,
  selectedNumbers: number[],
  count: number
): Question[] {
  const questions: Question[] = [];
  const usedQuestions = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 20;

  while (questions.length < count && attempts < maxAttempts) {
    attempts++;
    let question: Question | null = null;

    const num1 = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
    const num2 = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];

    switch (operation) {
      case "multiplication":
        question = { num1, num2, operation, answer: num1 * num2 };
        break;
      case "division":
        const product = num1 * num2;
        question = { num1: product, num2, operation, answer: num1 };
        break;
      case "squares":
        question = { num1, operation, answer: num1 * num1 };
        break;
      case "square-roots":
        const squared = num1 * num1;
        question = { num1: squared, operation, answer: num1 };
        break;
      case "fraction-to-decimal": {
        const fractionNum = num1;
        const fractionDen = num2 === 0 ? 1 : num2;
        const decimal = fractionNum / fractionDen;
        question = {
          num1: fractionNum,
          num2: fractionDen,
          operation,
          answer: Number.isInteger(decimal) ? decimal : parseFloat(decimal.toFixed(4)),
          display: `${fractionNum}/${fractionDen}`,
        };
        break;
      }
      case "decimal-to-fraction": {
        const fractionNum2 = num1;
        const fractionDen2 = num2 === 0 ? 1 : num2;
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(Math.abs(fractionNum2), Math.abs(fractionDen2));
        const simplifiedNum = fractionNum2 / divisor;
        const simplifiedDen = fractionDen2 / divisor;
        const decimal2 = fractionNum2 / fractionDen2;
        question = {
          num1: fractionNum2,
          num2: fractionDen2,
          operation,
          answer: simplifiedDen === 1 ? `${simplifiedNum}` : `${simplifiedNum}/${simplifiedDen}`,
          display: Number.isInteger(decimal2) ? `${decimal2}` : decimal2.toFixed(4).replace(/\.?0+$/, ""),
        };
        break;
      }
      case "fraction-to-percent": {
        const fractionNum3 = num1;
        const fractionDen3 = num2 === 0 ? 1 : num2;
        const percent = (fractionNum3 / fractionDen3) * 100;
        question = {
          num1: fractionNum3,
          num2: fractionDen3,
          operation,
          answer: Number.isInteger(percent) ? percent : parseFloat(percent.toFixed(2)),
          display: `${fractionNum3}/${fractionDen3}`,
        };
        break;
      }
      case "percent-to-fraction": {
        const percentVal = num1;
        const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
        const divisor2 = gcd2(Math.abs(percentVal), 100);
        const simplifiedNum2 = percentVal / divisor2;
        const simplifiedDen2 = 100 / divisor2;
        question = {
          num1: percentVal,
          operation,
          answer: simplifiedDen2 === 1 ? `${simplifiedNum2}` : `${simplifiedNum2}/${simplifiedDen2}`,
          display: `${percentVal}%`,
        };
        break;
      }
      case "negative-numbers": {
        const ops = ["+", "-", "*"];
        const op = ops[Math.floor(Math.random() * ops.length)];
        const n1 = Math.random() < 0.5 ? -num1 : num1;
        const n2 = Math.random() < 0.5 ? -num2 : num2;
        let ans: number;
        switch (op) {
          case "+": ans = n1 + n2; break;
          case "-": ans = n1 - n2; break;
          case "*": ans = n1 * n2; break;
          default: ans = n1 + n2;
        }
        const n2Display = n2 < 0 ? `(${n2})` : `${n2}`;
        question = {
          num1: n1,
          num2: n2,
          operation,
          answer: ans,
          display: `${n1} ${op} ${n2Display}`,
        };
        break;
      }
    }

    if (question) {
      const key = `${question.num1}-${question.num2}-${question.operation}-${question.display || ""}`;
      if (!usedQuestions.has(key)) {
        usedQuestions.add(key);
        questions.push(question);
      }
    }
  }

  return questions;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomId, odId } = req.body;

    if (!roomId || !odId) {
      return res.status(400).json({ error: "Room ID and player ID are required" });
    }

    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Only host can start the game (unless quick match)
    if (!room.isQuickMatch && room.hostId !== odId) {
      return res.status(403).json({ error: "Only the host can start the game" });
    }

    if (room.players.length < 2) {
      return res.status(400).json({ error: "Need 2 players to start" });
    }

    if (room.gameState !== "waiting") {
      return res.status(400).json({ error: "Game already started" });
    }

    // Generate questions based on room settings
    const questions = generateQuestions(
      room.settings.operation,
      room.settings.selectedNumbers,
      room.settings.questionCount
    );

    startGame(roomId, questions);

    const pusher = getPusher();

    // Send countdown event with questions
    await pusher.trigger(`room-${roomId}`, "game-starting", {
      type: "game-starting",
      countdown: 3,
      questions,
    });

    // After 3 seconds, send game-started event
    setTimeout(async () => {
      const updatedRoom = setGamePlaying(roomId);
      if (updatedRoom) {
        await pusher.trigger(`room-${roomId}`, "game-started", {
          type: "game-started",
          startTime: updatedRoom.gameStartTime,
        });
      }
    }, 3000);

    return res.status(200).json({
      success: true,
      message: "Game starting",
    });
  } catch (error) {
    console.error("Error starting game:", error);
    return res.status(500).json({ error: "Failed to start game" });
  }
}
