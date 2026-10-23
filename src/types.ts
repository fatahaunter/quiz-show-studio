export const SCHEMA_VERSION = 1;

export interface Question {
  id: string;
  clue: string;
  answer: string;
  alts: string[];
  value: number;
  image?: string; // data URL (downscaled on upload)
  explanation?: string;
  hostNotes?: string;
  dailyDouble?: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  questions: Question[];
}

export interface Rules {
  wrongPenalty: boolean; // deduct value on a wrong answer
  allowRebuzz: boolean; // other players may buzz after a wrong answer
  allowNegative: boolean;
  buzzWindowSec: number; // 0 = host closes manually
  finalSeconds?: number; // Final-round answer time; 0 = host ends it manually (default 30)
}

export interface FinalClue {
  category: string;
  clue: string;
  answer: string;
  alts: string[];
}

export interface Game {
  schema: number;
  id: string;
  title: string;
  description: string;
  categories: Category[];
  rules: Rules;
  final?: FinalClue;
  updatedAt: number;
}

export const DEFAULT_RULES: Rules = {
  wrongPenalty: true,
  allowRebuzz: true,
  allowNegative: true,
  buzzWindowSec: 0,
  finalSeconds: 30,
};

export const PLAYER_COLORS = ['#3B82F6', '#22D3EE', '#FFD166', '#34D399', '#FB7185', '#A78BFA', '#F97316', '#F472B6'];
export const CATEGORY_COLORS = ['#3B82F6', '#22D3EE', '#FFD166', '#34D399', '#FB7185', '#A78BFA', '#F97316', '#F472B6'];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
