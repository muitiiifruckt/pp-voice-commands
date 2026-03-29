import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  VoiceRecord,
  confirmRecord,
  createUser,
  fetchAudioObjectUrl,
  fetchMe,
  getToken,
  listRecords,
  listUsers,
  login,
  patchUser,
  setToken,
  uploadVoice,
} from "./api";

type Tab = "record" | "history" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("record");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setUser(await fetchMe());
      setErr(null);
    } catch (e) {
      setUser(null);
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(loginUser, loginPass);
      await bootstrap();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка входа");
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    setTab("record");
  }

  if (loading) {
    return (
      <div className="layout">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="layout">
        <h1>Вход</h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>Голосовые команды — оператор / админ</p>
        <form className="card" onSubmit={onLogin} style={{ maxWidth: 360 }}>
          <div className="field">
            <label>Логин</label>
            <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input
              type="password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {err && <p className="error">{err}</p>}
          <button type="submit" className="btn">
            Войти
          </button>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "1rem" }}>
            По умолчанию: admin / admin123 или operator / operator123
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="layout">
      <header className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Голосовые команды</h1>
          <span className="badge">
            {user.username} · {user.role === "admin" ? "администратор" : "оператор"}
          </span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Выйти
        </button>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === "record" ? "active" : ""} onClick={() => setTab("record")}>
          Запись
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          История
        </button>
        {user.role === "admin" && (
          <button type="button" className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
            Пользователи
          </button>
        )}
      </nav>

      {tab === "record" && <RecordPanel onSaved={bootstrap} />}
      {tab === "history" && <HistoryPanel me={user} />}
      {tab === "admin" && user.role === "admin" && <AdminPanel />}
    </div>
  );
}

function RecordPanel({ onSaved }: { onSaved: () => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const mimeRef = useRef("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<VoiceRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mime = useMemo(() => {
    if (typeof MediaRecorder === "undefined") return "";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    return "";
  }, []);

  async function start() {
    setErr(null);
    chunks.current = [];
    mimeRef.current = mime;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void (async () => {
        const blob = new Blob(chunks.current, { type: mimeRef.current || "audio/webm" });
        chunks.current = [];
        if (!blob.size) {
          setStatus("");
          setBusy(false);
          return;
        }
        setBusy(true);
        setErr(null);
        try {
          const ext = blob.type.includes("webm") ? "webm" : "dat";
          const row = await uploadVoice(blob, `cmd.${ext}`);
          setLast(row);
          onSaved();
          setStatus("Готово");
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Ошибка");
          setStatus("");
        } finally {
          setBusy(false);
        }
      })();
    };
    mr.start();
    setRec(mr);
    setStatus("Идёт запись…");
  }

  function stop() {
    if (!rec) return;
    setStatus("Обработка…");
    setBusy(true);
    rec.stop();
    setRec(null);
  }

  return (
    <div>
      <div className="card">
        <h2>Запись команды</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Произнесите команду чётко по-русски, лучше <strong>5–10 секунд</strong>. Пример: «Зарегистрировать трубу номер
          …» или «Отменить обработку плавки 21957898». Если текст часто пустой — попробуйте модель побольше (см. README).
        </p>
        <div className="row">
          {!rec ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
              Начать запись
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={stop}>
              Остановить и распознать
            </button>
          )}
          {busy && <span className="badge">Отправка на сервер…</span>}
        </div>
        {status && <p style={{ marginTop: "0.75rem" }}>{status}</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {last && (
        <div className="card">
          <h2>Результат</h2>
          <p>
            <strong>Распознавание:</strong> <span className="mono">{last.raw_transcript || "—"}</span>
          </p>
          <p>
            <strong>Команда:</strong> {last.parsed_command || "—"}
          </p>
          <p>
            <strong>Параметр:</strong> <span className="mono">{last.parsed_identifier || "—"}</span>
          </p>
          <p className="badge">{last.is_confirmed ? "Подтверждено" : "Черновик — проверьте в «Истории»"}</p>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ me }: { me: User }) {
  const [rows, setRows] = useState<VoiceRecord[]>([]);
  const [command, setCommand] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoiceRecord | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await listRecords({
        command: command || undefined,
        identifier: identifier || undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
        operator_id: operatorId ? Number(operatorId) : undefined,
      });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }, [command, identifier, dateFrom, dateTo, operatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (me.role !== "admin") return;
    void listUsers()
      .then(setUsers)
      .catch(() => {});
  }, [me.role]);

  return (
    <div>
      <div className="card">
        <h2>Фильтры</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
            <label>Команда / текст</label>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="зарегистрировать" />
          </div>
          <div className="field" style={{ flex: "1 1 120px", marginBottom: 0 }}>
            <label>Параметр</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="21957898" />
          </div>
          <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
            <label>С даты</label>
            <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "1 1 140px", marginBottom: 0 }}>
            <label>По дату</label>
            <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {me.role === "admin" && (
            <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
              <label>Оператор</label>
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                <option value="">Все</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="btn" onClick={() => void load()}>
            Применить
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2>Записи</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Время</th>
              {me.role === "admin" && <th>Оператор</th>}
              <th>Команда</th>
              <th>Параметр</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                {me.role === "admin" && <td>{r.username || r.user_id}</td>}
                <td>{r.parsed_command || "—"}</td>
                <td className="mono">{r.parsed_identifier || "—"}</td>
                <td>
                  <span className={`badge ${r.is_confirmed ? "ok" : ""}`}>
                    {r.is_confirmed ? "подтверждено" : "черновик"}
                  </span>
                </td>
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: "0.35rem 0.6rem" }} onClick={() => setDetail(r)}>
                    Карточка
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ color: "var(--muted)" }}>Нет записей</p>}
      </div>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} onSaved={() => void load()} />}
    </div>
  );
}

