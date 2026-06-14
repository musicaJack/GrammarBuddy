export type AppTheme = "home" | "grammar" | "news" | "newsHistory";

export type NewsUIState =
  | "HOME"
  | "FETCHING"
  | "BROADCAST"
  | "OPEN_QUESTION"
  | "LISTENING"
  | "THINKING"
  | "PAUSED"
  | "WRAP_UP"
  | "COMPLETE";

export interface TranscriptEntry {
  id: string;
  role: "assistant" | "user";
  text: string;
  phase: string;
  turn: number;
}

export interface WrapUpPayload {
  topic_summary?: string;
  logic_flow?: string[];
  grammar_points?: { issue: string; example: string; fix: string }[];
  vocabulary?: string[];
  overall_feedback?: string;
}

export interface NewsHistorySummary {
  id: string;
  saved_at: string;
  turn_count: number;
  min_turns: number;
  grade: number;
  article_title: string;
  article_source: string;
  topic_summary: string;
}

export interface NewsHistoryDetail {
  id: string;
  saved_at: string;
  grade: number;
  turn_count: number;
  min_turns: number;
  article: NewsArticle;
  transcript: TranscriptEntry[];
  wrap_up: WrapUpPayload;
}

export interface NewsArticle {
  title: string;
  source: string;
  body: string;
  url?: string;
}

export type UIState =
  | "HOME"
  | "ASKING"
  | "LISTENING"
  | "THINKING"
  | "FEEDBACK"
  | "PRACTICE"
  | "PRACTICE_SUCCESS"
  | "SCENARIO_COMPLETE";

export interface LessonSummary {
  id: string;
  display_name: string;
  display_name_en: string;
}

export interface Highlight {
  wrong: string[];
  correct: string[];
}

export interface GrammarPayload {
  ui_state: UIState;
  evaluation: { is_correct: boolean; score: number };
  asr_text?: string;
  correction?: {
    correct_sentence: string;
    error_type?: string;
    highlight?: Highlight;
  } | null;
  teaching?: {
    simple_explanation?: string;
    kid_explanation?: string;
  };
  tts?: {
    primary?: string;
    repeat_prompt?: string;
  };
  next_step?: {
    action?: string;
    question?: string;
  };
}

export interface WSMessage {
  type: "control" | "asr" | "gpt" | "tts" | "error";
  session_id?: string;
  payload: Record<string, unknown>;
}

export interface LessonCustom {
  display_name: string;
  grammar_focus: string;
  description?: string;
  description_en?: string;
  example_patterns?: string[];
  starter_questions?: string[];
  error_hints?: string[];
  kid_friendly_rule?: string;
}
