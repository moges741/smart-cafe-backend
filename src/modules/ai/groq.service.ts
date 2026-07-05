import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

// What we expect Groq to return — always JSON matching this shape
export interface AiResponse {
  intent:         'place_order' | 'ask_menu' | 'ask_price' | 'confirm_order' | 'cancel' | 'unclear';
  confidence:     number;       // 0.0 to 1.0
  language:       string;       // 'en', 'am', 'om'
  responseText:   string;       // what to say back to the customer
  extractedItems: Array<{
    productName: string;
    productId:   string;
    quantity:    number;
    notes:       string | null;
  }>;
}

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly groq:   Groq;
  private readonly model:  string;

  constructor(private readonly config: ConfigService) {
    this.groq  = new Groq({
      apiKey: this.config.get<string>('GROQ_API_KEY'),
    });
    this.model = this.config.get<string>('GROQ_MODEL', 'llama-3.1-8b-instant');
  }

  async chat(params: {
    products:           Array<{ id: string; name: string; price: number; category: string }>;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    newMessage:          string;
    customerName:        string | null;
  }): Promise<AiResponse> {

    // Build the product list as a readable string for the prompt
    // The AI needs to see the exact names and IDs to match correctly
    const productList = params.products
      .map(p => `- ${p.name} (${p.category}) — ${p.price} ETB  [id: ${p.id}]`)
      .join('\n');

    // The system prompt is the most important part
    // It tells the AI exactly what role it plays, what format to use,
    // and what rules to follow — be specific, not vague
    const systemPrompt = `
You are an AI ordering assistant for Smart Cafe, an Ethiopian cafe.
Your job is to help customers order food and drinks through natural conversation.
You support English, Amharic (አማርኛ), and Afaan Oromo.

AVAILABLE PRODUCTS FOR THIS BRANCH:
${productList}

RULES YOU MUST FOLLOW:
1. ALWAYS respond with valid JSON only — no text before or after the JSON
2. Match product names flexibly: "macchiato" matches "Macchiato", "ማኪያቶ" matches "Macchiato"
3. If a product is NOT in the list above, say it is not available then list ALL available products
4. If confidence is below 0.75, set intent to "unclear" and ask for clarification
5. Detect the customer's language and always respond in the SAME language
6. Never invent products, prices, or IDs not in the list above
7. When intent is "place_order", always include all matched items with their exact productId
8. When intent is "confirm_order", extractedItems should be empty (items already in session)
9. Be friendly, concise, and helpful — this is a cafe, not a bank
${params.customerName ? `10. The customer's name is ${params.customerName} — use it naturally` : ''}

RESPOND WITH EXACTLY THIS JSON STRUCTURE — NO OTHER FORMAT:
{
  "intent": "place_order | ask_menu | ask_price | confirm_order | cancel | unclear",
  "confidence": 0.95,
  "language": "en",
  "responseText": "Your friendly response to the customer here",
  "extractedItems": [
    {
      "productName": "exact name from the list",
      "productId": "exact uuid from the list",
      "quantity": 1,
      "notes": "any special instructions or null"
    }
  ]
}
`.trim();

    // Build the messages array for Groq
    // Groq expects: system message first, then alternating user/assistant
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      // Include full conversation history so AI has context
      ...params.conversationHistory.map(m => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })),
      // The new message from the customer
      { role: 'user', content: params.newMessage },
    ];

    try {
      const completion = await this.groq.chat.completions.create({
        model:       this.model,
        messages,
        temperature: 0.3,   // low temperature = more consistent, less creative
                            // for ordering we want predictable structured output
        max_tokens:  1024,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      this.logger.debug(`Groq raw response: ${raw}`);

      // Parse the JSON response
      // Strip any accidental markdown code fences if present
      const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleaned) as AiResponse;

      // Validate the required fields exist
      if (!parsed.intent || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid AI response structure');
      }

      return parsed;

    } catch (error: any) {
      this.logger.error('Groq API error:', error.message);

      // Return a safe fallback response — never crash the user's session
      return {
        intent:       'unclear',
        confidence:   0,
        language:     'en',
        responseText: "I'm sorry, I didn't understand that. Could you please tell me what you'd like to order?",
        extractedItems: [],
      };
    }
  }
}