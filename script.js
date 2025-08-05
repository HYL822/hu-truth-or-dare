document.addEventListener('DOMContentLoaded', () => {
    // 游戏状态
    const gameState = {
        board: Array(5).fill().map(() => Array(5).fill(false)),
        poisonA: null,
        poisonB: null,
        currentPlayer: 'A',
        gamePhase: 'setupA',
        selectedCells: [],
        playerRole: null,
        roomId: null,
        playerName: null,
        socket: null
    };
    
    // DOM元素
    const gameBoard = document.getElementById('gameBoard');
    const messageEl = document.getElementById('message');
    const playerAStatus = document.getElementById('playerAStatus');
    const playerBStatus = document.getElementById('playerBStatus');
    const resetBtn = document.getElementById('resetBtn');
    const showPoisonBtn = document.getElementById('showPoisonBtn');
    const resultScreen = document.getElementById('resultScreen');
    const winnerText = document.getElementById('winnerText');
    const loserText = document.getElementById('loserText');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const connectionPanel = document.getElementById('connectionPanel');
    const gameInfo = document.getElementById('gameInfo');
    const gameControls = document.getElementById('gameControls');
    const roomIdInput = document.getElementById('roomId');
    const playerNameInput = document.getElementById('playerName');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const playerAInfo = document.getElementById('playerAInfo');
    const playerBInfo = document.getElementById('playerBInfo');
    
    // 初始化游戏板
    function initBoard() {
        gameBoard.innerHTML = '';
        
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const grape = document.createElement('div');
                grape.className = 'grape';
                grape.dataset.row = row;
                grape.dataset.col = col;
                
                grape.addEventListener('click', () => handleGrapeClick(row, col));
                gameBoard.appendChild(grape);
            }
        }
    }
    
    // 处理葡萄点击
    function handleGrapeClick(row, col) {
        // 只允许当前玩家操作
        if (gameState.currentPlayer !== gameState.playerRole) return;
        
        const grape = document.querySelector(`.grape[data-row="${row}"][data-col="${col}"]`);
        
        if (grape.classList.contains('selected')) return;
        
        // 发送操作到服务器
        gameState.socket.emit('player-move', {
            roomId: gameState.roomId,
            row,
            col
        });
    }
    
    // 显示毒葡萄
    function showPoison() {
        const poisonAGrape = document.querySelector(
            `.grape[data-row="${gameState.poisonA.row}"][data-col="${gameState.poisonA.col}"]`
        );
        const poisonBGrape = document.querySelector(
            `.grape[data-row="${gameState.poisonB.row}"][data-col="${gameState.poisonB.col}"]`
        );
        
        if (poisonAGrape) poisonAGrape.classList.add('poison', 'poison-a');
        if (poisonBGrape) poisonBGrape.classList.add('poison', 'poison-b');
    }
    
    // 重置游戏
    function resetGame() {
        gameState.socket.emit('reset-game', { roomId: gameState.roomId });
    }
    
    // 连接到Socket.io服务器
    function connectToServer() {
        // 替换为你的Railway后端URL
        gameState.socket = io('https://your-railway-app.up.railway.app', {
            transports: ['websocket']
        });
        
        // 连接事件
        gameState.socket.on('connect', () => {
            connectionStatus.textContent = '已连接';
            connectionStatus.className = 'connection-status connected';
        });
        
        gameState.socket.on('disconnect', () => {
            connectionStatus.textContent = '已断开';
            connectionStatus.className = 'connection-status disconnected';
        });
        
        // 房间创建成功
        gameState.socket.on('room-created', (data) => {
            gameState.playerRole = 'A';
            gameState.roomId = data.roomId;
            gameState.playerName = data.playerName;
            startGame();
        });
        
        // 加入房间成功
        gameState.socket.on('join-success', (data) => {
            gameState.playerRole = 'B';
            gameState.roomId = data.roomId;
            gameState.playerName = data.playerName;
            startGame();
        });
        
        // 加入房间失败
        gameState.socket.on('join-failed', (data) => {
            alert(`加入房间失败: ${data.message}`);
        });
        
        // 游戏开始
        gameState.socket.on('game-start', (data) => {
            playerAInfo.querySelector('h3').textContent = data.playerA;
            playerBInfo.querySelector('h3').textContent = data.playerB;
        });
        
        // 游戏状态更新
        gameState.socket.on('game-state', (data) => {
            gameState.currentPlayer = data.currentPlayer;
            gameState.gamePhase = data.gamePhase;
            gameState.selectedCells = data.selectedCells || [];
            
            // 更新UI
            messageEl.textContent = data.message;
            playerAStatus.textContent = data.playerAStatus || '等待';
            playerBStatus.textContent = data.playerBStatus || '等待';
            
            // 更新当前玩家指示器
            playerAInfo.classList.remove('current-player');
            playerBInfo.classList.remove('current-player');
            
            if (gameState.currentPlayer === 'A') {
                playerAInfo.classList.add('current-player');
            } else {
                playerBInfo.classList.add('current-player');
            }
            
            // 更新棋盘
            document.querySelectorAll('.grape').forEach(grape => {
                grape.classList.remove('selected');
            });
            
            gameState.selectedCells.forEach(cell => {
                const grape = document.querySelector(`.grape[data-row="${cell.row}"][data-col="${cell.col}"]`);
                if (grape) grape.classList.add('selected');
            });
        });
        
        // 游戏结束
        gameState.socket.on('game-ended', (data) => {
            gameState.poisonA = data.poisonA;
            gameState.poisonB = data.poisonB;
            showPoison();
            showPoisonBtn.classList.remove('hidden');
            
            const isPlayerA = data.loser === 'A';
            const loser = isPlayerA ? 'A' : 'B';
            const winner = isPlayerA ? 'B' : 'A';
            
            winnerText.textContent = `玩家${winner} 获胜！`;
            loserText.textContent = `玩家${loser} 采到了毒葡萄，接受惩罚！`;
            resultScreen.classList.add('show');
            
            messageEl.textContent = `游戏结束！玩家${loser}采到了毒葡萄`;
        });
        
        // 游戏重置
        gameState.socket.on('game-reset', (data) => {
            gameState.poisonA = null;
            gameState.poisonB = null;
            gameState.currentPlayer = 'A';
            gameState.gamePhase = 'setupA';
            gameState.selectedCells = [];
            
            // 重置UI
            document.querySelectorAll('.grape').forEach(grape => {
                grape.className = 'grape';
            });
            
            messageEl.textContent = data.message;
            playerAStatus.textContent = '设置毒葡萄';
            playerBStatus.textContent = '等待';
            
            playerAInfo.classList.remove('current-player');
            playerBInfo.classList.remove('current-player');
            
            if (gameState.playerRole === 'A') {
                playerAInfo.classList.add('current-player');
            }
            
            showPoisonBtn.classList.add('hidden');
            resultScreen.classList.remove('show');
        });
    }
    
    // 开始游戏
    function startGame() {
        connectionPanel.classList.add('hidden');
        gameInfo.classList.remove('hidden');
        messageEl.classList.remove('hidden');
        gameBoard.classList.remove('hidden');
        gameControls.classList.remove('hidden');
        
        initBoard();
    }
    
    // 事件监听
    resetBtn.addEventListener('click', resetGame);
    playAgainBtn.addEventListener('click', resetGame);
    showPoisonBtn.addEventListener('click', showPoison);
    
    createRoomBtn.addEventListener('click', () => {
        const roomId = roomIdInput.value || 'room-' + Math.random().toString(36).substr(2, 5);
        const playerName = playerNameInput.value || '玩家A';
        
        gameState.socket.emit('create-room', {
            roomId,
            playerName
        });
    });
    
    joinRoomBtn.addEventListener('click', () => {
        const roomId = roomIdInput.value;
        const playerName = playerNameInput.value || '玩家B';
        
        if (!roomId) {
            alert('请输入房间号');
            return;
        }
        
        gameState.socket.emit('join-room', {
            roomId,
            playerName
        });
    });
    
    // 初始化连接
    connectToServer();
});