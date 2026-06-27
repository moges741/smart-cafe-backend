export const SocketEvents = {
  // Order lifecycle — emitted when order status changes
  ORDER_CREATED:        'order.created',
  ORDER_STATUS_UPDATED: 'order.status.updated',
  ORDER_READY:          'order.ready',
  ORDER_COMPLETED:      'order.completed',
  ORDER_CANCELLED:      'order.cancelled',

  // Client → Server: joining rooms
  JOIN_KITCHEN:  'kitchen.join',
  JOIN_ORDER:    'order.join',
  JOIN_USER:     'user.join',

  // Kitchen display
  KITCHEN_NEW_ORDER:    'kitchen.new_order',
  KITCHEN_ORDER_UPDATE: 'kitchen.order_update',

  // Notifications
  NOTIFICATION: 'notification',
} as const;

// Room name builders — call these functions to get consistent room names
export const Rooms = {
  kitchen: (branchId: string) => `kitchen:${branchId}`,
  order:   (orderId: string)  => `order:${orderId}`,
  user:    (userId: string)   => `user:${userId}`,
};