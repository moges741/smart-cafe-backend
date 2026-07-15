import {
  Injectable, NotFoundException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisSessionService, ConversationSession } from './redis-session.service';
import { GroqService } from './groq.service';
import { EventsService } from '../events/events.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly sessions: RedisSessionService,
    private readonly groq:     GroqService,
    private readonly events:   EventsService,
  ) {}

  // ─── Start conversation ──────────────────────────────────────────────────────
  // Creates a new session in Redis and returns the sessionId
  // The customer uses this sessionId for all subsequent messages
  async startConversation(
    dto:        StartConversationDto,
    currentUser: any | null,  // null for guests
  ) {
    // Verify the branch exists and is active
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });

    if (!branch || !branch.isActive) {
      throw new NotFoundException('Branch not found or inactive');
    }

    const sessionId = uuidv4();

    const session: ConversationSession = {
      sessionId,
      branchId:     dto.branchId,
      customerId:   currentUser?.id ?? null,
      customerName: dto.customerName ?? currentUser?.email?.split('@')[0] ?? null,
      language:     null,       // detected after first message
      createdAt:    new Date().toISOString(),
      messages:     [],
      extractedItems: [],
      orderPlaced:  false,
    };

    await this.sessions.save(session);

    this.logger.log(
      `Session started: ${sessionId} for branch: ${branch.name} ` +
      `(${currentUser ? 'logged in' : 'guest'})`
    );

    return {
      sessionId,
      branchName: branch.name,
      message:    `Welcome to ${branch.name}! What would you like to order today?`,
      expiresIn:  '30 minutes',
    };
  }

  // ─── Send message — the main conversation loop ───────────────────────────────
  async sendMessage(dto: SendMessageDto, currentUser: any | null) {

    // 1. Load the session — fail if expired or not found
    const session = await this.sessions.get(dto.sessionId);
    if (!session) {
      throw new BadRequestException(
        'Session not found or expired. Please start a new conversation.'
      );
    }

    // 2. Security — if session belongs to a logged-in user,
    //    make sure the same user is sending the message
    if (session.customerId && currentUser?.id !== session.customerId) {
      throw new BadRequestException('This session does not belong to you');
    }

    // 3. Don't allow messages after order is placed
    if (session.orderPlaced) {
      throw new BadRequestException(
        'Order already placed. Start a new conversation to place another order.'
      );
    }

    // 4. Load all available products for this branch
    //    The AI needs this to match what the customer says to real products
    const products = await this.prisma.product.findMany({
      where: {
        branchId:    session.branchId,
        isAvailable: true,
      },
      include: { category: { select: { name: true } } },
    });

    const productList = products.map(p => ({
      id:       p.id,
      name:     p.name,
      price:    Number(p.price),
      category: p.category.name,
    }));

    // 5. Call Groq with full context
    const aiResponse = await this.groq.chat({
      products:            productList,
      conversationHistory: session.messages,
      newMessage:          dto.message,
      customerName:        session.customerName,
    });

    this.logger.log(
      `Intent: ${aiResponse.intent} | Confidence: ${aiResponse.confidence} | ` +
      `Language: ${aiResponse.language}`
    );

    // 6. Update session language if first time detected
    if (!session.language && aiResponse.language) {
      session.language = aiResponse.language;
    }

    // 7. Append both messages to history
    session.messages.push({ role: 'user',      content: dto.message });
    session.messages.push({ role: 'assistant', content: aiResponse.responseText });

    // 8. Handle each intent differently
    let orderResult: any = null;

    if (aiResponse.intent === 'place_order' && aiResponse.confidence >= 0.75) {
      // Match extracted items to real products
      // AI gives us productId — verify it exists in our loaded list
      const validItems = aiResponse.extractedItems.filter(item =>
        productList.some(p => p.id === item.productId)
      );

      if (validItems.length > 0) {
        // Store matched items in session — not ordered yet, just remembered
        session.extractedItems = validItems.map(item => {
          const product = productList.find(p => p.id === item.productId)!;
          return {
            productId:   item.productId,
            productName: item.productName,
            quantity:    item.quantity,
            unitPrice:   product.price,
            notes:       item.notes,
          };
        });
      }
    }

    else if (aiResponse.intent === 'confirm_order') {
      // Customer said yes — create the real order now
      if (session.extractedItems.length === 0) {
        // Edge case: customer says "yes" but no items were captured
        aiResponse.responseText = "I don't have any items to order yet. What would you like?";
      } else {
        orderResult = await this.createOrderFromSession(session, dto);

        if (orderResult) {
          session.orderPlaced = true;
          aiResponse.responseText =
            `Your order ${orderResult.orderNumber} has been placed! ` +
            `Total: ${orderResult.totalAmount} ETB. ` +
            `The kitchen has been notified. Thank you!`;
        }
      }
    }

    else if (aiResponse.intent === 'cancel') {
      // Clear extracted items but keep the session alive
      // Customer might want to order something else
      session.extractedItems = [];
    }

    // 9. Save updated session back to Redis
    await this.sessions.save(session);

    // 10. Build the response
    const totalAmount = session.extractedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity, 0
    );

    return {
      sessionId:    dto.sessionId,
      reply:        aiResponse.responseText,
      intent:       aiResponse.intent,
      confidence:   aiResponse.confidence,
      language:     aiResponse.language,
      // Show order summary if items are being built up
      orderSummary: session.extractedItems.length > 0 && !session.orderPlaced
        ? {
            items: session.extractedItems.map(i => ({
              productId:   i.productId,
              name:      i.productName,
              quantity:  i.quantity,
              unitPrice: i.unitPrice,
              subtotal:  i.unitPrice * i.quantity,
              notes:     i.notes,
            })),
            total: totalAmount,
          }
        : null,
      // Include the created order details if order was just placed
      order: orderResult
        ? {
            orderNumber: orderResult.orderNumber,
            totalAmount: orderResult.totalAmount,
            status:      orderResult.status,
          }
        : null,
    };
  }

  // ─── Create real order from session items ────────────────────────────────────
  // Called when intent = confirm_order
  // This creates a real Order record exactly like POST /orders would
  private async createOrderFromSession(
    session: ConversationSession,
    dto:     SendMessageDto,
  ) {
    try {
      // For guests, we need at least a name — use DTO guest info or fallback
      const guestName  = dto.guestName  ?? session.customerName ?? 'Guest';
      const guestPhone = dto.guestPhone ?? null;

      // If guest (no customerId), find or create a guest user
      let customerId = session.customerId;

      if (!customerId) {
        // Create a temporary guest account or use a system guest user
        // For simplicity, require guests to provide at minimum their phone
        // Look for existing guest user with this phone, or create one
        const guestEmail = guestPhone
          ? `guest_${guestPhone}@smartcafe.local`
          : `guest_${uuidv4().slice(0, 8)}@smartcafe.local`;

        const guestRole = await this.prisma.role.findUnique({
          where: { name: 'customer' },
        });

        if (!guestRole) throw new Error('Customer role not found');

        const guestUser = await this.prisma.user.upsert({
          where:  { email: guestEmail },
          update: {},
          create: {
            email:        guestEmail,
            passwordHash: 'GUEST_NO_PASSWORD', // guests can't log in with this
            roleId:       guestRole.id,
          },
        });

        customerId = guestUser.id;
      }

      // Count existing orders for order number generation
      const count       = await this.prisma.order.count();
      const orderNumber = `ORD-${String(count + 1).padStart(4, '0')}`;

      // Calculate total server-side — never trust client
      const totalAmount = session.extractedItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity, 0
      );

      // Create order + items in one transaction
      const order = await this.prisma.$transaction(async (tx) => {
        return tx.order.create({
          data: {
            orderNumber,
            customerId,
            branchId:    session.branchId,
            type:        'dine_in',
            totalAmount,
            notes:       `AI order${guestName ? ` — ${guestName}` : ''}`,
            items: {
              create: session.extractedItems.map(item => ({
                productId: item.productId,
                quantity:  item.quantity,
                unitPrice: item.unitPrice,
                notes:     item.notes,
              })),
            },
          },
          include: {
            items: {
              include: { product: { select: { id: true, name: true } } },
            },
          },
        });
      });

      // Fire real-time event — kitchen sees it instantly
      this.events.emitNewOrder(order);

      this.logger.log(`AI order created: ${order.orderNumber}`);
      return order;

    } catch (error: any) {
      this.logger.error('Failed to create order from AI session:', error.message);
      return null;
    }
  }

  // ─── Get session status ──────────────────────────────────────────────────────
  // Useful for the frontend to show a "session active" indicator
  async getSession(sessionId: string) {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found or expired');
    }

    const ttl = await this.sessions.getTtl(sessionId);

    return {
      sessionId:      session.sessionId,
      branchId:       session.branchId,
      language:       session.language,
      messageCount:   session.messages.length,
      itemCount:      session.extractedItems.length,
      orderPlaced:    session.orderPlaced,
      expiresInSeconds: ttl,
      currentItems:   session.extractedItems,
    };
  }
}