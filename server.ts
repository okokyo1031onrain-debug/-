import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const PORT = 3000;
const DB_PATH = path.resolve(process.cwd(), "chats-db.json");

export const DEFAULT_SYSTEM_INSTRUCTION = `# あなたの役割
あなたは数学の授業における振り返りをサポートするAIアシスタントです。
授業終わりの5分間で、生徒が「思いつくままに書いた雑多なメモ（単語、走り書き、感情、間違えた問題など）」を優しく受け止め、生徒自身が「何を考え、どう成長したか（変容や気づき）」を言語化できるよう手助けします。

# 基本スタンス
- 【重要】生徒からの情報をもとに、振り返りを生成し、回答する。どうしても振り返りを作成するのに必要な情報が不足する場合は、一度だけ質問を返すことができる。

# 対話の引き出し手法（状況に応じて使い分ける）
1. 【ソクラテス式問答】（問いかけによる気づき）
   生徒のつぶやきに対して、「もし〜だったらどうなるかな？」「その数字はどこから出てきたのかな？」と問いかけ、自分で法則や理由に気づかせます。
2. 【5Whys（なぜの深掘り）】（プロセスの具体化）
   「計算ミスした」→「どこでミスした？」→「符号を変えるのを忘れた」→「なんで忘れちゃったんだろう？」と、優しくステップを踏んで原因や対策（調整）へ導きます。

# 対話のステップ（ワークフロー）

## ステップ1：雑多なメモの受付
生徒から、単語、走り書き、間違えた問題などの「素材」を投げかけてもらいます。

## ステップ2：生徒からの情報に応じた「振り返り文章」を提案します。

※出力フォーマット例：
【Aパターン：自分の成長・気づき中心】
今日の授業では〜で苦戦しましたが、〇〇ということに気づくことができました。次は〜を意識して解いてみたいです。
【Bパターン：これからの作戦・学びの調整中心】
〜の問題でミスをしてしまいました。原因は〜だとわかったので、次は〜という方法で確かめをします。`;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Session {
  id: string;
  studentName: string;
  passcode: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  adminPassword: string;
  adminSecret?: string;
  systemInstruction: string;
  sessions: Session[];
}

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      const secret = parsed.adminSecret || crypto.randomBytes(32).toString("hex");
      const result: DatabaseSchema = {
        adminPassword: parsed.adminPassword || "admin",
        adminSecret: secret,
        systemInstruction: parsed.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
      if (!parsed.adminSecret) {
        saveDatabase(result);
      }
      return result;
    }
  } catch (err) {
    console.error("Failed to load database, falling back to default:", err);
  }

  const initial: DatabaseSchema = {
    adminPassword: "admin",
    adminSecret: crypto.randomBytes(32).toString("hex"),
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    sessions: [],
  };
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema): void {
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}

// Active admin tokens set
const validAdminTokens = new Set<string>();

// Lazy GenAI client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in the environment");
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

