'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Taste profile and recommendations across media (spec 7.1 / 7.2): always
//  the caller's own data. "Refresh" rebuilds the profile now (lightly rate-
//  limited); "Recommend across media" asks Gemini through the shared per-
//  user AI limiter and filters the answer (src/lib/recommend.ts).
// ───────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';
import { revalidatePath } from 'next/cache';

import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { buildTasteProfile, getRecommendInput } from '@/lib/data-taste';
import { takeAiRate, takeTasteRefreshRate } from '@/lib/rate-limit';
import {
  buildRecommendPrompt,
  filterRecommendations,
  parseRecommendAnswer,
  recommendResponseSchema,
  type Recommendation,
} from '@/lib/recommend';
import { requireUser } from '@/lib/session';
import { MIN_FINISHED_FOR_PROFILE, tastePromptLines } from '@/lib/stats/profile';
import type { ActionResult } from '@/lib/types';

// A generated list takes longer than a lookup, so more than G4's 8 s.
const GEMINI_TIMEOUT_MS = 25_000;

/** Rebuild the caller's taste profile now. */
export async function refreshTasteProfile(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const rate = takeTasteRefreshRate(user.id);
    if (!rate.ok) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfterSec / 60));
      return { ok: false, error: `You've refreshed a lot just now. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` };
    }
    const res = await buildTasteProfile(user.id);
    if (!res.ok) {
      return {
        ok: false,
        error: `Finish at least ${MIN_FINISHED_FOR_PROFILE} titles first (you have ${res.finished}).`,
      };
    }
    revalidatePath('/stats');
    return { ok: true };
  } catch (err) {
    console.error('[taste] refresh failed:', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Could not build your taste profile. Try again later.' };
  }
}

export type RecommendResult = { ok: true; items: Recommendation[] } | { ok: false; error: string };

/** A handful of picks across media from the caller's S/A titles and taste profile. */
export async function recommendAcrossMedia(): Promise<RecommendResult> {
  const user = await requireUser();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Recommendations aren't set up on this server (no Gemini API key). Everything else works without it.",
    };
  }

  const input = await getRecommendInput(user.id);
  if (input.sections.length === 0) return { ok: false, error: 'Every section is hidden in Settings.' };
  if (input.seeds.length === 0 && !input.profile) {
    return {
      ok: false,
      error: 'Put a few favourites in the S or A tier first (any section), then ask again.',
    };
  }

  const labels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) as Record<CategorySlug, string>;
  const prompt = buildRecommendPrompt({
    seeds: input.seeds,
    // The S/A list is already in the prompt: the profile adds the summary only.
    profileLines: tastePromptLines(input.profile, labels, { withFavourites: false }),
    sections: input.sections,
  });

  // Shared per-user AI budget (registration is open; the key is the owner's).
  const rate = takeAiRate(user.id);
  if (!rate.ok) return { ok: false, error: rate.message };

  let answer: string | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const resp = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        // The SDK's Schema type wants its own enum; the plain strings are the same values.
        responseSchema: recommendResponseSchema(input.sections) as never,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });
    answer = resp.text;
  } catch (err) {
    console.error('[taste] Gemini failed:', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Recommendations are unavailable right now. Try again later.' };
  }

  const parsed = parseRecommendAnswer(answer, input.sections);
  if (!parsed.ok) return parsed;
  const items = filterRecommendations(parsed.items, input.library);
  if (items.length === 0) {
    return { ok: false, error: 'Every pick the AI had is already in your hoard. Try again for a fresh batch.' };
  }
  return { ok: true, items };
}
