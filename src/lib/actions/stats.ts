'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Stats server actions (spec 6.1 / 6.3): yearly goals (create, change the
//  target, delete — always the caller's own) and the year in review's
//  optional AI verdict (Gemini, through the shared per-user AI limiter).
// ───────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import { getYearReview } from '@/lib/data-stats';
import { takeAiRate } from '@/lib/rate-limit';
import { MAX_GOALS_PER_YEAR, parseGoalInput, parseGoalTarget } from '@/lib/stats/goals';
import { yearPromptLines } from '@/lib/stats/year';
import { parseYear } from '@/lib/year-arena';
import type { ActionResult } from '@/lib/types';

// A generated paragraph takes longer than a lookup, so more than G4's 8 s.
const GEMINI_TIMEOUT_MS = 20_000;

function revalidateGoals() {
  revalidatePath('/stats');
  revalidatePath('/dashboard');
}

/** Add a goal. One per year, section (or all) and metric. */
export async function createGoal(input: unknown): Promise<ActionResult> {
  const parsed = parseGoalInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { goal } = parsed;
  try {
    const user = await requireUser();
    const res = await prisma.$transaction(async (tx): Promise<ActionResult> => {
      // Lock the user's row so two creates at once can't both pass the
      // duplicate check (Postgres' unique index lets NULL categories repeat).
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const existing = await tx.goal.findMany({ where: { userId: user.id, year: goal.year }, select: { category: true, metric: true } });
      if (existing.some((g) => g.category === goal.category && g.metric === goal.metric)) {
        return { ok: false, error: 'You already have that goal for this year. Change its target instead.' };
      }
      if (existing.length >= MAX_GOALS_PER_YEAR) {
        return { ok: false, error: `That's ${MAX_GOALS_PER_YEAR} goals for ${goal.year} already.` };
      }
      await tx.goal.create({ data: { userId: user.id, ...goal } });
      return { ok: true };
    });
    if (res.ok) revalidateGoals();
    return res;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the goal.' };
  }
}

/** Change one of your goals' target. */
export async function updateGoalTarget(id: unknown, target: unknown): Promise<ActionResult> {
  const value = parseGoalTarget(target);
  if (typeof id !== 'string' || id.length > 64) return { ok: false, error: 'Unknown goal.' };
  if (value === null) return { ok: false, error: 'The target must be a whole number from 1 to 100,000.' };
  try {
    const user = await requireUser();
    const res = await prisma.goal.updateMany({ where: { id, userId: user.id }, data: { target: value } });
    if (res.count === 0) return { ok: false, error: 'Unknown goal.' };
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the goal.' };
  }
}

/** Delete one of your goals. */
export async function deleteGoal(id: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || id.length > 64) return { ok: false, error: 'Unknown goal.' };
  try {
    const user = await requireUser();
    const res = await prisma.goal.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return { ok: false, error: 'Unknown goal.' };
    revalidateGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete the goal.' };
  }
}

/**
 * A short, playful AI verdict on your year (6.1). The prompt gets only the
 * year's summary numbers and a few titles (never notes or reviews).
 */
export async function yearVerdict(year: unknown): Promise<{ text: string; error?: string }> {
  const y = parseYear(year);
  if (y === null) return { text: '', error: 'Unknown year.' };
  const user = await requireUser();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: '', error: "The AI verdict isn't set up on this server (no Gemini API key). Everything else here works without it." };
  }

  const review = await getYearReview(user.id, y);
  if (review.summary.finished === 0) {
    return { text: `Nothing finished in ${y} yet, so there's nothing to judge. Finish something and come back.` };
  }

  const labels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) as Record<CategorySlug, string>;
  const prompt = [
    "You are a witty, warm critic writing a short verdict on someone's year in books, film, TV, anime, manga, games and music.",
    'Write 2 short paragraphs: what the numbers say about their year, and one playful observation or challenge for next year.',
    'Be specific to the numbers and titles below. Keep it PG, kind and funny. No lists, no headings.',
    '',
    ...yearPromptLines(review.summary, labels, review.topThree.map((t) => t.title)),
  ].join('\n');

  // Shared per-user AI budget (registration is open; the key is the owner's).
  const rate = takeAiRate(user.id);
  if (!rate.ok) return { text: '', error: rate.message };

  try {
    const ai = new GoogleGenAI({ apiKey });
    // The SDK aborts its HTTP request when the signal fires, so the call stops
    // waiting at the timeout (client-side only: the service may still finish it).
    const resp = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: { abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) },
    });
    const text = (resp.text ?? '').trim();
    return text ? { text } : { text: '', error: 'The AI had nothing to say. Try again.' };
  } catch {
    return { text: '', error: 'The AI verdict is unavailable right now. Try again later.' };
  }
}
