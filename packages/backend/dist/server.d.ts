import { Server as SocketIOServer } from "socket.io";
import { ServerConfig } from "./types";
export declare function createSocketServer(config: ServerConfig): {
    app: import("express-serve-static-core").Express;
    httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
    io: SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
};
