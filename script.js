document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.querySelector('.grid-container');
    const scoreDisplay = document.getElementById('score');
    const scoreAddition = document.getElementById('score-addition');
    const bestScoreDisplay = document.getElementById('best-score');
    const undoButton = document.getElementById('undo-button');
    const undoCount = document.getElementById('undo-count');
    const hintButton = document.getElementById('hint-button');
    const hintLabel = document.getElementById('hint-label');
    const hintStatus = document.getElementById('hint-status');
    const autoButton = document.getElementById('auto-button');
    const autoButtonLabel = document.getElementById('auto-button-label');
    const autoTargetSelect = document.getElementById('auto-target');
    const autoStatus = document.getElementById('auto-status');
    const installButton = document.getElementById('install-button');
    const restartButton = document.getElementById('restart-button');
    const messageContainer = document.querySelector('.game-message');
    const retryButton = document.querySelector('.retry-button');

    const GRID_SIZE = 4;
    const MAX_HISTORY_LENGTH = 5;
    const DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const AI_DIRECTION_ORDER = ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp'];
    const DIRECTION_NAMES = {
        ArrowUp: '↑ 向上',
        ArrowDown: '↓ 向下',
        ArrowLeft: '← 向左',
        ArrowRight: '→ 向右'
    };

    let grid = createEmptyGrid();
    let score = 0;
    let bestScore = Number(localStorage.getItem('2048-best-score')) || 0;
    let history = [];
    let inputLocked = false;
    let touchStart = null;
    let reachedTarget = false;
    let animationToken = 0;
    let autoPlaying = false;
    let autoRunToken = 0;
    let autoMoveCount = 0;
    let deferredInstallPrompt = null;

    function createEmptyGrid() {
        return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    }

    function cloneGrid(source) {
        return source.map(row => row.slice());
    }

    function setupGridCells() {
        gridContainer.innerHTML = '';
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            gridContainer.appendChild(cell);
        }
    }

    function startGame() {
        stopAutoPlay('', false);
        grid = createEmptyGrid();
        score = 0;
        history = [];
        inputLocked = false;
        reachedTarget = false;
        animationToken++;
        hintButton.disabled = false;
        hintLabel.textContent = '智能提示';
        messageContainer.classList.remove('visible');
        addRandomTile();
        addRandomTile();
        updateGrid();
        refreshTargetOptions(2048);
        autoStatus.textContent = '选择目标后交给 AI';
        setHintStatus('提示会预测随机落子，并搜索后续局面');
    }

    function getEmptyCells(board) {
        const cells = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] === 0) cells.push([r, c]);
            }
        }
        return cells;
    }

    function getMaxTile(board = grid) {
        return Math.max(...board.flat());
    }

    function refreshTargetOptions(preferredTarget = Number(autoTargetSelect.value) || 2048) {
        const currentMax = getMaxTile();
        autoTargetSelect.innerHTML = '';

        const unlimited = document.createElement('option');
        unlimited.value = '';
        unlimited.textContent = '不限 · 直到结束';
        autoTargetSelect.appendChild(unlimited);

        let target = Math.max(4, currentMax * 2);
        const upperLimit = Math.max(131072, target * 4);
        while (target <= upperLimit) {
            const option = document.createElement('option');
            option.value = String(target);
            option.textContent = String(target);
            autoTargetSelect.appendChild(option);
            target *= 2;
        }

        const preferred = preferredTarget > currentMax ? String(preferredTarget) : '';
        autoTargetSelect.value = [...autoTargetSelect.options].some(option => option.value === preferred)
            ? preferred
            : String(Math.max(4, currentMax * 2));
    }

    function addRandomTile() {
        const emptyCells = getEmptyCells(grid);
        if (!emptyCells.length) return '';
        const [r, c] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        grid[r][c] = Math.random() < 0.9 ? 2 : 4;
        return `${r}-${c}`;
    }

    function updateGrid(newTileKey = '', mergedKeys = new Set(), scoreGain = 0) {
        gridContainer.querySelectorAll('.tile').forEach(tile => tile.remove());

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const value = grid[r][c];
                if (!value) continue;
                const tile = document.createElement('div');
                const levelClass = value <= 2048 ? `tile-${value}` : 'tile-super';
                tile.className = `tile ${levelClass}`;
                tile.style.setProperty('--row', r);
                tile.style.setProperty('--col', c);
                tile.dataset.row = r;
                tile.dataset.col = c;
                tile.textContent = value;
                tile.setAttribute('aria-label', String(value));
                if (`${r}-${c}` === newTileKey) tile.classList.add('tile-new');
                if (mergedKeys.has(`${r}-${c}`)) tile.classList.add('tile-merged');
                if (value >= 1024) tile.classList.add('tile-small-text');
                gridContainer.appendChild(tile);
            }
        }

        scoreDisplay.textContent = score;
        bestScoreDisplay.textContent = bestScore;
        undoCount.textContent = `${history.length}/${MAX_HISTORY_LENGTH}`;
        undoButton.disabled = history.length === 0 || inputLocked || autoPlaying;
        hintButton.disabled = inputLocked || autoPlaying;

        if (scoreGain > 0) {
            scoreAddition.textContent = `+${scoreGain}`;
            scoreAddition.classList.remove('pop');
            void scoreAddition.offsetWidth;
            scoreAddition.classList.add('pop');
        }
    }

    function transformLine(line) {
        const compact = line.filter(Boolean);
        const result = [];
        let gain = 0;
        const mergedIndices = [];

        for (let i = 0; i < compact.length; i++) {
            if (compact[i] === compact[i + 1]) {
                const merged = compact[i] * 2;
                result.push(merged);
                gain += merged;
                mergedIndices.push(result.length - 1);
                i++;
            } else {
                result.push(compact[i]);
            }
        }
        while (result.length < GRID_SIZE) result.push(0);
        return { line: result, gain, mergedIndices };
    }

    function simulateMove(board, direction) {
        const next = createEmptyGrid();
        let gain = 0;
        const mergedKeys = new Set();

        for (let index = 0; index < GRID_SIZE; index++) {
            let line = direction === 'ArrowLeft' || direction === 'ArrowRight'
                ? board[index].slice()
                : board.map(row => row[index]);
            const reversed = direction === 'ArrowRight' || direction === 'ArrowDown';
            if (reversed) line.reverse();
            const transformed = transformLine(line);
            let output = transformed.line;
            if (reversed) output = output.slice().reverse();
            gain += transformed.gain;

            for (let position = 0; position < GRID_SIZE; position++) {
                const r = direction === 'ArrowLeft' || direction === 'ArrowRight' ? index : position;
                const c = direction === 'ArrowLeft' || direction === 'ArrowRight' ? position : index;
                next[r][c] = output[position];
            }

            for (const mergedIndex of transformed.mergedIndices) {
                const finalPosition = reversed ? GRID_SIZE - 1 - mergedIndex : mergedIndex;
                const r = direction === 'ArrowLeft' || direction === 'ArrowRight' ? index : finalPosition;
                const c = direction === 'ArrowLeft' || direction === 'ArrowRight' ? finalPosition : index;
                mergedKeys.add(`${r}-${c}`);
            }
        }

        const moved = board.some((row, r) => row.some((value, c) => value !== next[r][c]));
        return { grid: next, moved, gain, mergedKeys };
    }

    function saveHistory() {
        history.push({ grid: cloneGrid(grid), score });
        if (history.length > MAX_HISTORY_LENGTH) history.shift();
    }

    function getMovementLines(direction) {
        const lines = [];
        for (let index = 0; index < GRID_SIZE; index++) {
            const line = [];
            for (let position = 0; position < GRID_SIZE; position++) {
                if (direction === 'ArrowLeft') line.push([index, position]);
                if (direction === 'ArrowRight') line.push([index, GRID_SIZE - 1 - position]);
                if (direction === 'ArrowUp') line.push([position, index]);
                if (direction === 'ArrowDown') line.push([GRID_SIZE - 1 - position, index]);
            }
            lines.push(line);
        }
        return lines;
    }

    function calculateTileMotions(board, direction) {
        const motions = new Map();
        for (const line of getMovementLines(direction)) {
            const sources = line.filter(([r, c]) => board[r][c] !== 0);
            let targetIndex = 0;
            for (let i = 0; i < sources.length; i++) {
                const source = sources[i];
                const nextSource = sources[i + 1];
                const destination = line[targetIndex++];
                motions.set(source.join('-'), destination);
                if (nextSource && board[source[0]][source[1]] === board[nextSource[0]][nextSource[1]]) {
                    motions.set(nextSource.join('-'), destination);
                    i++;
                }
            }
        }
        return motions;
    }

    function animateTiles(board, direction) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
        const motions = calculateTileMotions(board, direction);
        const gap = Number.parseFloat(getComputedStyle(gridContainer).columnGap) || 0;
        const tile = gridContainer.querySelector('.tile');
        const step = (tile?.offsetWidth || 0) + gap;

        gridContainer.querySelectorAll('.tile').forEach(element => {
            const fromR = Number(element.dataset.row);
            const fromC = Number(element.dataset.col);
            const destination = motions.get(`${fromR}-${fromC}`);
            if (!destination) return;
            const [toR, toC] = destination;
            element.classList.add('tile-sliding');
            element.style.transform = `translate(${(toC - fromC) * step}px, ${(toR - fromR) * step}px)`;
        });
        return new Promise(resolve => setTimeout(resolve, 155));
    }

    async function performMove(direction) {
        if (inputLocked || !DIRECTIONS.includes(direction)) return false;
        const result = simulateMove(grid, direction);
        if (!result.moved) return false;

        saveHistory();
        const previousGrid = cloneGrid(grid);
        grid = result.grid;
        score += result.gain;
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('2048-best-score', String(bestScore));
        }
        inputLocked = true;
        hintButton.disabled = true;
        undoButton.disabled = true;
        const token = ++animationToken;
        await animateTiles(previousGrid, direction);
        if (token !== animationToken) return false;

        const newTileKey = addRandomTile();
        inputLocked = false;
        hintButton.disabled = autoPlaying;
        updateGrid(newTileKey, result.mergedKeys, result.gain);

        if (!reachedTarget && grid.some(row => row.some(value => value >= 2048))) {
            reachedTarget = true;
            setHintStatus('🎉 已达成 2048！你可以继续挑战更高数字');
        }
        if (!autoPlaying) refreshTargetOptions();
        if (isGameOver(grid)) showGameOver();
        return true;
    }

    function isGameOver(board) {
        if (getEmptyCells(board).length) return false;
        return DIRECTIONS.every(direction => !simulateMove(board, direction).moved);
    }

    function showGameOver() {
        messageContainer.querySelector('p').textContent = '游戏结束';
        messageContainer.querySelector('.message-score').textContent = `本局得分 ${score}`;
        messageContainer.classList.add('visible');
    }

    function undo() {
        if (inputLocked || autoPlaying || !history.length) return;
        const previous = history.pop();
        grid = previous.grid;
        score = previous.score;
        messageContainer.classList.remove('visible');
        updateGrid();
        refreshTargetOptions();
        setHintStatus('已撤回上一步');
    }

    // Expectimax：玩家层选择方向，随机层按 90% 出 2、10% 出 4 计算期望。
    const SEARCH_ABORTED = Symbol('search-aborted');
    // 固定右下角的蛇形梯度。指数权重能防止搜索在中途随意更换主角落。
    const SNAKE_RANKS = [
        [3, 2, 1, 0],
        [4, 5, 6, 7],
        [11, 10, 9, 8],
        [12, 13, 14, 15]
    ];
    const POSITION_WEIGHTS = SNAKE_RANKS.map(row => row.map(rank => 4 ** rank));

    function log2(value) {
        return value ? Math.log2(value) : 0;
    }

    function evaluateBoard(board) {
        const emptyCount = getEmptyCells(board).length;
        let smoothness = 0;
        let positional = 0;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const value = board[r][c];
                if (!value) continue;
                positional += value * POSITION_WEIGHTS[r][c];
                const current = log2(value);
                if (c + 1 < GRID_SIZE && board[r][c + 1]) {
                    const neighbour = log2(board[r][c + 1]);
                    smoothness -= Math.abs(current - neighbour);
                }
                if (r + 1 < GRID_SIZE && board[r + 1][c]) {
                    const neighbour = log2(board[r + 1][c]);
                    smoothness -= Math.abs(current - neighbour);
                }
            }
        }
        return positional + emptyCount * 200000 + smoothness * 4000;
    }

    function boardKey(board) {
        return board.flat().map(log2).join(',');
    }

    function getBestMove(timeLimit = 320) {
        const deadline = performance.now() + timeLimit;
        let bestCompleted = null;
        const legalMoves = AI_DIRECTION_ORDER
            .map(direction => ({ direction, result: simulateMove(grid, direction) }))
            .filter(move => move.result.moved);

        if (!legalMoves.length) return null;
        if (legalMoves.length === 1) return { direction: legalMoves[0].direction, depth: 0 };

        for (let depth = 1; depth <= 7; depth++) {
            const cache = new Map();
            let depthBest = null;
            try {
                for (const move of legalMoves) {
                    const value = move.result.gain * 12
                        + expectChance(move.result.grid, depth - 1, deadline, cache);
                    if (!depthBest || value > depthBest.value) {
                        depthBest = { direction: move.direction, value, depth };
                    }
                }
            } catch (error) {
                if (error !== SEARCH_ABORTED) throw error;
                break;
            }
            bestCompleted = depthBest;
        }
        return bestCompleted || { direction: legalMoves[0].direction, depth: 0 };
    }

    function expectMax(board, depth, deadline, cache) {
        if (performance.now() >= deadline) throw SEARCH_ABORTED;
        if (depth <= 0) return evaluateBoard(board);
        const key = `M${depth}:${boardKey(board)}`;
        if (cache.has(key)) return cache.get(key);

        let best = -Infinity;
        for (const direction of AI_DIRECTION_ORDER) {
            const result = simulateMove(board, direction);
            if (!result.moved) continue;
            const value = result.gain * 12 + expectChance(result.grid, depth - 1, deadline, cache);
            best = Math.max(best, value);
        }
        if (best === -Infinity) best = evaluateBoard(board) - 100000;
        cache.set(key, best);
        return best;
    }

    function expectChance(board, depth, deadline, cache) {
        if (performance.now() >= deadline) throw SEARCH_ABORTED;
        let emptyCells = getEmptyCells(board);
        if (!emptyCells.length) return expectMax(board, depth, deadline, cache);
        const key = `C${depth}:${boardKey(board)}`;
        if (cache.has(key)) return cache.get(key);

        // 开局空位很多时对随机格做均匀采样，换取更深的有效搜索。
        if (emptyCells.length > 6) {
            const allCells = emptyCells;
            emptyCells = Array.from({ length: 6 }, (_, index) => {
                const sourceIndex = Math.round(index * (allCells.length - 1) / 5);
                return allCells[sourceIndex];
            });
        }

        let expected = 0;
        const cellProbability = 1 / emptyCells.length;
        for (const [r, c] of emptyCells) {
            board[r][c] = 2;
            expected += cellProbability * 0.9 * expectMax(board, depth, deadline, cache);
            board[r][c] = 4;
            expected += cellProbability * 0.1 * expectMax(board, depth, deadline, cache);
            board[r][c] = 0;
        }
        cache.set(key, expected);
        return expected;
    }

    function setHintStatus(message, direction = '') {
        hintStatus.textContent = message;
        hintStatus.dataset.direction = direction;
    }

    function updateAutoControls() {
        autoButton.classList.toggle('is-running', autoPlaying);
        autoButtonLabel.textContent = autoPlaying ? '暂停代打' : '开始代打';
        autoButton.querySelector('.auto-play-icon').textContent = autoPlaying ? 'Ⅱ' : '▶';
        autoTargetSelect.disabled = autoPlaying;
        hintButton.disabled = inputLocked || autoPlaying;
        undoButton.disabled = history.length === 0 || inputLocked || autoPlaying;
    }

    function stopAutoPlay(message = 'AI 已暂停', announce = true) {
        const wasPlaying = autoPlaying;
        autoPlaying = false;
        if (wasPlaying) autoRunToken++;
        updateAutoControls();
        if (announce && message) autoStatus.textContent = message;
        if (!inputLocked) refreshTargetOptions();
    }

    async function runAutoPlay(runToken, target) {
        while (autoPlaying && runToken === autoRunToken) {
            if (isGameOver(grid)) {
                showGameOver();
                stopAutoPlay(`代打结束 · 共完成 ${autoMoveCount} 步`);
                return;
            }

            inputLocked = true;
            updateAutoControls();
            autoStatus.textContent = `AI 正在计算第 ${autoMoveCount + 1} 步…`;
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
            const bestMove = getBestMove(260);

            if (!autoPlaying || runToken !== autoRunToken) {
                inputLocked = false;
                updateAutoControls();
                return;
            }
            inputLocked = false;

            if (!bestMove) {
                showGameOver();
                stopAutoPlay(`代打结束 · 共完成 ${autoMoveCount} 步`);
                return;
            }

            setHintStatus(`AI 选择 ${DIRECTION_NAMES[bestMove.direction]} · 搜索 ${bestMove.depth} 层`, bestMove.direction);
            const moved = await performMove(bestMove.direction);
            if (!moved || !autoPlaying || runToken !== autoRunToken) return;

            autoMoveCount++;
            const currentMax = getMaxTile();
            if (target && currentMax >= target) {
                stopAutoPlay(`目标达成：已合成 ${target} · 共 ${autoMoveCount} 步`);
                setHintStatus(`🎯 AI 已合成 ${target}，自动暂停`);
                return;
            }

            autoStatus.textContent = `已自动操作 ${autoMoveCount} 步 · 当前最大 ${currentMax}`;
            await new Promise(resolve => setTimeout(resolve, 110));
        }
    }

    function toggleAutoPlay() {
        if (autoPlaying) {
            stopAutoPlay(`已暂停 · 完成 ${autoMoveCount} 步，当前最大 ${getMaxTile()}`);
            return;
        }
        if (inputLocked) {
            autoStatus.textContent = '请等待当前动作结束';
            return;
        }

        const target = Number(autoTargetSelect.value) || null;
        const currentMax = getMaxTile();
        if (target && target <= currentMax) {
            refreshTargetOptions();
            autoStatus.textContent = '目标必须大于当前最大数字';
            return;
        }

        autoPlaying = true;
        autoMoveCount = 0;
        const runToken = ++autoRunToken;
        updateAutoControls();
        autoStatus.textContent = target ? `目标 ${target} · AI 准备开始` : '持续代打 · 直到游戏结束';
        runAutoPlay(runToken, target);
    }

    function setupPwa() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js').catch(error => {
                    console.warn('离线服务注册失败：', error);
                });
            });
        }

        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            deferredInstallPrompt = event;
            installButton.hidden = false;
        });

        if (isIos && !isStandalone) {
            installButton.hidden = false;
            installButton.textContent = '添加到主屏幕';
        }

        installButton.addEventListener('click', async () => {
            if (!deferredInstallPrompt) {
                setHintStatus('iPhone：点击 Safari 的分享按钮，再选择“添加到主屏幕”');
                return;
            }

            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            if (choice.outcome === 'accepted') installButton.hidden = true;
        });

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            installButton.hidden = true;
            setHintStatus('2048 已安装到设备，可以离线游玩');
        });
    }

    async function useHint() {
        if (inputLocked || autoPlaying || isGameOver(grid)) return;
        inputLocked = true;
        hintButton.disabled = true;
        undoButton.disabled = true;
        hintLabel.textContent = '思考中…';
        setHintStatus('正在推演随机落子与后续局面…');

        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        const bestMove = getBestMove();
        inputLocked = false;
        hintButton.disabled = false;
        hintLabel.textContent = '智能提示';

        if (!bestMove) {
            showGameOver();
            return;
        }
        setHintStatus(`建议 ${DIRECTION_NAMES[bestMove.direction]} · 已向前搜索 ${bestMove.depth} 层`, bestMove.direction);
        await performMove(bestMove.direction);
    }

    document.addEventListener('keydown', event => {
        if (!DIRECTIONS.includes(event.key)) return;
        event.preventDefault();
        if (autoPlaying) return;
        performMove(event.key);
    });

    gridContainer.addEventListener('touchstart', event => {
        const touch = event.changedTouches[0];
        touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });

    gridContainer.addEventListener('touchend', event => {
        if (!touchStart) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        touchStart = null;
        if (autoPlaying) return;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            performMove(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
        } else {
            performMove(dy > 0 ? 'ArrowDown' : 'ArrowUp');
        }
    }, { passive: true });

    undoButton.addEventListener('click', undo);
    hintButton.addEventListener('click', useHint);
    autoButton.addEventListener('click', toggleAutoPlay);
    restartButton.addEventListener('click', startGame);
    retryButton.addEventListener('click', startGame);

    setupGridCells();
    setupPwa();
    startGame();
});
