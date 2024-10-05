import {BoardState} from "./game.js";

interface Room {
    roomId: string;
    boardState: BoardState;
    players: {
        host: string;        // Player 1
        opponent?: string;  // Player 2
        spectators: string[];
    };
    createdAt: Date;
}
