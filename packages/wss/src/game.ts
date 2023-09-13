
import { ClientToServerEvents, ServerToClientEvents, SocketData } from "../events";
import { Socket, type Server } from "socket.io";
import { RoomManager } from "./roomManager";
import { InMemorySessionStore as SessionStore } from "./sessionManager";
import { UserId, RoomId, Participant } from "../types";
import { v4 as uuidV4 } from 'uuid';

export class Game {
  private roomManager = new RoomManager(); 
  private sessionStore = new SessionStore();

  constructor( private server: Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData >) {
    this.initialize();
  }


  private initialize() {
    this.server.use((socket, next) => {
      const sessionId = socket.handshake.auth.sessionId
      const username = socket.handshake.auth.username
      const roomId = socket.handshake.auth.roomId

      console.log(sessionId, username, roomId)

      if (sessionId) {
        // find existing session
        const session = this.sessionStore.findSession(sessionId);
        if (session) {
          socket.data.sessionId = sessionId;
          socket.data.userId = session.userID;
          socket.data.roomId = roomId;
          socket.data.username = username;
          return next();
        }
      }

      console.log("setting new session stuff")
      socket.data.sessionId = uuidV4();
      socket.data.userId = uuidV4();
      socket.data.username = username;
      next();
    })


    this.server.on("connection", (socket) => {

      /**
       * Establish Sessions for all Web Socket Connections
       */
      this.sessionStore.saveSession(socket.data.sessionId, {
        userID: socket.data.userId,
        connected: true
      });
      socket.emit("SessionCreate", {
        sessionID: socket.data.sessionId
      })

      this.userJoinAndUpdateGameState(socket, socket.data.roomId, {
        id: socket.data.userId,
        username: socket.data.username
      })
    

      this.createEventListeners(socket)
      

      
    });
  }  

  private userJoinAndUpdateGameState(socket: Socket, roomId: string, user: Participant) {
    if (this.roomManager.joinRoom(roomId, user)){
      socket.join(roomId);
      user.roomId = roomId;
      this.emitGameState(roomId);
    }
  }
  private createEventListeners(socket: Socket): void {
      /**
       * Initialize Websocket Listeners
       */
      socket.on("UserJoin", ({ roomId, username }) => {
        if (this.roomManager.joinRoom(roomId, username)){
          socket.join(roomId);
          this.emitGameState(roomId);
        }
      });

      socket.on("UserLeave", (payload) => {
        socket.leave(payload.roomId);
        this.emitGameState(payload.roomId);
      })

      socket.on("disconnecting", (reason) => {
        // console.log(`Disconnecting ${socket.id} for "${reason}"`)
        // const exitRoomId = this.roomManager.handleUserDisconnect(socket.id);
        // this.emitGameState(exitRoomId);
      })

      socket.onAny((event, ...args) => {
        console.log(event, args);
      });
  }

  private emitGameState(roomId: RoomId): void {
    this.server.to(roomId).emit("GameStateUpdate", {
      raceState: {
        roomId: roomId,
        participants: this.roomManager.getParticiapnts(roomId)
      }
    })
  }
}