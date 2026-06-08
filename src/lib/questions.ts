import type { Operation, Question } from '@shared/types';
import { DEFAULT_QUESTION_COUNT } from '@shared/types';
import { conversions, formatPercentString } from './conversions';

/**
 * Generates a randomized batch of math questions for the given operation
 * and selection of base numbers. Conversion modes draw from a fixed
 * conversion table; arithmetic modes use the selected numbers plus
 * uniform-random multipliers.
 */
export const generateQuestions = (
  operation: Operation,
  selectedNumbers: number[],
  questionCount: number = DEFAULT_QUESTION_COUNT
): Question[] => {
  const newQuestions: Question[] = [];
  const questionSet = new Set<string>();

  if (
    operation === 'fraction-to-decimal' ||
    operation === 'decimal-to-fraction' ||
    operation === 'fraction-to-percent' ||
    operation === 'percent-to-fraction'
  ) {
    const shuffledConversions = [...conversions].sort(() => 0.5 - Math.random());
    const selectedConversions = shuffledConversions.slice(0, Math.min(questionCount, conversions.length));

    selectedConversions.forEach(conv => {
      switch (operation) {
        case 'fraction-to-decimal':
          newQuestions.push({
            operation,
            display: conv.fractionString,
            answer: conv.decimalString,
            num1: conv.numerator,
            num2: conv.denominator,
          });
          break;
        case 'decimal-to-fraction':
          newQuestions.push({
            operation,
            display: conv.decimalString,
            answer: conv.fractionString,
            num1: conv.decimal,
          });
          break;
        case 'fraction-to-percent': {
          const percentString = formatPercentString(conv.decimal);
          newQuestions.push({
            operation,
            display: conv.fractionString,
            answer: percentString,
            num1: conv.numerator,
            num2: conv.denominator,
          });
          break;
        }
        case 'percent-to-fraction': {
          const percentString = formatPercentString(conv.decimal);
          newQuestions.push({
            operation,
            display: percentString,
            answer: conv.fractionString,
            num1: percentString.endsWith('%') ? parseFloat(percentString.slice(0, -1)) : conv.decimal * 100,
          });
          break;
        }
      }
    });
    return newQuestions;
  }

  while (newQuestions.length < questionCount) {
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
    } else if (operation === 'square-roots') {
      question = {
        num1: baseNum * baseNum,
        operation,
        answer: baseNum,
      };
      questionKey = `sqrt(${baseNum * baseNum})`;
    } else {
      // negative-numbers
      const secondNum = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
      const problemType = Math.floor(Math.random() * 7);

      let operand1: number;
      let operand2: number;
      let isAddition: boolean;

      switch (problemType) {
        case 0:
          operand1 = -baseNum;
          operand2 = secondNum;
          isAddition = true;
          break;
        case 1:
          operand1 = baseNum;
          operand2 = -secondNum;
          isAddition = true;
          break;
        case 2:
          operand1 = -baseNum;
          operand2 = -secondNum;
          isAddition = true;
          break;
        case 3:
          operand1 = -baseNum;
          operand2 = secondNum;
          isAddition = false;
          break;
        case 4:
          operand1 = baseNum;
          operand2 = -secondNum;
          isAddition = false;
          break;
        case 5:
          operand1 = -baseNum;
          operand2 = -secondNum;
          isAddition = false;
          break;
        default:
          operand1 = Math.min(baseNum, secondNum);
          operand2 = Math.max(baseNum, secondNum);
          if (operand1 === operand2) {
            operand1 = -baseNum;
            operand2 = secondNum;
          }
          isAddition = false;
          break;
      }

      let answer: number;
      let displayString: string;

      if (isAddition) {
        answer = operand1 + operand2;
        displayString = operand2 >= 0 ? `${operand1} + ${operand2}` : `${operand1} + (${operand2})`;
      } else {
        answer = operand1 - operand2;
        displayString = operand2 >= 0 ? `${operand1} - ${operand2}` : `${operand1} - (${operand2})`;
      }

      question = {
        num1: operand1,
        num2: operand2,
        operation,
        answer,
        display: displayString,
      };
      questionKey = displayString;
    }

    if (!questionSet.has(questionKey)) {
      questionSet.add(questionKey);
      newQuestions.push(question);
    }
  }
  return newQuestions;
};