function generatePasscode(existingSessions: Session[]): string {
  const existingCodes = new Set(existingSessions.map((s) => s.passcode));
  for (let i = 0; i < 1000; i++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function createAdminToken(secret: string): string {
  const ts = Date.now().toString();
  const rand = crypto.randomBytes(12).toString("hex");
  const payload = `${ts}:${rand}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `adm.${ts}.${rand}.${sig}`;
}

function verifyAdmin(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers["x-admin-token"] as string | undefined;

  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (tokenHeader) {
    token = tokenHeader.trim();
  }

  if (!token) return false;

  // Check in-memory token set
  if (validAdminTokens.has(token)) return true;

  // Verify HMAC-signed persistent token (valid for 7 days)
  try {
    const parts = token.split(".");
    if (parts.length === 4 && parts[0] === "adm") {
      const [, tsStr, rand, sig] = parts;
      const ts = parseInt(tsStr, 10);
      if (isNaN(ts)) return false;

      // Token validity: 7 days
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - ts > maxAgeMs) {
        return false;
      }

      const db = loadDatabase();
      const expectedSig = crypto
        .createHmac("sha256", db.adminSecret || "default-secret")
        .update(`${tsStr}:${rand}`)
        .digest("hex");

      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        return true;
      }
    }
  } catch (err) {
    // Ignore verification error
  }

  return false;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // Ensure DB file exists
  loadDatabase();

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Admin login
  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const db = loadDatabase();
    if (password === db.adminPassword) {
      const token = createAdminToken(db.adminSecret || "default-secret");
      validAdminTokens.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: "パスワードが正しくありません" });
    }
  });

  // Admin change password
  app.post("/api/admin/change-password", (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const db = loadDatabase();

    // Verification: Valid token OR matching current password
    const isTokenValid = verifyAdmin(req);
    const isCurrentPasswordCorrect = Boolean(currentPassword && currentPassword === db.adminPassword);

    if (!isTokenValid && !isCurrentPasswordCorrect) {
      res.status(401).json({ success: false, error: "管理者認証が必要です。現在のパスワードを正しく入力してください。" });
      return;
    }

    if (!newPassword || newPassword.trim().length < 3) {
      res.status(400).json({ success: false, error: "新しいパスワードは3文字以上で入力してください" });
      return;
    }

    if (db.adminPassword !== currentPassword) {
      res.status(400).json({ success: false, error: "現在のパスワードが一致しません" });
      return;
    }

    db.adminPassword = newPassword.trim();
    saveDatabase(db);

    // Issue fresh token so the current session continues uninterrupted
    const newToken = createAdminToken(db.adminSecret || "default-secret");
    validAdminTokens.add(newToken);

    res.json({ success: true, token: newToken });
  });

  // Get list of registered student accounts (for selection when resuming)
  app.get("/api/students", (req, res) => {
    const db = loadDatabase();
    const students = db.sessions.map((s) => ({
      id: s.id,
      studentName: s.studentName,
      createdAt: s.createdAt,
      messageCount: s.messages.length,
    }));
    // Sort naturally (numeric aware, Japanese locale)
    students.sort((a, b) =>
      a.studentName.localeCompare(b.studentName, "ja", { numeric: true })
    );
    res.json({ students });
  });

  // Join or Resume Student Session
  app.post("/api/sessions/join", (req, res) => {
    const { studentName, passcode } = req.body;
    if (!studentName || typeof studentName !== "string" || !studentName.trim()) {
      res.status(400).json({ error: "お名前または出席番号を選択・入力してください" });
      return;
    }

    const trimmedCode = passcode ? String(passcode).trim() : "";
    if (!trimmedCode || !/^\d{4}$/.test(trimmedCode)) {
      res.status(400).json({ error: "4桁の数字パスコードを入力してください" });
      return;
    }

    const trimmedName = studentName.trim();
    const db = loadDatabase();

    // Check if an account for this student already exists
    const existing = db.sessions.find(
      (s) => s.studentName.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      // Existing student: verify passcode
      if (existing.passcode !== trimmedCode) {
        res.status(401).json({ error: "4桁のパスコードが正しくありません" });
        return;
      }
      res.json({ session: existing, isNew: false });
      return;
    }

    // New student: create account with the student's chosen 4-digit passcode
    const newSession: Session = {
      id: "sess_" + crypto.randomBytes(12).toString("hex"),
      studentName: trimmedName,
      passcode: trimmedCode,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.sessions.push(newSession);
    saveDatabase(db);

    res.json({ session: newSession, isNew: true });
  });

  // Get sessions: admin gets all, student gets their own by passcode
  app.get("/api/sessions", (req, res) => {
    const isAdmin = verifyAdmin(req);
    const db = loadDatabase();

    if (isAdmin) {
      res.json({ sessions: db.sessions });
      return;
    }

    const { passcode, sessionId } = req.query;
    if (passcode && typeof passcode === "string") {
      const session = db.sessions.find((s) => s.passcode === passcode.trim());
      if (session) {
        res.json({ sessions: [session] });
        return;
      }
    }

    if (sessionId && typeof sessionId === "string") {
      const session = db.sessions.find((s) => s.id === sessionId);
      if (session) {
        res.json({ sessions: [session] });
        return;
      }
    }

    res.status(403).json({ error: "セッション一覧の取得には管理者認証が必要です" });
  });

  // Get specific session
  app.get("/api/sessions/:id", (req, res) => {
    const { id } = req.params;
    const { passcode } = req.query;
    const isAdmin = verifyAdmin(req);
    const db = loadDatabase();

    const session = db.sessions.find((s) => s.id === id);
    if (!session) {
      res.status(404).json({ error: "セッションが見つかりません" });
      return;
    }

    if (!isAdmin && session.passcode !== passcode) {
      res.status(403).json({ error: "認証が必要です" });
      return;
    }

    res.json({ session });
  });

  // Delete session (Admin)
  app.delete("/api/sessions/:id", (req, res) => {
    if (!verifyAdmin(req)) {
      res.status(401).json({ error: "管理者認証が必要です" });
      return;
    }
    const { id } = req.params;
    const db = loadDatabase();
    const index = db.sessions.findIndex((s) => s.id === id);
    if (index === -1) {
      res.status(404).json({ error: "対象のセッションが存在しません" });
      return;
    }
    db.sessions.splice(index, 1);
    saveDatabase(db);
    res.json({ success: true, id });
  });

  // Reset all sessions (Admin)
  app.post("/api/sessions/reset", (req, res) => {
    if (!verifyAdmin(req)) {
      res.status(401).json({ error: "管理者認証が必要です" });
      return;
    }
    const db = loadDatabase();
    db.sessions = [];
    saveDatabase(db);
    res.json({ success: true, count: 0 });
  });

  // Reissue passcode for a student (Admin)
  app.post("/api/sessions/:id/reissue-passcode", (req, res) => {
    if (!verifyAdmin(req)) {
      res.status(401).json({ error: "管理者認証が必要です" });
      return;
    }
    const { id } = req.params;
    const db = loadDatabase();
    const session = db.sessions.find((s) => s.id === id);
    if (!session) {
      res.status(404).json({ error: "セッションが見つかりません" });
      return;
    }
    session.passcode = generatePasscode(db.sessions);
    session.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json({ success: true, passcode: session.passcode, session });
  });

  // System Instruction: GET
  app.get("/api/system-instruction", (_req, res) => {
    const db = loadDatabase();
    res.json({
      instruction: db.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
      updatedAt: new Date().toISOString(),
    });
  });

  // System Instruction: POST (Admin)
  app.post("/api/system-instruction", (req, res) => {
    if (!verifyAdmin(req)) {
      res.status(401).json({ error: "管理者認証が必要です" });
      return;
    }
    const { instruction } = req.body;
    if (typeof instruction !== "string" || !instruction.trim()) {
      res.status(400).json({ error: "指示内容をテキストで指定してください" });
      return;
    }
    const db = loadDatabase();
    db.systemInstruction = instruction.trim();
    saveDatabase(db);
    res.json({ success: true, instruction: db.systemInstruction });
  });

  // Chat message endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message, passcode } = req.body;
      if (!sessionId || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "セッションIDおよびメッセージが必要です" });
        return;
      }

      const db = loadDatabase();
      const session = db.sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.status(404).json({ error: "セッションが見つかりませんでした。再参加してください。" });
        return;
      }

      if (passcode && session.passcode !== passcode) {
        res.status(403).json({ error: "パスコードが一致しません" });
        return;
      }

      const userMessage: Message = {
        id: "msg_" + crypto.randomBytes(8).toString("hex"),
        role: "user",
        content: message.trim(),
        createdAt: new Date().toISOString(),
      };

      // Prepare conversation history for Gemini
      const conversationContents = session.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      conversationContents.push({
        role: "user",
        parts: [{ text: userMessage.content }],
      });

      const ai = getGenAI();
      const systemInstruction = db.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

      // Resilient model cascade: Try modern flash models with retry on transient load
      const candidateModels = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
      let replyText = "";
      let lastError: any = null;

      for (const modelName of candidateModels) {
        let modelSuccess = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: conversationContents,
              config: {
                systemInstruction,
              },
            });
            replyText = response.text || "";
            modelSuccess = true;
            break;
          } catch (modelErr: any) {
            lastError = modelErr;
            const errMsg = modelErr?.message || String(modelErr);
            const isTransient = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429");
            console.warn(`[Gemini] Model ${modelName} (attempt ${attempt}/2) failed: ${errMsg}`);

            if (attempt === 1 && isTransient) {
              // Wait 700ms before retrying the same model on transient spike
              await new Promise((r) => setTimeout(r, 700));
            } else {
              break;
            }
          }
        }

        if (modelSuccess) {
          break;
        }
      }

      if (!replyText && lastError) {
        console.error("All candidate Gemini models failed:", lastError);
        throw new Error(lastError.message || "AIの回答生成中にエラーが発生しました。");
      }

      if (!replyText) {
        replyText = "振り返りの作成をサポートします。今日の授業で気づいたことや、難しかった問題を教えてください。";
      }

      const assistantMessage: Message = {
        id: "msg_" + crypto.randomBytes(8).toString("hex"),
        role: "assistant",
        content: replyText,
        createdAt: new Date().toISOString(),
      };

      session.messages.push(userMessage, assistantMessage);
      session.updatedAt = new Date().toISOString();
      saveDatabase(db);

      res.json({
        session,
        replyMessage: assistantMessage,
      });
    } catch (err: any) {
      console.error("Chat endpoint error:", err);
      res.status(500).json({
        error: err.message || "メッセージの処理中にエラーが発生しました",
      });
    }
  });

  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`振り返りジェネレーター Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
