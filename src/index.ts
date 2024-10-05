import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { Move } from './types/game.js';
import cors from 'cors';
import { Room } from './types/network.js';
import { generateRandomBoard } from './utils/game-logic.js';

// Utility functions
function generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// In-memory store for game rooms
const rooms: { [roomId: string]: Room } = {};

// Express setup
const app = express();
app.use(
    cors({
        // origin: 'http://localhost:5173',
        // origin: 'http://10.110.33.214:5173',
        origin: 'https://nim.henhen1227.com',
        methods: ['GET', 'POST'],
    })
);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // origin: 'http://localhost:5173',
        // origin: 'http://10.110.33.214:5173',
        origin: 'https://nim.henhen1227.com',
        methods: ['GET', 'POST'],
    },
});

io.on('connection', (socket: Socket) => {
    console.log(`New connection: ${socket.id}`);
    socket.emit('connected', socket.id);

    // Host a new game
    socket.on('hostGame', () => {
        const roomId = generateRoomCode();
        console.log(`Creating room: ${roomId}`);
        const newRoom: Room = {
            roomId,
            boardState: generateRandomBoard(),
            players: {
                host: socket.id,
                spectators: [],
            },
            createdAt: new Date(),
        };
        rooms[roomId] = newRoom;

        socket.join(roomId);
        socket.emit('gameHosted', roomId, newRoom.boardState);
        console.log(`Room created: ${roomId}`);
    });

    // Join an existing game
    socket.on('joinGame', (roomId: string) => {
        const room = rooms[roomId];
        if (room) {
            if (!room.players.opponent) {
                // Assign as Player 2
                room.players.opponent = socket.id;
                socket.join(roomId);
                socket.emit('joinedGame', roomId, room.boardState, 2);
                io.to(roomId).emit('playerJoined', 2);
                console.log(`Player 2 (${socket.id}) joined room: ${roomId}`);
            } else {
                // Add as a spectator
                room.players.spectators.push(socket.id);
                socket.join(roomId);
                socket.emit('joinedGame', roomId, room.boardState, 0);
                io.to(roomId).emit('spectatorJoined', room.players.spectators.length);
                console.log(`Spectator (${socket.id}) joined room: ${roomId}`);
            }
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Player makes a move
    socket.on('playerMove', (roomId: string, move: Move) => {
        const room = rooms[roomId];
        if (room) {
            const currentPlayerId =
                room.boardState.playerTurn === 1 ? room.players.host : room.players.opponent;

            if (socket.id !== currentPlayerId) {
                socket.emit('error', 'Not your turn or you are a spectator');
                return;
            }

            // Validate and apply the move
            if (room.boardState.rows[move.rowIndex] >= move.count && move.count > 0) {
                room.boardState.rows[move.rowIndex] -= move.count;
                room.boardState.playerTurn = room.boardState.playerTurn === 1 ? 2 : 1;

                // Check for winner
                const totalChocolates = room.boardState.rows.reduce((sum, row) => sum + row, 0);
                if (totalChocolates === 0) {
                    const winner = room.boardState.playerTurn === 1 ? 2 : 1;
                    io.to(roomId).emit('gameOver', winner);
                    console.log(`Game over in room ${roomId}. Player ${winner} wins.`);
                } else {
                    io.to(roomId).emit('updateBoard', room.boardState);
                }

                console.log(`Move made in room ${roomId}:`, move);
            } else {
                socket.emit('error', 'Invalid move');
            }
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Player wants to play again
    socket.on('playAgain', (roomId: string) => {
        const room = rooms[roomId];
        console.log(`Player in room ${roomId} wants to play again.`);
        if (room) {
            if (socket.id === room.players.host || socket.id === room.players.opponent) {
                room.boardState = generateRandomBoard();
                io.to(roomId).emit('gameRestarted', room.boardState);
                console.log(`Game in room ${roomId} has been restarted.`);
            } else {
                socket.emit('error', 'Spectators cannot restart the game.');
            }
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Player leaves the game voluntarily
    socket.on('leaveGame', () => {
        handlePlayerLeaving(socket);
    });

    // Player disconnects
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        handlePlayerLeaving(socket);
    });

    // Helper function to handle player leaving or disconnecting
    function handlePlayerLeaving(socket: Socket) {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (!room) continue;

            if (room.players.host === socket.id) {
                // Host leaves
                io.to(roomId).emit('hostLeft');
                console.log(`Host (${socket.id}) left room ${roomId}`);

                // Remove opponent
                if (room.players.opponent) {
                    const opponentSocket = io.sockets.sockets.get(room.players.opponent);
                    if (opponentSocket) {
                        opponentSocket.leave(roomId);
                        opponentSocket.emit('hostLeft');
                    }
                    room.players.opponent = undefined;
                }

                // Remove spectators
                room.players.spectators.forEach(spectatorId => {
                    const spectatorSocket = io.sockets.sockets.get(spectatorId);
                    if (spectatorSocket) {
                        spectatorSocket.leave(roomId);
                        spectatorSocket.emit('hostLeft');
                    }
                });
                room.players.spectators = [];

                // Delete room
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted.`);
                break;
            } else if (room.players.opponent === socket.id) {
                // Opponent leaves
                io.to(roomId).emit('opponentLeft');
                console.log(`Opponent (${socket.id}) left room ${roomId}`);

                // Remove host
                if (room.players.host) {
                    const hostSocket = io.sockets.sockets.get(room.players.host);
                    if (hostSocket) {
                        hostSocket.leave(roomId);
                        hostSocket.emit('opponentLeft');
                    }
                    // room.players.host = undefined;
                }

                // Remove spectators
                room.players.spectators.forEach(spectatorId => {
                    const spectatorSocket = io.sockets.sockets.get(spectatorId);
                    if (spectatorSocket) {
                        spectatorSocket.leave(roomId);
                        spectatorSocket.emit('opponentLeft');
                    }
                });
                room.players.spectators = [];

                // Delete room
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted.`);
                break;
            } else if (room.players.spectators.includes(socket.id)) {
                // Spectator leaves
                room.players.spectators = room.players.spectators.filter(id => id !== socket.id);
                socket.leave(roomId);
                io.to(roomId).emit('spectatorLeft', room.players.spectators.length);
                console.log(`Spectator (${socket.id}) left room ${roomId}.`);

                // Check if the room is empty
                if (!room.players.host && !room.players.opponent && room.players.spectators.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted because it is empty.`);
                }
            }
        }
    }
});

// REST endpoint to get a list of available games
app.get('/games', (_, res) => {
    const availableGames = Object.values(rooms).map((room) => ({
        roomId: room.roomId,
        players: room.players.opponent ? 2 : 1,
        createdAt: room.createdAt,
    }));
    res.json(availableGames);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
