//********************************************************************************************
//** Mines Game Simulation                                                                  **
//** Version: 0.6                                                                           ** 
//** Date: 26/09/2023                                                                       **
//** Author: MrBtcGambler                                                                   **
//** Details:                                                                               **
//** Simulates playing the Mines game over multiple rounds, allowing for testing of         **
//** different betting strategies and understanding the risks associated with the game.     **
//********************************************************************************************

const crypto = require('crypto');

// Configuration settings
const useRandomSeed = true;
const debugMode = false;
const debugDelay = 1000;

// Generate or use predefined seeds
const randomServerSeed = useRandomSeed
  ? generateRandomServerSeed(64)
  : 'd83729554eeed8965116385e0486dab8a1f6634ae1a9e8139e849ab75f17341d';
const randomClientSeed = useRandomSeed ? generateRandomClientSeed(10) : 'wcvqnIM521';
const startNonce = useRandomSeed ? Math.floor(Math.random() * 1_000_000) + 1 : 1;

// Game simulation settings
let balance = 250000; // Starting balance
const baseBet = 0.0005; // Base bet amount
let nextBet = baseBet;
const increaseOnLoss = 1.92; // Multiplier applied to bet after a loss (adds 92% to each loss)
const vaultThreshold = 4; // Amount after which profits are moved to vault
const totalBets = 864000000; // Number of game rounds to simulate
// 1 day = 240000, 1 week = 1680000, 1 month = 7200000, 1 year = 86400000

// Player strategy settings
const numberOfMines = 4; // Number of mines in the game
let tilesToUncover = 4; // Number of tiles the player will attempt to uncover before cashing out
const selectedTilesStrategy = 'random';
const randomizeTilesEachBet = false; // Set to true to randomize tile selection each bet
const randomizeAfterBetCount = 3; // Number of bets after which to change tile selection

// Simulation variables
const startBalance = balance;
let lowestBalance = balance;
let betsSinceLastChange = 0; // Counter for bets since last tile change
let vaultBalance = 0;
let wager = 0;
let profit = 0;
let largestBetPlaced = nextBet;
let recoveryPotUsed = 0;
let maxLossStreak = 0;
let maxWinStreak = 0;

// Statistics
let betCount = 0;
let winCount = 0;
let lossCount = 0;
let currentStreak = 0;
let progress = 0;

// Game settings
const GRID_SIZE = 25; // 5x5 grid
const GRID_ROWS = 5;
const GRID_COLUMNS = 5;
const HOUSE_EDGE = 0.01;
const startTime = Date.now();

// Variable to store the current tile selection
let currentSelectedTiles = [];

// Grid representation
let grid = []; // Will be initialized in the simulation loop

/**
 * Byte generator using HMAC-SHA256
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} cursor
 */
