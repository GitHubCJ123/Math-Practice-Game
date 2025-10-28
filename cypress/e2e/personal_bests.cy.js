describe('Personal Bests (Hall of Fame)', () => {
  beforeEach(() => {
    // Clear local storage before each test to ensure a clean slate
    cy.clearLocalStorage();
    cy.visit('/');
  });

  const playGameAndGetScore = (timeTaken) => {
    // This is a simplified quiz simulation.
    // We navigate to the results screen by mocking the finish of a quiz.
    // This avoids having to answer all questions for these local-only tests.
    cy.window().then((win) => {
      // Manually trigger the onFinishQuiz function from the App component context
      win.onFinishQuiz(
        Array(10).fill('1'), // Mock answers
        timeTaken // Controlled time
      );
    });
  };

  it('should display a "New High Score!" message and update the Personal Bests', () => {
    // Simulate finishing a quiz with a time of 15.5 seconds
    playGameAndGetScore(15.5);

    // Check for the high score banner on the results page
    cy.contains('New High Score!').should('be.visible');

    // Go back to the selection screen
    cy.contains('button', 'Play Again').click();

    // Check that the Personal Bests section now displays the correct score
    cy.get('div').contains('Personal Bests').parent().within(() => {
      cy.contains('multiplication').should('be.visible');
      cy.contains('15.5s').should('be.visible');
    });
  });

  it('should not update the personal best if the new score is worse (slower)', () => {
    // First, set an initial high score of 20.1 seconds
    playGameAndGetScore(20.1);
    cy.contains('New High Score!').should('be.visible');
    cy.contains('button', 'Play Again').click();

    // Now, play again with a slower time of 30.8 seconds
    playGameAndGetScore(30.8);

    // The "New High Score!" message should NOT be visible this time
    cy.contains('New High Score!').should('not.exist');
    cy.contains('button', 'Play Again').click();

    // Verify that the personal best score remains the original, better score
    cy.get('div').contains('Personal Bests').parent().within(() => {
      cy.contains('multiplication').should('be.visible');
      cy.contains('20.1s').should('be.visible');
      cy.contains('30.8s').should('not.exist');
    });
  });
});
