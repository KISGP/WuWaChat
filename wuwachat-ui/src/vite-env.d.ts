/// <reference types="vite/client" />

type Char = {
  id: string;
  name: string;
  avatar: string;
  card_bg?: string;
};

type Session = {
  session_id: string;
  char_id: string;
  last_message: {
    type: "user" | "ai";
    content: string;
  };
  message_count: number;
};

type AllSessions = {
  char_id: string;
  sessions: Session[];
}[];
