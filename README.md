<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1bJE0uqG3FUPzuA3n6C70FHCj_tl43spS

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Math Practice Game

This is a simple game to help users practice various math operations like multiplication, division, squares, and square roots. It features timed quizzes, tracks personal high scores, and includes a global leaderboard.

### Features

-   Multiple math operations to choose from.
-   Customizable number sets for practice.
-   Optional time limits for an extra challenge.
-   Personal high score tracking for each operation.
-   Global leaderboards to see how you stack up against others.

### Running Locally

1.  **Install Dependencies**:
    `npm install`
2.  **Set Up Environment Variables**:
    Create a `.env.local` file in the root directory and add your Azure credentials:
    ```
    AZURE_SERVER_NAME="your-server-name.database.windows.net"
    AZURE_DB_NAME="your-db-name"
    AZURE_DB_USER="your-db-user"
    AZURE_DB_PASSWORD="your-db-password"
    ```
    Optional: add `VITE_GA_ID="G-XXXXXXX"` to enable Google Analytics (respects the browser Do Not Track setting and won’t load if unset).
3.  **Run the Local Server**:
    `npm run server`
4.  **Run the Frontend App**:
    `npm run dev`

### Running Tests

This project uses Cypress for end-to-end testing of the leaderboard and personal bests features.

1.  **Start the Frontend Server in Test Mode**:
    In your first terminal, run the frontend development server using the special test script. This exposes test-only data attributes for the test runner.
    ```bash
    npm run dev:test
    ```
2.  **Start the Backend Server in Test Mode**:
    In a second, separate terminal, run the backend server using the special test script. This enables the test-only database reset functionality.
    ```bash
    npm run server:test
    ```
3.  **Open the Cypress Test Runner**:
    Once both servers are running, open a third terminal and launch the interactive Cypress dashboard.
    ```bash
    npm run cypress:open
    ```
4.  **Run Tests in Headless Mode**:
    This command runs all Cypress tests without a visible browser, which is ideal for CI/CD environments. Make sure your dev servers are running before executing this.
    ```bash
    npm run cypress:run
    ```