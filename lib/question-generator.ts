import type { Operation, Question } from '../types';
import { conversions } from './conversions.js';

export function generateQuestions(operation: Operation, selectedNumbers: number[]): Question[] {
  const newQuestions: Question[] = [];
  const questionSet = new Set<string>();

  if (operation === 'fraction-to-decimal' || operation === 'decimal-to-fraction') {
    const shuffledConversions = [...conversions].sort(() => 0.5 - Math.random());
    const selectedConversions = shuffledConversions.slice(0, 10);

    selectedConversions.forEach(conv => {
      if (operation === 'fraction-to-decimal') {
        newQuestions.push({
          operation,
          display: conv.fractionString,
          answer: conv.decimalString,
          num1: conv.numerator,
          num2: conv.denominator,
        });
      } else { // decimal-to-fraction
        newQuestions.push({
          operation,
          display: conv.decimalString,
          answer: conv.fractionString,
          num1: conv.decimal,
        });
      }
    });
    return newQuestions;
  }

  while (newQuestions.length < 10) {
    const baseNum = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
    
    let question: Question;
    let questionKey: string;

    if (operation === 'multiplication') {
      const multiplier = Math.floor(Math.random() * 12) + 1;
      const order = Math.random() < 0.5;
      question = {
        num1: order ? baseNum : multiplier,
        num2: order ? multiplier : baseNum,
        operation,
        answer: baseNum * multiplier,
      };
      questionKey = `${question.num1}x${question.num2}`;
    } else if (operation === 'division') {
      const multiplier = Math.floor(Math.random() * 12) + 1;
      question = {
        num1: baseNum * multiplier,
        num2: baseNum,
        operation,
        answer: multiplier,
      };
      questionKey = `${question.num1}/${question.num2}`;
    } else if (operation === 'squares') {
      question = {
        num1: baseNum,
        operation,
        answer: baseNum * baseNum,
      };
      questionKey = `${baseNum}^2`;
    } else { // square-roots
      question = {
        num1: baseNum * baseNum,
        operation,
        answer: baseNum,
      };
      questionKey = `sqrt(${baseNum*baseNum})`;
    }

    if (!questionSet.has(questionKey)) {
      questionSet.add(questionKey);
      newQuestions.push(question);
    }
  }
  return newQuestions;
}


