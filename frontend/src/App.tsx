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

const MIC_DEVICE_STORAGE_KEY = "pp_audio_input_device";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

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
      setUser(
        await withTimeout(
          fetchMe(),
          12_000,
          "Сервер не отвечает. Запустите бэкенд: из папки backend выполните uvicorn app.main:app --reload --port 8000"
        )
      );
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
  const peakLevelRef = useRef(0);
  const meterRafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<VoiceRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return localStorage.getItem(MIC_DEVICE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [inputLevel, setInputLevel] = useState(0);

  const mime = useMemo(() => {
    if (typeof MediaRecorder === "undefined") return "";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    return "";
  }, []);

  const refreshAudioInputs = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === "audioinput"));
    } catch {
      setAudioInputs([]);
    }
  }, []);

  useEffect(() => {
    void refreshAudioInputs();
    navigator.mediaDevices.addEventListener("devicechange", refreshAudioInputs);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshAudioInputs);
  }, [refreshAudioInputs]);

  function stopMeter() {
    cancelAnimationFrame(meterRafRef.current);
    meterRafRef.current = 0;
    setInputLevel(0);
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }
  }

  async function openMicrophone(): Promise<MediaStream> {
    const processing: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...processing, deviceId: { exact: deviceId } },
        });
      } catch {
        setErr("Выбранный микрофон недоступен. Выберите другой или «По умолчанию».");
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: processing });
  }

  async function start() {
    setErr(null);
    chunks.current = [];
    mimeRef.current = mime;
    peakLevelRef.current = 0;
    stopMeter();

    const stream = await openMicrophone();
    await refreshAudioInputs();

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const td = new Uint8Array(analyser.fftSize);
    function meterTick() {
      analyser.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const v = (td[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / td.length);
      peakLevelRef.current = Math.max(peakLevelRef.current, rms);
      setInputLevel(rms);
      meterRafRef.current = requestAnimationFrame(meterTick);
    }
    meterRafRef.current = requestAnimationFrame(meterTick);

    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    mr.onstop = () => {
      stopMeter();
      stream.getTracks().forEach((t) => t.stop());
      void (async () => {
        const blob = new Blob(chunks.current, { type: mimeRef.current || mr.mimeType || "audio/webm" });
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
          if (peakLevelRef.current < 0.012) {
            setErr(
              "Уровень сигнала при записи почти нулевой — в файл, скорее всего, попала тишина. В списке выше выберите тот микрофон, который работает в других программах, и проверьте зелёную полосу уровня во время записи.",
            );
          } else if (!(row.raw_transcript || "").trim()) {
            setErr(
              "Распознавание не дало текста: говорите громче и дольше (5–10 с) или введите текст вручную в «Истории».",
            );
          }
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
          …» или «Отменить обработку плавки 21957898». Браузер может брать <strong>другой микрофон</strong>, чем Audacity
          или Zoom — выберите устройство ниже.
        </p>
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label>Микрофон для этого сайта</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <select
              style={{ flex: 1, minWidth: 0 }}
              value={deviceId}
              disabled={!!rec || busy}
              onChange={(e) => {
                const v = e.target.value;
                setDeviceId(v);
                try {
                  if (v) localStorage.setItem(MIC_DEVICE_STORAGE_KEY, v);
                  else localStorage.removeItem(MIC_DEVICE_STORAGE_KEY);
                } catch {
                  /* ignore */
                }
              }}
            >
              <option value="">По умолчанию (как выбрал браузер)</option>
              {audioInputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Вход ${d.deviceId.slice(0, 8)}…`}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void refreshAudioInputs()}>
              Обновить список
            </button>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
            Если названий нет — один раз начните запись (разрешите доступ), затем нажмите «Обновить список».
          </p>
        </div>
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
        {rec && (
          <div className="mic-meter" style={{ marginTop: "0.75rem" }}>
            <div className="mic-meter-track">
              <div className="mic-meter-fill" style={{ width: `${Math.min(100, inputLevel * 500)}%` }} />
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.35rem 0 0" }}>
              Уровень входа: {inputLevel < 0.01 ? "тишина — смените микрофон или проверьте громкость" : "сигнал есть"}
            </p>
          </div>
        )}
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
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              !(row.raw_transcript || "").trim()
                ? "Распознавание пустое — введите команду вручную или запишите снова громче."
                : undefined
            }
          />
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
          Исходное распознавание:{" "}
          <span className="mono">{(row.raw_transcript || "").trim() ? row.raw_transcript : "— (пусто)"}</span>
        </p>
        {err && <p className="error">{err}</p>}
        {!(row.raw_transcript || "").trim() && (
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem", marginBottom: 0 }}>
            Подтверждение доступно после ввода текста вручную (распознавание не сработало).
          </p>
        )}
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
