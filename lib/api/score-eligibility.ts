export function isScoreEligible(
  operationType: string,
  questionCount: number,
  selectedNumbersCount: number,
  allNumbersSelected: boolean
) {
  const requiresAllNumbers =
    operationType === "multiplication" ||
    operationType === "division" ||
    operationType === "squares" ||
    operationType === "square-roots" ||
    operationType === "negative-numbers";
  const expectedCount =
    operationType === "squares" || operationType === "square-roots"
      ? 20
      : operationType === "negative-numbers"
        ? 10
        : 12;

  if (questionCount !== 10) {
    return false;
  }
  if (requiresAllNumbers) {
    return allNumbersSelected && selectedNumbersCount === expectedCount;
  }
  return true;
}
