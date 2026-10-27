'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Roast / Recommend server action — the AI critic.
//
//  Feeds the user's ranked, completed library to Gemini and asks it to either
//  savagely (but PG-13) roast their taste, or play tasteful curator and surface
//  one hidden gem. Degrades gracefully when no key is configured, the list is
//  empty, or the model call fails — the UI always gets a serializable result.
// ───────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';

import { getCategory, type CategorySlug } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { formatRating } from '@/lib/rating';
import { getRanking } from '@/lib/data';
import type { RoastMode } from '@/lib/types';

export async function roastList(
  slug: CategorySlug,
  mode: RoastMode,
): Promise<{ text: string; error?: string }> {
  await requireUser();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: '', error: 'GEMINI_API_KEY is not configured.' };
  }

  const cat = getCategory(slug);
  const label = cat?.label ?? slug;

  // Elo-sorted, rated rows; keep only those the user actually finished.
  const ranking = await getRanking(slug);
  const completed = ranking.filter((a) => a.status === 'COMPLETED' && a.rating != null);

  if (completed.length === 0) {
    return {
      text: `Nothing to ${mode === 'roast' ? 'roast' : 'go on'} yet — complete and rate a few ${label.toLowerCase()} first, then come back.`,
    };
  }

  // One line per item: "1. Title (year) — 8/10".
  const list = completed
    .map((a, i) => {
      const year = a.media.year ? ` (${a.media.year})` : '';
      return `${i + 1}. ${a.media.title}${year} — ${formatRating(a.rating)}/10`;
    })
    .join('\n');

  const prompt =
    mode === 'roast'
      ? [
          `You are a savage, razor-witted critic roasting a person's taste in ${label.toLowerCase()}.`,
          'Be brutally funny and merciless about their rankings and ratings, but keep it PG-13 — funny, not cruel or hateful, no slurs, no personal attacks beyond their taste.',
          'Reference specific titles. Keep it to a tight few punchy paragraphs.',
          '',
          'Their ranked list (best to worst, with their 1–10 scores):',
          list,
        ].join('\n')
      : [
          `You are a tasteful, knowledgeable curator of ${label.toLowerCase()}.`,
          'Based on the ranked list below, recommend exactly ONE hidden gem the person has most likely NOT already seen — not an obvious mainstream pick.',
          'Justify the recommendation by connecting it to their highest-ranked choices. Keep it to a short, warm paragraph or two.',
          '',
          'Their ranked list (best to worst, with their 1–10 scores):',
          list,
        ].join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const resp = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
    });
    return { text: resp.text ?? '' };
  } catch {
    return { text: '', error: 'The AI critic is unavailable right now.' };
  }
}
