const EVENT_SESSION_ID = "main-event";
const QUESTION_DURATION_MS = 15_000;
const REVEAL_DURATION_MS = 5_000;
const CORRECT_ANSWER_POINTS = 500;
const MAX_SPEED_BONUS_POINTS = 500;
const SESSION_RETENTION_MS = 24 * 60 * 60_000;
const QUIZ_LENGTH = 20;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const BOARD_LEADERBOARD_SIZE = 5;

interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result<never>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DB: D1Database;
  QUIZ_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
  ADMIN_EMAILS: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

type Phase = "waiting" | "question" | "reveal" | "checkpoint" | "finished";

interface QuestionRow {
  id: number;
  prompt: string;
  options: string;
  answer_index: number;
  explanation: string;
  category: string;
  position: number;
}

interface Question {
  id: number;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  category: string;
  position: number;
}

interface Player {
  id: string;
  name: string;
  normalizedName: string;
  score: number;
  joinedAt: number;
  answers: Record<string, number>;
}

interface SessionData {
  phase: Phase;
  questionIndex: number;
  deadline: number | null;
  questions: Question[];
  players: Record<string, Player>;
  cleanupAt: number | null;
}

interface QuestionInput {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  category: string;
  position: number;
}

interface ResourceInput {
  name: string;
  description: string;
  url: string;
  phone: string | null;
  type: string;
  sortOrder: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "bad_request",
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();
const loginAttempts = new Map<string, number[]>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  console.error("Unhandled Worker error", error);
  return json(
    { error: { code: "internal_error", message: "Une erreur interne est survenue." } },
    500,
  );
}

function withResponseHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const isApi = new URL(request.url).pathname.startsWith("/api/");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "content-security-policy",
    isApi
      ? "default-src 'none'; frame-ancestors 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  headers.set("cross-origin-resource-policy", "same-site");

  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && [requestOrigin, "http://localhost"].includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.append("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("access-control-allow-headers", "Authorization, Content-Type");
    headers.set("access-control-max-age", "86400");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("application/json")) {
    throw new HttpError(415, "Le contenu doit être au format JSON.", "unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 32_768) {
    throw new HttpError(413, "Corps de requête trop volumineux.", "payload_too_large");
  }
  const text = await request.text();
  if (!text || text.length > 32_768) {
    throw new HttpError(text ? 413 : 400, text ? "Corps de requête trop volumineux." : "Corps JSON requis.");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "JSON invalide.", "invalid_json");
  }
}

function parseOptions(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid options stored in D1");
  }
  return parsed;
}

function questionFromRow(row: QuestionRow): Question {
  return {
    id: row.id,
    prompt: row.prompt,
    options: parseOptions(row.options),
    answerIndex: row.answer_index,
    explanation: row.explanation,
    category: row.category,
    position: row.position,
  };
}

function validateQuestion(body: Record<string, unknown>): QuestionInput {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const explanation = typeof body.explanation === "string" ? body.explanation.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const options = Array.isArray(body.options)
    ? body.options.map((option) => (typeof option === "string" ? option.trim() : ""))
    : [];
  const answerIndex = body.answerIndex;
  const position = body.position ?? 0;
  if (prompt.length < 10 || prompt.length > 500) {
    throw new HttpError(400, "La question doit contenir entre 10 et 500 caractères.");
  }
  if (options.length !== 3 || options.some((option) => option.length < 1 || option.length > 300)) {
    throw new HttpError(400, "Trois options non vides sont requises.");
  }
  if (!Number.isInteger(answerIndex) || (answerIndex as number) < 0 || (answerIndex as number) > 2) {
    throw new HttpError(400, "answerIndex doit être un entier entre 0 et 2.");
  }
  if (explanation.length < 5 || explanation.length > 1_000 || category.length < 2 || category.length > 120) {
    throw new HttpError(400, "L'explication ou la catégorie est invalide.");
  }
  if (!Number.isInteger(position) || (position as number) < 0 || (position as number) > 10_000) {
    throw new HttpError(400, "position doit être un entier positif.");
  }
  return { prompt, options, answerIndex: answerIndex as number, explanation, category, position: position as number };
}

