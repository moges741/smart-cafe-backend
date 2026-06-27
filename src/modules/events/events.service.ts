import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { SocketEvents, Rooms } from '../../common/events/socket-events';

@Injectable()
export class EventsService {
  private server: Server;

  setServer(server: Server) {
    this.server = server;
  }


  emitNewOrder(order: any) {
    if (!this.server) return;

    // Emit to the kitchen room for this branch
    this.server
      .to(Rooms.kitchen(order.branchId))
      .emit(SocketEvents.KITCHEN_NEW_ORDER, {
        event: SocketEvents.KITCHEN_NEW_ORDER,
        data: order,
        timestamp: new Date().toISOString(),
      });
  }

  emitOrderStatusUpdate(order: any) {
    if (!this.server) return;

    const payload = {
      event: SocketEvents.ORDER_STATUS_UPDATED,
      data: {
        orderId:     order.id,
        orderNumber: order.orderNumber,
        status:      order.status,
        branchId:    order.branchId,
      },
      timestamp: new Date().toISOString(),
    };

    // Kitchen sees the update
    this.server
      .to(Rooms.kitchen(order.branchId))
      .emit(SocketEvents.KITCHEN_ORDER_UPDATE, payload);

    // Customer tracking their order also sees it
    this.server
      .to(Rooms.order(order.id))
      .emit(SocketEvents.ORDER_STATUS_UPDATED, payload);
  }

  // Send a notification to a specific user
  emitNotification(userId: string, message: string, data?: any) {
    if (!this.server) return;

    this.server
      .to(Rooms.user(userId))
      .emit(SocketEvents.NOTIFICATION, {
        message,
        data,
        timestamp: new Date().toISOString(),
      });
  }
}