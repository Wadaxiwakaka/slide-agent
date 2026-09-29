import { z } from 'zod';

const title = z.string().trim().min(1).max(60);
const heading = z.string().trim().min(1).max(42);
const text = z.string().trim().min(1).max(110);
const fact = z.string().trim().min(1).max(32);
const sourceQuote = z.string().trim().min(1).max(200);

const slide = z.discriminatedUnion('layout', [
  z.strictObject({ layout: z.literal('title'), title, subtitle: text }),
  z.strictObject({ layout: z.literal('title_body'), title, bullets: z.array(text).min(1).max(5) }),
  z.strictObject({ layout: z.literal('three_cards'), title, cards: z.tuple([
    z.strictObject({ heading, body: text }),
    z.strictObject({ heading, body: text }),
    z.strictObject({ heading, body: text }),
  ]) }),
  z.strictObject({ layout: z.literal('comparison'), title,
    left: z.strictObject({ heading, items: z.array(text).min(1).max(3) }),
    right: z.strictObject({ heading, items: z.array(text).min(1).max(3) }),
  }),
  z.strictObject({ layout: z.literal('process'), title,
    steps: z.array(z.strictObject({ heading, detail: text })).min(2).max(5),
  }),
  z.strictObject({ layout: z.literal('timeline'), title, takeaway: text,
    events: z.array(z.strictObject({ date: fact, event: text, sourceQuote })).min(2).max(5),
  }),
  z.strictObject({ layout: z.literal('data_highlight'), title, value: fact,
    label: heading, takeaway: text, sourceQuote,
  }),
]);

export const deckSchema = z.strictObject({
  title,
  slides: z.array(slide).min(1).max(30),
});

export type SlideSpec = z.infer<typeof slide>;
export type DeckSpec = z.infer<typeof deckSchema>;