function* byteGenerator(serverSeed, clientSeed, nonce, cursor) {
  let currentRound = Math.floor(cursor / 32);
  let currentRoundCursor = cursor % 32;

  while (true) {
    const hmac = crypto.createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${currentRound}`);
    const buffer = hmac.digest();

    while (currentRoundCursor < 32) {
      yield buffer[currentRoundCursor];
      currentRoundCursor += 1;
    }

    currentRoundCursor = 0;
    currentRound += 1;
  }
}

/**
 * Generates a random float between 0 and 1 using the byte generator.
 * @param {Generator} generator
 * @returns {number}
 */
function getRandomFloat(generator) {
  const bytes = [];
  for (let i = 0; i < 4; i++) {
    bytes.push(generator.next().value);
  }

  const floatResult = bytes.reduce((acc, value, i) => acc + value / Math.pow(256, i + 1), 0);
  return floatResult;
}

/**
 * Generates a random server seed (hex string).
 * @param {number} length
 * @returns {string}
 */
function generateRandomServerSeed(length = 64) {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Generates a random client seed (alphanumeric string).
 * @param {number} length
 * @returns {string}
 */
function generateRandomClientSeed(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let seed = '';
  for (let i = 0; i < length; i++) {
    seed += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return seed;
}

/**
 * Generates mine positions using the provably fair algorithm.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} numberOfMines
 * @returns {number[]}
 */
function generateMinePositions(serverSeed, clientSeed, nonce, numberOfMines) {
  const positions = Array.from({ length: GRID_SIZE }, (_, i) => i); // Positions 0 to 24
  const minePositions = [];

  let cursor = 0;
  const generator = byteGenerator(serverSeed, clientSeed, nonce, cursor);

  for (let i = 0; i < numberOfMines; i++) {
    const randomFloat = getRandomFloat(generator);
    cursor += 4; // 4 bytes used
    const index = Math.floor(randomFloat * positions.length);
    const selectedPosition = positions[index];
    minePositions.push(selectedPosition);
    positions.splice(index, 1); // Remove the selected position
  }

  return minePositions;
}

/**
 * Calculates the payout multiplier based on the number of mines and tiles uncovered.
 * @param {number} numberOfMines
 * @param {number} tilesUncovered
 * @returns {number}
 */
function calculatePayoutMultiplier(numberOfMines, tilesUncovered) {
  let cumulativeProbability = 1.0;

  for (let k = 0; k < tilesUncovered; k++) {
    const numerator = GRID_SIZE - numberOfMines - k;
    const denominator = GRID_SIZE - k;
    cumulativeProbability *= numerator / denominator;
  }

  // Payout multiplier is inverse of cumulative probability, adjusted for house edge
  const payoutMultiplier = (1 - HOUSE_EDGE) / cumulativeProbability;

  return payoutMultiplier;
}

/**
 * Converts grid coordinates to tile indices.
 * @param {Array} grid
 * @returns {number[]}
 */
function getSelectedTilesFromGrid(grid) {
  const selectedTiles = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === 'X') {
        const tileIndex = row * GRID_COLUMNS + col;
        selectedTiles.push(tileIndex);
      }
    }
  }
  return selectedTiles;
}

/**
 * Initializes the grid.
 * @returns {Array}
 */
function initializeGrid() {
  const newGrid = [];
  for (let i = 0; i < GRID_ROWS; i++) {
    newGrid.push(Array(GRID_COLUMNS).fill(0));
  }
  return newGrid;
}

/**
 * Generates a random tile selection.
 * @returns {number[]}
 */
function generateRandomTileSelection() {
  const selectedTiles = [];
  const allTiles = Array.from({ length: GRID_SIZE }, (_, i) => i);

  for (let i = 0; i < tilesToUncover; i++) {
    if (allTiles.length === 0) break;
    const index = Math.floor(Math.random() * allTiles.length);
    const selectedTile = allTiles[index];
    selectedTiles.push(selectedTile);
    allTiles.splice(index, 1);
  }

  return selectedTiles;
}

/**
 * Changes the tile selection (can be called at any time).
 */
function changeTileSelection() {
  currentSelectedTiles = generateRandomTileSelection();
}

/**
 * Generates selected tiles based on the specified strategy.
 * @param {string} strategy
 * @returns {number[]}
 */
function getSelectedTiles(strategy) {
  let selectedTiles = [];

  // Reset the grid for the new round
  grid = initializeGrid();

  if (strategy === 'random') {
    // Check if we need to change the tile selection
    if (betsSinceLastChange >= randomizeAfterBetCount || currentSelectedTiles.length === 0) {
      // Generate new random selection
      currentSelectedTiles = generateRandomTileSelection();
      betsSinceLastChange = 0; // Reset the counter after changing tiles

      // Log the new selection if in debug mode
      if (debugMode) {
        console.log(`\nTiles have been changed. New selection: ${currentSelectedTiles}`);
      }
    }
    selectedTiles = currentSelectedTiles;

    // Update the grid with selected tiles
    for (const selectedTile of selectedTiles) {
      const row = Math.floor(selectedTile / GRID_COLUMNS);
      const col = selectedTile % GRID_COLUMNS;
      grid[row][col] = 'X';
    }
  } else if (strategy === 'fixed') {
    // Use the grid representation to specify selected tiles
    selectedTiles = getSelectedTilesFromGrid(grid);
    // Update tilesToUncover to match the number of selected tiles
    tilesToUncover = selectedTiles.length;
  }

  return selectedTiles;
}

/**
 * Simulates a Mines game round.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} nonce
 * @param {number} numberOfMines
 * @param {number[]} selectedTiles
 * @returns {Object}
 */
function playMinesGame(serverSeed, clientSeed, nonce, numberOfMines, selectedTiles) {
  // Generate mine positions
  const minePositions = generateMinePositions(serverSeed, clientSeed, nonce, numberOfMines);

  // Game state
  const uncoveredTiles = [];
  let win = false;
  let payoutMultiplier = 1.0;

  // All tile indices
  let remainingTiles = Array.from({ length: GRID_SIZE }, (_, i) => i);

  for (let turn = 0; turn < selectedTiles.length; turn++) {
    const selectedTile = selectedTiles[turn];

    // Check if the tile has already been uncovered
    if (uncoveredTiles.includes(selectedTile)) {
      // Skip if already uncovered
      continue;
    }

    // Check if the selected tile is valid
    if (!remainingTiles.includes(selectedTile)) {
      // Invalid selection
      continue;
    }

    // Remove the selected tile from remaining tiles
    remainingTiles = remainingTiles.filter((i) => i !== selectedTile);

    // Check if the selected tile is a mine
    if (minePositions.includes(selectedTile)) {
      payoutMultiplier = 0;

      // Update the grid to mark the mine with '*'
      const row = Math.floor(selectedTile / GRID_COLUMNS);
      const col = selectedTile % GRID_COLUMNS;
      grid[row][col] = '*';

      break; // Game over
    }

    // Uncover the tile
    uncoveredTiles.push(selectedTile);

    // Calculate payout multiplier after this tile
    payoutMultiplier = calculatePayoutMultiplier(numberOfMines, uncoveredTiles.length);

    // Decide whether to cash out
    if (uncoveredTiles.length >= tilesToUncover) {
      win = true;
      break;
    }
  }

  return {
    minePositions,
    uncoveredTiles,
    win,
    payoutMultiplier,
  };
}

/**
 * Utility function to introduce a delay.
 * @param {number} ms
 * @returns {Promise}
 */
function betDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Displays the current grid state.
 */
function displayGrid() {
  console.log('\nCurrent Grid State:');
  for (let row = 0; row < grid.length; row++) {
    console.log(grid[row].join(' '));
  }
}

/**
 * Main function to simulate multiple game rounds.
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number} startNonce
 * @param {number} totalBets
 */
async function simulateMinesGame(serverSeed, clientSeed, startNonce, totalBets) {
  let nonce = startNonce;

  // If not randomizing each bet and strategy is 'random', generate initial selection
  if (!randomizeTilesEachBet && selectedTilesStrategy === 'random' && currentSelectedTiles.length === 0) {
    changeTileSelection();
  }

  while (betCount < totalBets && balance >= nextBet) {
    betCount++;
    nonce++;
    betsSinceLastChange++; // Increment the bets since last tile change

    // Update progress
    progress = (betCount / totalBets) * 100;

    // Place bet
    const betAmount = nextBet;
    wager += betAmount;
    profit -= betAmount;
    balance -= betAmount;

    // Get selected tiles based on strategy
    const selectedTiles = getSelectedTiles(selectedTilesStrategy);

    // Play the game round
    const gameResult = playMinesGame(serverSeed, clientSeed, nonce, numberOfMines, selectedTiles);

    // Handle game result
    if (gameResult.win) {
      winCount++;
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      const winAmount = betAmount * gameResult.payoutMultiplier;
      profit += winAmount;
      balance += winAmount;
      nextBet = baseBet;

      // Update max win streak
      if (currentStreak > maxWinStreak) {
        maxWinStreak = currentStreak;
      }
    } else {
      lossCount++;
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;

      // Update max loss streak
      if (Math.abs(currentStreak) > Math.abs(maxLossStreak)) {
        maxLossStreak = currentStreak;
      }
      nextBet *= increaseOnLoss;

      // Update largest bet placed
      if (nextBet > largestBetPlaced) {
        largestBetPlaced = nextBet;
      }
    }

    // Update lowest balance
    if (balance < lowestBalance) {
      lowestBalance = balance;
    }

    // Update recovery pot used
    recoveryPotUsed = startBalance - lowestBalance;

    // Vault profits if threshold reached
    if (profit >= vaultThreshold) {
      vaultBalance += profit;
      profit = 0;
    }

    // Debug or periodic logging
    if (debugMode) {
      displayGrid();
      console.log(
        gameResult.win ? '\x1b[32m%s\x1b[0m' : '\x1b[31m%s\x1b[0m',
        [
          `Bet Count: ${betCount}`,
          `Server Seed: ${serverSeed}`,
          `Client Seed: ${clientSeed}`,
          `Nonce: ${nonce}`,
          `Bet Amount: ${betAmount.toFixed(6)}`,
          `Win: ${gameResult.win}`,
          `Payout Multiplier: ${gameResult.payoutMultiplier.toFixed(4)}`,
          `Profit: ${(profit + vaultBalance).toFixed(6)}`,
          `Balance: ${balance.toFixed(6)}`,
          `Current Streak: ${currentStreak}`,
        ].join(' | ')
      );
      await betDelay(debugDelay); // Delay between bets when in debug mode
    } else {
      if (betCount % 100_000 === 0 || balance < nextBet) {
        console.log(
          [
            `Progress: ${progress.toFixed(2)}%`,
            `Bet Count: ${betCount}`,
            `Wins: ${winCount}`,
            `Losses: ${lossCount}`,
            `Balance: ${balance.toFixed(2)}`,
            `Profit: ${(profit + vaultBalance).toFixed(2)}`,
            `Wagered: ${wager.toFixed(2)}`,
            `Current Streak: ${currentStreak}`,
            `Max Win Streak: ${maxWinStreak}`,
            `Max Loss Streak: ${maxLossStreak}`,
          ].join(' | ')
        );
      }
    }

    // Check for bust (balance below base bet)
    if (balance < nextBet) {
      console.log('\nBusted! Insufficient balance to continue.');
      break;
    }
  }

  // Final results
  return {
    betCount,
    winCount,
    lossCount,
    maxWinStreak,
    maxLossStreak,
    finalNonce: nonce,
    finalBalance: balance,
    finalProfit: profit,
    vaultBalance,
    totalWagered: wager,
    recoveryPotUsed,
  };
}

// Start the simulation
simulateMinesGame(randomServerSeed, randomClientSeed, startNonce, totalBets).then((result) => {
  const endTime = Date.now();
  const runTimeSeconds = (endTime - startTime) / 1000;
  const betsPerSecond = (result.betCount / runTimeSeconds).toFixed(2);

  // Display final summary
  console.log('\nSimulation Complete!');
  console.log(`Run Time: ${runTimeSeconds.toFixed(2)} seconds`);
  console.log(`Bets Per Second: ${betsPerSecond}`);

  const redText = '\x1b[31m';
  const greenText = '\x1b[32m';
  const resetText = '\x1b[0m';

  console.log(`${greenText}##########################################${resetText}`);
  console.log(`${greenText}# Simulation Summary:${resetText}`);
  console.log(`${greenText}# Total Bets: ${result.betCount}${resetText}`);
  console.log(`${greenText}# Wins: ${result.winCount}${resetText}`);
  console.log(`${greenText}# Losses: ${result.lossCount}${resetText}`);
  console.log(`${greenText}# Win Ratio: ${((result.winCount / result.betCount) * 100).toFixed(2)}%${resetText}`);
  console.log(`${greenText}# Final Balance: ${result.finalBalance.toFixed(2)}${resetText}`);
  console.log(`${greenText}# Total Profit: ${(result.finalProfit + result.vaultBalance).toFixed(2)}${resetText}`);
  console.log(`${greenText}# Vault Balance: ${result.vaultBalance.toFixed(2)}${resetText}`);
  console.log(`${redText}# Max Recovery Pot Used: ${result.recoveryPotUsed.toFixed(2)}${resetText}`);
  console.log(`${greenText}# Largest Bet Placed: ${largestBetPlaced.toFixed(2)}${resetText}`);
  console.log(`${greenText}# Max Win Streak: ${result.maxWinStreak}${resetText}`);
  console.log(`${greenText}# Max Loss Streak: ${result.maxLossStreak}${resetText}`);
  console.log(`${greenText}# Closing Server Seed: ${randomServerSeed}${resetText}`);
  console.log(`${greenText}# Closing Client Seed: ${randomClientSeed}${resetText}`);
  console.log(`${greenText}# Closing Nonce: ${result.finalNonce}${resetText}`);
  console.log(`${greenText}##########################################${resetText}`);
});
