const SIZE = 4;
const DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const BASE_RANKS = [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [11, 10, 9, 8],
    [12, 13, 14, 15]
];

function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function transformRanks(source, flipRows, flipColumns, transpose) {
    const ranks = emptyGrid();
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            let sourceR = flipRows ? SIZE - 1 - r : r;
            let sourceC = flipColumns ? SIZE - 1 - c : c;
            if (transpose) [sourceR, sourceC] = [sourceC, sourceR];
            ranks[r][c] = source[sourceR][sourceC];
        }
    }
    return ranks;
}

const PROFILES = [];
for (const transpose of [false, true]) {
    for (const flipRows of [false, true]) {
        for (const flipColumns of [false, true]) {
            const ranks = transformRanks(BASE_RANKS, flipRows, flipColumns, transpose);
            PROFILES.push(ranks.map(row => row.map(rank => 4 ** rank)));
        }
    }
}

function transformLine(line) {
    const compact = line.filter(Boolean);
    const output = [];
    let gain = 0;
    for (let i = 0; i < compact.length; i++) {
        if (compact[i] === compact[i + 1]) {
            output.push(compact[i] * 2);
            gain += compact[i] * 2;
            i++;
        } else {
            output.push(compact[i]);
        }
    }
    while (output.length < SIZE) output.push(0);
    return { output, gain };
}

function move(board, direction) {
    const next = emptyGrid();
    let gain = 0;
    for (let index = 0; index < SIZE; index++) {
        let line = direction === 'ArrowLeft' || direction === 'ArrowRight'
            ? board[index].slice()
            : board.map(row => row[index]);
        const reversed = direction === 'ArrowRight' || direction === 'ArrowDown';
        if (reversed) line.reverse();
        const transformed = transformLine(line);
        let output = transformed.output;
        if (reversed) output = output.slice().reverse();
        gain += transformed.gain;
        for (let position = 0; position < SIZE; position++) {
            const r = direction === 'ArrowLeft' || direction === 'ArrowRight' ? index : position;
            const c = direction === 'ArrowLeft' || direction === 'ArrowRight' ? position : index;
            next[r][c] = output[position];
        }
    }
    const moved = board.some((row, r) => row.some((value, c) => value !== next[r][c]));
    return { board: next, moved, gain };
}

function emptyCells(board) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) if (!board[r][c]) cells.push([r, c]);
    }
    return cells;
}

function addRandomTile(board) {
    const cells = emptyCells(board);
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    board[r][c] = Math.random() < .9 ? 2 : 4;
}

function chooseProfile(board) {
    let bestProfile = PROFILES[0];
    let bestFit = -Infinity;
    for (const profile of PROFILES) {
        let fit = 0;
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) fit += board[r][c] * profile[r][c];
        }
        if (fit > bestFit) {
            bestFit = fit;
            bestProfile = profile;
        }
    }
    return bestProfile;
}

function evaluate(board, profile) {
    let positional = 0;
    let smoothness = 0;
    let mergePotential = 0;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!board[r][c]) continue;
            positional += board[r][c] * profile[r][c];
            const current = Math.log2(board[r][c]);
            if (c + 1 < SIZE && board[r][c + 1]) {
                smoothness -= Math.abs(current - Math.log2(board[r][c + 1]));
                if (board[r][c] === board[r][c + 1]) mergePotential++;
            }
            if (r + 1 < SIZE && board[r + 1][c]) {
                smoothness -= Math.abs(current - Math.log2(board[r + 1][c]));
                if (board[r][c] === board[r + 1][c]) mergePotential++;
            }
        }
    }
    return positional + emptyCells(board).length * 200000 + smoothness * 4000 + mergePotential * 18000;
}

function chooseMove(board, profile) {
    let best = null;
    for (const direction of DIRECTIONS) {
        const result = move(board, direction);
        if (!result.moved) continue;
        const value = evaluate(result.board, profile) + result.gain * 12 + Math.random() * 10;
        if (!best || value > best.value) best = { ...result, value };
    }
    return best;
}

function reachesTarget(startBoard, target, stepLimit) {
    let board = startBoard.map(row => row.slice());
    const profile = chooseProfile(board);
    for (let step = 0; step < stepLimit; step++) {
        if (Math.max(...board.flat()) >= target) return true;
        const result = chooseMove(board, profile);
        if (!result) return false;
        board = result.board;
        addRandomTile(board);
    }
    return Math.max(...board.flat()) >= target;
}

self.addEventListener('message', event => {
    const { id, board, target, rollouts = 56 } = event.data;
    const targetExponent = Math.log2(target || 4);
    const stepLimit = Math.min(320, Math.max(90, targetExponent * 24));
    let successes = 0;
    for (let i = 0; i < rollouts; i++) {
        if (reachesTarget(board, target, stepLimit)) successes++;
    }
    self.postMessage({ id, target, probability: Math.round(successes / rollouts * 100), rollouts });
});
