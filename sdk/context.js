"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastContext = void 0;
exports.BroadcastSocketProvider = BroadcastSocketProvider;
exports.useBroadcastContext = useBroadcastContext;
const react_1 = __importStar(require("react"));
const hooks_1 = require("./hooks");
exports.BroadcastContext = (0, react_1.createContext)(null);
function BroadcastSocketProvider({ url, options = {}, children }) {
    const { state, send, subscribe, unsubscribe, broadcast, addMessageListener } = (0, hooks_1.useBroadcastSocket)(url, options);
    const contextValue = {
        socket: null,
        state,
        subscribe,
        unsubscribe,
        broadcast,
        send,
        addMessageListener
    };
    return react_1.default.createElement(exports.BroadcastContext.Provider, { value: contextValue }, children);
}
function useBroadcastContext() {
    const context = (0, react_1.useContext)(exports.BroadcastContext);
    if (!context) {
        throw new Error('useBroadcastContext must be used within a BroadcastSocketProvider');
    }
    return context;
}
//# sourceMappingURL=context.js.map