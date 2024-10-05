import {BoardState} from "../types/game.js";

export const generateRandomBoard = (): BoardState => {
    const rows = Array.from({ length: Math.floor(Math.random() * 3) + 3 }, () => Math.floor(Math.random() * 6) + 1);
    return { rows, playerTurn: Math.random() < 0.5 ? 1 : 2 };
}
