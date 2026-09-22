export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Session {
  id: string;
  studentName: string;
  passcode: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface SystemInstructionData {
  instruction: string;
  updatedAt: string;
}

export interface StudentAccount {
  id: string;
  studentName: string;
  createdAt: string;
  messageCount?: number;
}

export interface JoinSessionRequest {
  studentName: string;
  passcode?: string;
}

export interface JoinSessionResponse {
  session: Session;
  isNew: boolean;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  passcode?: string;
}

export interface ChatResponse {
  session: Session;
  replyMessage: Message;
}

export interface AdminAuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}
