describe('Global Leaderboard', () => {
  beforeEach(() => {
    // Reset the database and visit the app before each test
    cy.resetDB();
    cy.visit('/');
  });

  const playGameWithPerfectScore = () => {
    // Start a multiplication quiz with all numbers
    cy.contains('button', 'Multiplication (×)').click();
    cy.contains('button', 'Select All').click();
    cy.contains('button', 'Start Quiz').click();

    // Wait for the quiz to start
    cy.contains('h1', 'Quiz in Progress', { timeout: 10000 }).should('be.visible');

    // Answer all 10 questions correctly
    for (let i = 0; i < 10; i++) {
      cy.get(`[data-cy=correct-answer-${i}]`).invoke('text').then((correctAnswer) => {
        cy.get('input').eq(i).type(correctAnswer);
      });
    }

    // Submit the quiz
    cy.contains('button', 'Grade My Quiz').click();
  };

  it('should allow a user to submit a new high score', () => {
    playGameWithPerfectScore();

    // On the results screen, check for the top score message
    cy.contains("You're in the Top 5!", { timeout: 10000 }).should('be.visible');

    // Submit a name
    const playerName = 'CypressTest';
    cy.get('input[placeholder="Enter your name"]').type(playerName);
    cy.contains('button', 'Submit Score').click();

    // Verify submission success message
    cy.contains('Your score has been submitted to the leaderboard!').should('be.visible');

    // Go back to the main screen and check the leaderboard
    cy.contains('button', 'Play Again').click();
    cy.get('.animate-fade-in').should('contain', playerName);
  });

  it('should reject a username with profanity', () => {
    playGameWithPerfectScore();
    
    cy.contains("You're in the Top 5!", { timeout: 10000 }).should('be.visible');
    
    const profaneName = 'shit';
    cy.get('input[placeholder="Enter your name"]').type(profaneName);
    cy.contains('button', 'Submit Score').click();
    
    // Check for the error message from the server
    cy.contains('Inappropriate name detected. Please choose another.').should('be.visible');
  });
  
  it('should reject a username containing a link', () => {
    playGameWithPerfectScore();
    
    cy.contains("You're in the Top 5!", { timeout: 10000 }).should('be.visible');

    const linkName = 'www.test.com';
    cy.get('input[placeholder="Enter your name"]').type(linkName);
    cy.contains('button', 'Submit Score').click();
    
    // Check for the error message from the server
    cy.contains('Usernames cannot contain links. Please choose another.').should('be.visible');
  });

  it('should update an existing score if the new score is better', () => {
    // Manually add a score to the database to simulate a previous run
    cy.request({
      method: 'POST',
      url: 'http://localhost:3001/api/submit-score',
      body: {
        playerName: 'Updater',
        score: 99999, // A very high (slow) score
        operationType: 'multiplication'
      },
      failOnStatusCode: false 
    });
    
    playGameWithPerfectScore();
    
    cy.contains("You're in the Top 5!", { timeout: 10000 }).should('be.visible');

    // Use the same name to update the score
    cy.get('input[placeholder="Enter your name"]').type('Updater');
    cy.contains('button', 'Submit Score').click();
    
    // Go back and check the leaderboard
    cy.contains('button', 'Play Again').click();
    cy.get('.animate-fade-in').contains('Updater').parent().within(() => {
        cy.get('span').eq(1).invoke('text').then((scoreText) => {
            const scoreInSeconds = parseFloat(scoreText.replace('s', ''));
            // The new score should be much lower (faster) than 99.999s
            expect(scoreInSeconds).to.be.lessThan(99); 
        });
    });
  });
});
