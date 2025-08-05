const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 房间管理
const rooms = {};

io.on('connection', (socket) => {
  console.log(`新连接: ${socket.id}`);
  
  // 创建房间
  socket.on('create-room', (data) => {
    const { roomId, playerName } = data;
    
    if (rooms[roomId]) {
      socket.emit('room-exists');
      return;
    }
    
    rooms[roomId] = {
      players: [{ id: socket.id, name: playerName, role: 'A' }],
      gameState: {
        board: Array(5).fill().map(() => Array(5).fill(false)),
        poisonA: null,
        poisonB: null,
        currentPlayer: 'A',
        gamePhase: 'setupA',
        selectedCells: []
      }
    };
    
    socket.join(roomId);
    socket.emit('room-created', { 
      roomId,
      playerRole: 'A',
      playerName
    });
    
    console.log(`房间 ${roomId} 创建成功`);
  });
  
  // 加入房间
  socket.on('join-room', (data) => {
    const { roomId, playerName } = data;
    
    if (!rooms[roomId]) {
      socket.emit('join-failed', { message: '房间不存在' });
      return;
    }
    
    if (rooms[roomId].players.length >= 2) {
      socket.emit('join-failed', { message: '房间已满' });
      return;
    }
    
    const playerRole = 'B';
    rooms[roomId].players.push({ 
      id: socket.id, 
      name: playerName, 
      role: playerRole 
    });
    
    socket.join(roomId);
    socket.emit('join-success', { 
      roomId,
      playerRole,
      playerName
    });
    
    // 通知所有玩家游戏开始
    io.to(roomId).emit('game-start', {
      playerA: rooms[roomId].players[0].name,
      playerB: playerName
    });
    
    console.log(`玩家 ${playerName} 加入房间 ${roomId}`);
  });
  
  // 玩家操作
  socket.on('player-move', (data) => {
    const { roomId, row, col } = data;
    const room = rooms[roomId];
    
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // 只允许当前玩家操作
    if (room.gameState.currentPlayer !== player.role) return;
    
    // 防止重复选择
    const alreadySelected = room.gameState.selectedCells.some(
      cell => cell.row === row && cell.col === col
    );
    if (alreadySelected) return;
    
    // 更新游戏状态
    room.gameState.selectedCells.push({ row, col });
    
    // 检查是否踩到毒葡萄
    const isPoisonA = room.gameState.poisonA && 
                      room.gameState.poisonA.row === row && 
                      room.gameState.poisonA.col === col;
    
    const isPoisonB = room.gameState.poisonB && 
                      room.gameState.poisonB.row === row && 
                      room.gameState.poisonB.col === col;
    
    if (isPoisonA || isPoisonB) {
      // 游戏结束
      room.gameState.gamePhase = 'ended';
      const loser = player.role;
      const winner = loser === 'A' ? 'B' : 'A';
      
      io.to(roomId).emit('game-ended', {
        winner,
        loser,
        poisonA: room.gameState.poisonA,
        poisonB: room.gameState.poisonB
      });
    } else {
      // 切换玩家
      room.gameState.currentPlayer = room.gameState.currentPlayer === 'A' ? 'B' : 'A';
      
      // 发送更新后的游戏状态
      io.to(roomId).emit('game-state', {
        currentPlayer: room.gameState.currentPlayer,
        selectedCells: room.gameState.selectedCells,
        message: `玩家${room.gameState.currentPlayer}：请采摘葡萄`,
        playerAStatus: room.gameState.currentPlayer === 'A' ? '你的回合' : '等待',
        playerBStatus: room.gameState.currentPlayer === 'B' ? '你的回合' : '等待'
      });
    }
  });
  
  // 设置毒葡萄
  socket.on('set-poison', (data) => {
    const { roomId, row, col } = data;
    const room = rooms[roomId];
    
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    
    // 玩家A设置毒葡萄
    if (player.role === 'A' && room.gameState.gamePhase === 'setupA') {
      room.gameState.poisonA = { row, col };
      room.gameState.gamePhase = 'setupB';
      
      io.to(roomId).emit('game-state', {
        currentPlayer: 'B',
        gamePhase: 'setupB',
        message: `玩家B：请秘密选择一个有毒的葡萄`,
        playerAStatus: '已完成',
        playerBStatus: '设置毒葡萄'
      });
    }
    // 玩家B设置毒葡萄
    else if (player.role === 'B' && room.gameState.gamePhase === 'setupB') {
      room.gameState.poisonB = { row, col };
      room.gameState.gamePhase = 'playing';
      
      io.to(roomId).emit('game-state', {
        currentPlayer: 'A',
        gamePhase: 'playing',
        message: `游戏开始！玩家A先采摘`,
        playerAStatus: '你的回合',
        playerBStatus: '等待'
      });
    }
  });
  
  // 重置游戏
  socket.on('reset-game', (data) => {
    const { roomId } = data;
    const room = rooms[roomId];
    
    if (!room) return;
    
    // 重置游戏状态
    room.gameState = {
      board: Array(5).fill().map(() => Array(5).fill(false)),
      poisonA: null,
      poisonB: null,
      currentPlayer: 'A',
      gamePhase: 'setupA',
      selectedCells: []
    };
    
    io.to(roomId).emit('game-reset', {
      message: `玩家A：请秘密选择一个有毒的葡萄`
    });
  });
  
  // 断开连接处理
  socket.on('disconnect', () => {
    console.log(`客户端断开: ${socket.id}`);
    
    // 清理空房间
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        player => player.id !== socket.id
      );
      
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
        console.log(`房间 ${roomId} 已关闭`);
      }
    }
  });
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    activeRooms: Object.keys(rooms).length
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});