function validateResource(body: Record<string, unknown>): ResourceInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const phoneValue = typeof body.phone === "string" ? body.phone.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const sortOrder = body.sortOrder ?? 0;
  if (name.length < 2 || name.length > 150) throw new HttpError(400, "Le nom de la ressource est invalide.");
  if (description.length < 5 || description.length > 1_000) throw new HttpError(400, "La description est invalide.");
  if (type.length < 2 || type.length > 120) throw new HttpError(400, "Le type de ressource est invalide.");
  if (phoneValue.length > 50) throw new HttpError(400, "Le numéro de téléphone est invalide.");
  if (!Number.isInteger(sortOrder) || (sortOrder as number) < 0 || (sortOrder as number) > 10_000) {
    throw new HttpError(400, "L'ordre doit être un entier positif.");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
  } catch {
    throw new HttpError(400, "L'URL de la ressource est invalide.");
  }
  return { name, description, url, phone: phoneValue || null, type, sortOrder: sortOrder as number };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    difference |= (left[index % Math.max(left.length, 1)] ?? 0) ^ (right[index % Math.max(right.length, 1)] ?? 0);
  }
  return difference === 0;
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function credentialsMatch(supplied: string, expected: string, secret: string, label: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    hmac(secret, `${label}:${supplied}`),
    hmac(secret, `${label}:${expected}`),
  ]);
  return constantTimeEqual(left, right);
}

async function createAdminToken(secret: string): Promise<string> {
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })),
  );
  const signature = bytesToBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  if (!env.SESSION_SECRET) throw new HttpError(500, "SESSION_SECRET non configuré.", "configuration_error");
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Authentification requise.", "unauthorized");
  const token = authorization.slice(7);
  const [payload, signature, extra] = token.split(".");
  const suppliedSignature = signature ? base64UrlToBytes(signature) : null;
  if (!payload || !suppliedSignature || extra) throw new HttpError(401, "Jeton invalide.", "unauthorized");
  const expectedSignature = await hmac(env.SESSION_SECRET, payload);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
    throw new HttpError(401, "Jeton invalide.", "unauthorized");
  }
  const payloadBytes = base64UrlToBytes(payload);
  try {
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes ?? new Uint8Array())) as Record<string, unknown>;
    if (claims.role !== "admin" || typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error();
    }
  } catch {
    throw new HttpError(401, "Jeton invalide ou expiré.", "unauthorized");
  }
}

function enforceLoginRateLimit(request: Request): void {
  const key = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const recent = (loginAttempts.get(key) ?? []).filter((time) => time > now - 10 * 60_000);
  if (recent.length >= 5) throw new HttpError(429, "Trop de tentatives. Réessayez plus tard.", "rate_limited");
  recent.push(now);
  loginAttempts.set(key, recent);
  if (loginAttempts.size > 1_000) {
    for (const [ip, attempts] of loginAttempts) {
      if (attempts.every((time) => time <= now - 10 * 60_000)) loginAttempts.delete(ip);
    }
  }
}

function sessionStub(env: Env): DurableObjectStub {
  return env.QUIZ_SESSION.get(env.QUIZ_SESSION.idFromName(EVENT_SESSION_ID));
}

