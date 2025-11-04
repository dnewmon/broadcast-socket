#!/usr/bin/env node

import { Command } from "commander";
import { createSocketServer } from "./server";
import { ServerConfig } from "./types";

const program = new Command();

program
    .name("broadcast-socket-server")
    .description("Broadcast WebSocket server with channel support")
    .version("1.0.0")
    .option("-p, --port <number>", "Port to run the server on", "12000")
    .option("-c, --cors-origin <string>", "CORS origin", "http://localhost:5173")
    .parse(process.argv);

const options = program.opts();

const config: ServerConfig = {
    port: parseInt(options.port, 10),
    corsOrigin: options.corsOrigin,
};

// Start the server
createSocketServer(config);