function DetailModal({
  row,
  onClose,
  onSaved,
}: {
  row: VoiceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(row.confirmed_transcript || row.raw_transcript);
  const [cmd, setCmd] = useState(row.parsed_command || "");
  const [ident, setIdent] = useState(row.parsed_identifier || "");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    void fetchAudioObjectUrl(row.audio_url)
      .then((u) => {
        revoke = u;
        setAudioUrl(u);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Аудио"));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [row.audio_url]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await confirmRecord(row.id, {
        confirmed_transcript: text,
        parsed_command: cmd || null,
        parsed_identifier: ident || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
      role="dialog"
      aria-modal
    >
      <div className="card" style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <h2>Запись #{row.id}</h2>
        {audioUrl ? (
          <audio controls src={audioUrl} style={{ width: "100%", marginBottom: "0.75rem" }} />
        ) : (
          <p className="muted">Загрузка аудио…</p>
        )}
        <div className="field">
          <label>Текст (после правки — подтвердить)</label>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Команда</label>
            <input value={cmd} onChange={(e) => setCmd(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Параметр</label>
            <input className="mono" value={ident} onChange={(e) => setIdent(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Исходное распознавание: <span className="mono">{row.raw_transcript}</span>
        </p>
        {err && <p className="error">{err}</p>}
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => void confirm()}>
            Подтвердить результат
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "admin">("operator");
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setUsers(await listUsers());
  }

  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await createUser({ username, password, role });
      setUsername("");
      setPassword("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Новый пользователь</h2>
        <form onSubmit={(e) => void addUser(e)}>
          <div className="row">
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Логин</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: "0 0 140px", marginBottom: 0 }}>
              <label>Роль</label>
              <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "operator")}>
                <option value="operator">Оператор</option>
                <option value="admin">Админ</option>
              </select>
            </div>
            <button type="submit" className="btn" style={{ alignSelf: "flex-end" }}>
              Создать
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Список</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Активен</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.is_active ? "да" : "нет"}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: "0.35rem 0.6rem", marginRight: "0.35rem" }}
                    onClick={() =>
                      void patchUser(u.id, { role: u.role === "admin" ? "operator" : "admin" }).then(refresh)
                    }
                  >
                    Сменить роль
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: "0.35rem 0.6rem" }}
                    onClick={() => void patchUser(u.id, { is_active: !u.is_active }).then(refresh)}
                  >
                    {u.is_active ? "Блок" : "Разблок"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
