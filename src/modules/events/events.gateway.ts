import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';
import { Rooms } from '../../common/events/socket-events';

@WebSocketGateway({
  namespace: "/events",
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly eventsService: EventsService) {}

  // OnGatewayInit: runs once when the gateway is ready
  afterInit(server: Server) {
    // Give the EventsService a reference to the server
    // so it can emit events from anywhere in the app
    this.eventsService.setServer(server);
    this.logger.log('WebSocket Gateway initialized');
  }

  // OnGatewayConnection: runs every time a client connects
  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  // OnGatewayDisconnect: runs every time a client disconnects
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  
  @SubscribeMessage('kitchen.join')
  handleJoinKitchen(
    @MessageBody() data: { branchId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = Rooms.kitchen(data.branchId);
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);

    // Acknowledge back to the client
    return { event: 'kitchen.join', status: 'joined', room };
  }

  
  @SubscribeMessage('order.join')
  handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = Rooms.order(data.orderId);
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);

    return { event: 'order.join', status: 'joined', room };
  }


  @SubscribeMessage('user.join')
  handleJoinUser(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = Rooms.user(data.userId);
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);

    return { event: 'user.join', status: 'joined', room };
  }
}