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
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

  "intent": "place_order | ask_menu | ask_price | confirm_order | cancel | unclear",
      apiKey,
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
        response_format: { type: 'json_object' } as any,
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      this.logger.debug(`Groq raw response: ${raw}`);

      const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = this.parseAiResponse(cleaned);
      if (parsed) {
        return parsed;
      }

      this.logger.warn('Groq returned a non-JSON response; falling back to readable text output');
      return {
        intent: this.normalizeIntent(undefined, cleaned),
        confidence: 0.35,
        language: 'en',
        responseText: cleaned || "I'm sorry, I couldn't generate a response right now.",
        extractedItems: [],
      };

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

  private parseAiResponse(raw: string): AiResponse | null {
    const candidates = [raw, this.extractJsonObject(raw)].filter(Boolean) as string[];

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as Partial<AiResponse>;
        if (!parsed || typeof parsed !== 'object') continue;

        const responseText = typeof parsed.responseText === 'string'
          ? parsed.responseText.trim()
          : '';
        const extractedItems = Array.isArray(parsed.extractedItems)
          ? parsed.extractedItems
              .filter((item): item is AiResponse['extractedItems'][number] => Boolean(item && typeof item === 'object'))
              .map((item) => ({
                productName: String(item.productName ?? ''),
                productId: String(item.productId ?? ''),
                quantity: Number(item.quantity ?? 0),
                notes: item.notes == null ? null : String(item.notes),
              }))
          : [];

        return {
          intent: this.normalizeIntent(parsed.intent, responseText),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.35,
          language: typeof parsed.language === 'string' ? parsed.language : 'en',
          responseText: responseText || raw,
          extractedItems,
        };
      } catch {
        // Try the next candidate.
      }
    }

    return null;
  }

  private extractJsonObject(raw: string): string | null {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return raw.slice(start, end + 1);
  }

  private normalizeIntent(intent: unknown, responseText: string): AiResponse['intent'] {
    if (intent === 'place_order' || intent === 'ask_menu' || intent === 'ask_price' || intent === 'confirm_order' || intent === 'cancel' || intent === 'unclear') {
      return intent;
    }

    const text = `${responseText} ${String(intent ?? '')}`.toLowerCase();
    if (/(menu|what do you have|available)/.test(text)) return 'ask_menu';
    if (/(price|cost|how much)/.test(text)) return 'ask_price';
    if (/(yes|confirm|place|order now|proceed)/.test(text)) return 'confirm_order';
    if (/(cancel|stop|never mind|nevermind)/.test(text)) return 'cancel';
    if (/(want|would like|add|order)/.test(text)) return 'place_order';
    return 'unclear';
  }
}