async function callSession(env: Env, path: string, request: Request): Promise<Response> {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const internal = new Request(`https://quiz.internal${path}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  });
  return sessionStub(env).fetch(internal);
}

async function listQuestions(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, prompt, options, answer_index, explanation, category, position FROM questions ORDER BY position, id",
  ).all<QuestionRow>();
  return json({
    questions: result.results.map((row) => {
      const question = questionFromRow(row);
      return { ...question, answerIndex: question.answerIndex };
    }),
  });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  if (pathname === "/api/health" && request.method === "GET") {
    await env.DB.prepare("SELECT 1").first();
    return json({ ok: true, service: "womenflare", sessionId: EVENT_SESSION_ID });
  }

  if (pathname === "/api/resources" && request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT id, name, description, url, phone, resource_type AS type FROM resources ORDER BY sort_order, id",
    ).all();
    return json({
      resources: result.results,
      disclaimer:
        "Ces ressources informent et orientent sans remplacer un conseil juridique ou médical. En cas de danger immédiat, appelez le 17 ou le 112; le 114 est accessible notamment par SMS aux personnes sourdes ou malentendantes.",
    });
  }

  if (pathname === "/api/session/join" && request.method === "POST") {
    return callSession(env, "/join", request);
  }
  if (pathname === "/api/session/state" && request.method === "GET") {
    const playerId = url.searchParams.get("playerId") ?? "";
    return callSession(env, `/state?playerId=${encodeURIComponent(playerId)}`, request);
  }
  if (pathname === "/api/session/answer" && request.method === "POST") {
    return callSession(env, "/answer", request);
  }

  if (pathname === "/api/admin/login" && request.method === "POST") {
    enforceLoginRateLimit(request);
    if (!env.ADMIN_EMAILS || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      throw new HttpError(500, "Secrets administrateur non configurés.", "configuration_error");
    }
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.normalize("NFKC").trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const allowedEmails = env.ADMIN_EMAILS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const [emailResults, passwordMatches] = await Promise.all([
      Promise.all(allowedEmails.map((allowedEmail) => credentialsMatch(email, allowedEmail, env.SESSION_SECRET, "email"))),
      credentialsMatch(password, env.ADMIN_PASSWORD, env.SESSION_SECRET, "password"),
    ]);
    if (!emailResults.some(Boolean) || !passwordMatches) {
      throw new HttpError(401, "Identifiants invalides.", "invalid_credentials");
    }
    const key = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
    loginAttempts.delete(key);
    return json({ token: await createAdminToken(env.SESSION_SECRET), expiresIn: TOKEN_TTL_SECONDS });
  }

  if (pathname.startsWith("/api/admin/")) await requireAdmin(request, env);

  if (pathname === "/api/admin/questions" && request.method === "GET") return listQuestions(env);
  if (pathname === "/api/admin/questions" && request.method === "POST") {
    const input = validateQuestion(await readJson(request));
    const result = await env.DB.prepare(
      "INSERT INTO questions (prompt, options, answer_index, explanation, category, position) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
      .bind(input.prompt, JSON.stringify(input.options), input.answerIndex, input.explanation, input.category, input.position)
      .first<{ id: number }>();
    return json({ id: result?.id }, 201);
  }

  const questionMatch = pathname.match(/^\/api\/admin\/questions\/(\d+)$/);
  if (questionMatch && request.method === "PUT") {
    const input = validateQuestion(await readJson(request));
    const result = await env.DB.prepare(
      "UPDATE questions SET prompt = ?, options = ?, answer_index = ?, explanation = ?, category = ?, position = ?, updated_at = unixepoch() WHERE id = ? RETURNING id",
    )
      .bind(
        input.prompt,
        JSON.stringify(input.options),
        input.answerIndex,
        input.explanation,
        input.category,
        input.position,
        Number(questionMatch[1]),
      )
      .first<{ id: number }>();
    if (!result) throw new HttpError(404, "Question introuvable.", "not_found");
    return json({ id: result.id });
  }
  if (questionMatch && request.method === "DELETE") {
    const existing = await env.DB.prepare("SELECT id FROM questions WHERE id = ?")
      .bind(Number(questionMatch[1]))
      .first();
    if (!existing) throw new HttpError(404, "Question introuvable.", "not_found");
    await env.DB.prepare("DELETE FROM questions WHERE id = ?").bind(Number(questionMatch[1])).run();
    return new Response(null, { status: 204 });
  }

  if (pathname === "/api/admin/resources" && request.method === "GET") {
    const result = await env.DB.prepare(
      "SELECT id, name, description, url, phone, resource_type AS type, sort_order AS sortOrder FROM resources ORDER BY sort_order, id",
    ).all();
    return json({ resources: result.results });
  }
  if (pathname === "/api/admin/resources" && request.method === "POST") {
    const input = validateResource(await readJson(request));
    const result = await env.DB.prepare(
      "INSERT INTO resources (name, description, url, phone, resource_type, sort_order) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    ).bind(input.name, input.description, input.url, input.phone, input.type, input.sortOrder).first<{ id: number }>();
    return json({ id: result?.id }, 201);
  }

  const resourceMatch = pathname.match(/^\/api\/admin\/resources\/(\d+)$/);
  if (resourceMatch && request.method === "PUT") {
    const input = validateResource(await readJson(request));
    const result = await env.DB.prepare(
      "UPDATE resources SET name = ?, description = ?, url = ?, phone = ?, resource_type = ?, sort_order = ? WHERE id = ? RETURNING id",
    ).bind(input.name, input.description, input.url, input.phone, input.type, input.sortOrder, Number(resourceMatch[1])).first<{ id: number }>();
    if (!result) throw new HttpError(404, "Ressource introuvable.", "not_found");
    return json({ id: result.id });
  }
  if (resourceMatch && request.method === "DELETE") {
    const existing = await env.DB.prepare("SELECT id FROM resources WHERE id = ?").bind(Number(resourceMatch[1])).first();
    if (!existing) throw new HttpError(404, "Ressource introuvable.", "not_found");
    await env.DB.prepare("DELETE FROM resources WHERE id = ?").bind(Number(resourceMatch[1])).run();
    return new Response(null, { status: 204 });
  }

  if (pathname === "/api/admin/session/start" && request.method === "POST") {
    return callSession(env, "/admin/start", request);
  }
  if (pathname === "/api/admin/session/next" && request.method === "POST") {
    return callSession(env, "/admin/next", request);
  }
  if (pathname === "/api/admin/session/state" && request.method === "GET") {
    return callSession(env, "/admin/state", request);
  }
  if (pathname === "/api/admin/session/board" && request.method === "GET") {
    return callSession(env, "/admin/board", request);
  }
  if (pathname === "/api/admin/session/reset" && request.method === "POST") {
    return callSession(env, "/admin/reset", request);
  }

  throw new HttpError(404, "Route API introuvable.", "not_found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
        response = new Response(null, { status: 204 });
      } else if (url.pathname.startsWith("/api/")) {
        response = await handleApi(request, env, url);
      } else if (url.pathname === "/admin" && (request.method === "GET" || request.method === "HEAD")) {
        response = Response.redirect(new URL("/admin/", url), 308);
      } else {
        response = await env.ASSETS.fetch(request);
      }
    } catch (error) {
      response = errorResponse(error);
    }
    return withResponseHeaders(response, request);
  },
};

export class QuizSession {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  private emptySession(): SessionData {
    return { phase: "waiting", questionIndex: -1, deadline: null, questions: [], players: {}, cleanupAt: null };
  }

  private async load(): Promise<SessionData> {
    return (await this.state.storage.get<SessionData>("session")) ?? this.emptySession();
  }

  private async save(session: SessionData): Promise<void> {
    await this.state.storage.put("session", session);
  }

  private leaderboard(session: SessionData): Array<{ rank: number; name: string; score: number }> {
    return Object.values(session.players)
      .sort((left, right) => right.score - left.score || left.joinedAt - right.joinedAt || left.name.localeCompare(right.name, "fr"))
      .map((player, index) => ({ rank: index + 1, name: player.name, score: player.score }));
  }

  private async advanceOverdue(session: SessionData): Promise<boolean> {
    let changed = false;
    let now = Date.now();
    while (session.deadline !== null && now >= session.deadline) {
      changed = true;
      if (session.phase === "question") {
        session.phase = "reveal";
        session.deadline = now + REVEAL_DURATION_MS;
      } else if (session.phase === "reveal") {
        const isLastQuestion = session.questionIndex + 1 >= session.questions.length;
        session.phase = isLastQuestion ? "finished" : "checkpoint";
        session.deadline = null;
        if (isLastQuestion) session.cleanupAt = Date.now() + SESSION_RETENTION_MS;
      } else {
        session.deadline = null;
      }
      now = Date.now();
    }
    if (changed) {
      await this.save(session);
      const nextAlarm = session.deadline ?? session.cleanupAt;
      if (nextAlarm === null) await this.state.storage.deleteAlarm();
      else await this.state.storage.setAlarm(nextAlarm);
    }
    return changed;
  }

  private publicState(session: SessionData, player: Player | undefined): Record<string, unknown> {
    const ranking = this.leaderboard(session);
    const ownRank = player ? ranking.find((entry) => entry.name === player.name)?.rank ?? null : null;
    const question = session.phase !== "waiting"
      ? session.questions[session.questionIndex]
      : undefined;
    const result: Record<string, unknown> = {
      sessionId: EVENT_SESSION_ID,
      phase: session.phase,
      questionIndex: session.questionIndex,
      questionCount: session.questions.length || QUIZ_LENGTH,
      deadline: session.deadline,
      question: question
        ? { id: question.id, prompt: question.prompt, options: question.options, category: question.category }
        : null,
      hasAnswered: Boolean(player && question && Object.hasOwn(player.answers, String(question.id))),
      ownScore: player?.score ?? null,
      ownRank,
      playersCount: Object.keys(session.players).length,
    };
    if (session.phase !== "question" && session.phase !== "waiting" && question) {
      result.reveal = {
        answerIndex: question.answerIndex,
        explanation: question.explanation,
        selectedIndex: player?.answers[String(question.id)] ?? null,
      };
    }
    if (session.phase === "checkpoint" || session.phase === "finished") {
      result.leaderboard = ranking.slice(0, 3);
    }
    return result;
  }

  private boardState(session: SessionData): Record<string, unknown> {
    const players = Object.values(session.players);
    const question = session.phase !== "waiting" ? session.questions[session.questionIndex] : undefined;
    const revealed = session.phase === "reveal" || session.phase === "checkpoint" || session.phase === "finished";
    const optionCounts = [0, 0, 0];
    let answeredCount = 0;
    if (question) {
      for (const player of players) {
        const selected = player.answers[String(question.id)];
        if (selected === undefined) continue;
        answeredCount += 1;
        if (selected >= 0 && selected < optionCounts.length) optionCounts[selected] += 1;
      }
    }
    return {
      sessionId: EVENT_SESSION_ID,
      phase: session.phase,
      questionIndex: session.questionIndex,
      questionCount: session.questions.length || QUIZ_LENGTH,
      deadline: session.deadline,
      questionDurationMs: QUESTION_DURATION_MS,
      playersCount: players.length,
      answeredCount,
      question: question
        ? { id: question.id, prompt: question.prompt, options: question.options, category: question.category }
        : null,
      answerIndex: revealed && question ? question.answerIndex : null,
      explanation: revealed && question ? question.explanation : null,
      optionCounts: revealed && question ? optionCounts : null,
      leaderboard: this.leaderboard(session).slice(0, BOARD_LEADERBOARD_SIZE),
    };
  }

  private normalizeName(name: string): { display: string; normalized: string } {
    const display = name.normalize("NFKC").trim().replace(/\s+/g, " ");
    const hasControlCharacter = [...display].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (display.length < 1 || display.length > 40 || hasControlCharacter) {
      throw new HttpError(400, "Le nom doit contenir entre 1 et 40 caractères.", "invalid_name");
    }
    return { display, normalized: display.toLocaleLowerCase("fr-FR") };
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const session = await this.load();
      await this.advanceOverdue(session);

      if (url.pathname === "/join" && request.method === "POST") {
        if (session.phase !== "waiting") throw new HttpError(409, "La partie a déjà commencé.", "session_started");
        const body = await readJson(request);
        const { display, normalized } = this.normalizeName(typeof body.name === "string" ? body.name : "");
        if (Object.values(session.players).some((player) => player.normalizedName === normalized)) {
          throw new HttpError(409, "Ce nom est déjà utilisé.", "name_taken");
        }
        const player: Player = {
          id: crypto.randomUUID(),
          name: display,
          normalizedName: normalized,
          score: 0,
          joinedAt: Date.now(),
          answers: {},
        };
        session.players[player.id] = player;
        await this.save(session);
        return json({ playerId: player.id, state: this.publicState(session, player) }, 201);
      }

      if (url.pathname === "/state" && request.method === "GET") {
        const playerId = url.searchParams.get("playerId") ?? "";
        const player = session.players[playerId];
        if (!player) throw new HttpError(404, "Participant introuvable.", "player_not_found");
        return json(this.publicState(session, player));
      }

      if (url.pathname === "/answer" && request.method === "POST") {
        const body = await readJson(request);
        const playerId = typeof body.playerId === "string" ? body.playerId : "";
        const optionIndex = body.optionIndex;
        const player = session.players[playerId];
        if (!player) throw new HttpError(404, "Participant introuvable.", "player_not_found");
        if (session.phase !== "question" || session.deadline === null || Date.now() >= session.deadline) {
          throw new HttpError(409, "Aucune question n'accepte de réponse.", "answers_closed");
        }
        if (!Number.isInteger(optionIndex) || (optionIndex as number) < 0 || (optionIndex as number) > 2) {
          throw new HttpError(400, "optionIndex doit être un entier entre 0 et 2.");
        }
        const question = session.questions[session.questionIndex];
        if (Object.hasOwn(player.answers, String(question.id))) throw new HttpError(409, "Réponse déjà enregistrée.", "already_answered");
        player.answers[String(question.id)] = optionIndex as number;
        let pointsAwarded = 0;
        if (optionIndex === question.answerIndex) {
          const remainingRatio = Math.max(0, Math.min(1, (session.deadline - Date.now()) / QUESTION_DURATION_MS));
          pointsAwarded = CORRECT_ANSWER_POINTS + Math.floor(MAX_SPEED_BONUS_POINTS * remainingRatio);
          player.score += pointsAwarded;
        }
        await this.save(session);
        return json({ accepted: true, pointsAwarded, score: player.score });
      }

      if (url.pathname === "/admin/start" && request.method === "POST") {
        if (session.phase !== "waiting") throw new HttpError(409, "La session n'est pas en attente.", "invalid_phase");
        const result = await this.env.DB.prepare(
          "SELECT id, prompt, options, answer_index, explanation, category, position FROM questions ORDER BY position, id LIMIT ?",
        )
          .bind(QUIZ_LENGTH)
          .all<QuestionRow>();
        if (result.results.length !== QUIZ_LENGTH) {
          throw new HttpError(409, `La session requiert exactement ${QUIZ_LENGTH} questions disponibles.`, "question_count");
        }
        session.questions = result.results.map(questionFromRow);
        session.phase = "question";
        session.questionIndex = 0;
        session.deadline = Date.now() + QUESTION_DURATION_MS;
        session.cleanupAt = null;
        await this.save(session);
        await this.state.storage.setAlarm(session.deadline);
        return json(this.publicState(session, undefined));
      }

      if (url.pathname === "/admin/next" && request.method === "POST") {
        if (session.phase !== "checkpoint") {
          throw new HttpError(409, "La question en cours doit être terminée.", "invalid_phase");
        }
        session.phase = "question";
        session.questionIndex += 1;
        session.deadline = Date.now() + QUESTION_DURATION_MS;
        await this.save(session);
        const nextAlarm = session.deadline ?? session.cleanupAt;
        if (nextAlarm === null) await this.state.storage.deleteAlarm();
        else await this.state.storage.setAlarm(nextAlarm);
        return json(this.publicState(session, undefined));
      }

      if (url.pathname === "/admin/reset" && request.method === "POST") {
        await this.state.storage.deleteAll();
        await this.state.storage.deleteAlarm();
        const reset = this.emptySession();
        await this.save(reset);
        return json(this.publicState(reset, undefined));
      }

      if (url.pathname === "/admin/state" && request.method === "GET") {
        return json(this.publicState(session, undefined));
      }

      if (url.pathname === "/admin/board" && request.method === "GET") {
        return json(this.boardState(session));
      }

      throw new HttpError(404, "Route interne introuvable.", "not_found");
    } catch (error) {
      return errorResponse(error);
    }
  }

  async alarm(): Promise<void> {
    const session = await this.load();
    if (session.cleanupAt !== null && Date.now() >= session.cleanupAt) {
      await this.state.storage.deleteAll();
      return;
    }
    await this.advanceOverdue(session);
  }
}
