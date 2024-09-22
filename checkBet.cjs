const crypto = require('crypto');

// Game settings
const GRID_SIZE = 25; // 5x5 grid
const HOUSE_EDGE = 0.01;

// Function to generate a random server seed (hex string)
function generateRandomServerSeed(length = 64) {
    return crypto.randomBytes(length / 2).toString('hex');
}

// Function to generate a random client seed (alphanumeric string)
function generateRandomClientSeed(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let seed = '';
    for (let i = 0; i < length; i++) {
        seed += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return seed;
}

// Byte generator using HMAC-SHA256
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

// Function to generate a random float between 0 and 1
function getRandomFloat(generator) {
    const bytes = [];
    for (let i = 0; i < 4; i++) {
        bytes.push(generator.next().value);
    }

    const floatResult = bytes.reduce((acc, value, i) => acc + value / Math.pow(256, i + 1), 0);
    return floatResult;
}

// Function to generate mine positions using Fisher-Yates shuffle
function generateMinePositions(serverSeed, clientSeed, nonce, numberOfMines) {
    const positions = Array.from({ length: GRID_SIZE }, (_, i) => i); // 0 to 24
    const minePositions = [];

    let cursor = 0;
    const generator = byteGenerator(serverSeed, clientSeed, nonce, cursor);

    for (let i = 0; i < numberOfMines; i++) {
        const randomFloat = getRandomFloat(generator);
        cursor += 4; // 4 bytes used
        const index = Math.floor(randomFloat * positions.length);
        minePositions.push(positions[index]);
        positions.splice(index, 1); // Remove the selected position
    }

    return minePositions.sort((a, b) => a - b);
}

// Function to calculate the payout multiplier
function calculatePayoutMultiplier(numberOfMines, tilesUncovered) {
    let cumulativeProbability = 1.0;

    for (let k = 0; k < tilesUncovered; k++) {
        const numerator = GRID_SIZE - numberOfMines - k;
        const denominator = GRID_SIZE - k;
        cumulativeProbability *= numerator / denominator;
    }

    // Correct payout multiplier calculation
    const payoutMultiplier = (1 - HOUSE_EDGE) / cumulativeProbability;

    return payoutMultiplier;
}

// Function to simulate a Mines game round
function playMinesGame(serverSeed, clientSeed, nonce, numberOfMines) {
    // Generate mine positions
    const minePositions = generateMinePositions(serverSeed, clientSeed, nonce, numberOfMines);

    // Game state
    const uncoveredTiles = [];
    let gameOver = false;
    let win = false;
    let payoutMultiplier = 1.0;

    // All tile indices
    let remainingTiles = Array.from({ length: GRID_SIZE }, (_, i) => i);

    // Simulate player selections
    for (let turn = 0; turn < GRID_SIZE - numberOfMines; turn++) {
        // For simplicity, we'll simulate random tile selection
        // In a real game, the player chooses which tile to uncover
        const safeTiles = remainingTiles.filter((i) => !minePositions.includes(i));

        if (safeTiles.length === 0) {
            // No safe tiles left
            win = true;
            break;
        }

        // Randomly select a safe tile to uncover
        const selectedTile = safeTiles[Math.floor(Math.random() * safeTiles.length)];
        uncoveredTiles.push(selectedTile);

        // Remove the selected tile from remaining tiles
        remainingTiles = remainingTiles.filter((i) => i !== selectedTile);

        // Calculate payout multiplier after this tile
        payoutMultiplier = calculatePayoutMultiplier(numberOfMines, uncoveredTiles.length);

        // Decide whether to cash out
        const cashOut = true; // Set to true to cash out immediately after first uncover
        if (cashOut) {
            win = true;
            break;
        }
    }

    if (!win && !gameOver) {
        // Player continued to the end without hitting a mine
        win = true;
    }

    return {
        minePositions,
        uncoveredTiles,
        win,
        payoutMultiplier,
    };
}

// Example usage
const serverSeed = generateRandomServerSeed();
const clientSeed = generateRandomClientSeed();
const nonce = 1;
const numberOfMines = 5; // Change this to set the number of mines

const gameResult = playMinesGame(serverSeed, clientSeed, nonce, numberOfMines);

console.log('Server Seed:', serverSeed);
console.log('Client Seed:', clientSeed);
console.log('Nonce:', nonce);
console.log('Number of Mines:', numberOfMines);
console.log('Mine Positions:', gameResult.minePositions);
console.log('Uncovered Tiles:', gameResult.uncoveredTiles);
console.log('Win:', gameResult.win);
console.log('Payout Multiplier:', gameResult.payoutMultiplier.toFixed(4));
