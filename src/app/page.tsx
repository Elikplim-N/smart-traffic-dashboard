"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Lightbulb,
  Clock,
  MapPin,
  Signal,
  Car as TrafficIcon,     // ✅ replace this
} from "lucide-react";
import dynamic from "next/dynamic";

// Login form moved out of Dashboard to avoid remounts / focus loss
type LoginHandler = (u: string, p: string) => boolean;

function LoginForm({ onLogin }: { onLogin: LoginHandler }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-indigo-900 to-sky-700">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              if (!username.trim() || !password) {
                setError("Username and password are required.");
                setLoading(false);
                return;
              }
              const ok = onLogin(username.trim(), password);
              if (!ok) {
                setError("Invalid credentials.");
                setLoading(false);
                return;
              }
              setTimeout(() => setLoading(false), 250);
            }}
            className="space-y-4"
          >
            <div className="text-xs text-slate-500">Use username <b>adm1n</b> and password <b>1234</b>.</div>
            <input
              aria-label="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded border px-3 py-2 text-slate-900"
              style={{ caretColor: "#000" }}
            />
            <input
              aria-label="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded border px-3 py-2 text-slate-900"
              style={{ caretColor: "#000" }}
            />
            {error && <div className="text-sm text-rose-500">{error}</div>}
            <div className="flex items-center justify-between">
              <button type="submit" className="rounded bg-blue-600 text-white px-4 py-2" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const TrafficMap = dynamic(() => import("@/components/TrafficMap"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type LightColor = "red" | "yellow" | "green" | null;

interface TrafficData {
  id: string;
  created_at: string;
  event_type: "update" | "congestion" | "clear" | "tilt" | "boot" | string;
  congestion: boolean; // RAW
  light_main: LightColor;
  tilt_detected: boolean | null;
  street_light_on: boolean | null;
  pitch_deg: number | null;
  roll_deg: number | null;
  baseline_cm: number | null;
  threshold_cm: number | null;
  cfg_green_ms: number | null;
  cfg_yellow_ms: number | null;
  distance_cm?: number | null;
}

interface TrafficConfig {
  id: string;
  normal_green_ms: number;
  yellow_ms: number;
  updated_at: string;
}

const LOCATION = { lat: 5.6037, lng: -0.1870, name: "Accra Traffic System" };

export default function Dashboard() {
  // Latest row for live state
  const [row, setRow] = useState<TrafficData | null>(null);
  // Simple client-only auth (username + password)
  const [user, setUser] = useState<{ username: string } | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const s = localStorage.getItem("simple_user");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  // Enforce strict credentials: username "adm1n" password "1234"
  const login = (username: string, password: string) => {
    console.log("[auth] attempt:", { username });
    if (username === "adm1n" && password === "1234") {
      const u = { username };
      setUser(u);
      try {
        localStorage.setItem("simple_user", JSON.stringify(u));
      } catch {}
      console.log("[auth] success");
      return true;
    }
    console.log("[auth] failed");
    return false;
  };
  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem("simple_user");
    } catch {}
  };

  // Recent alerts (table)
  const [alerts, setAlerts] = useState<TrafficData[]>([]);

  // Config (sliders)
  const [cfg, setCfg] = useState<TrafficConfig | null>(null);
  const [greenMs, setGreenMs] = useState<number>(10000);
  const [yellowMs, setYellowMs] = useState<number>(3000);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // --- Fetchers ---
  const fetchLatest = async () => {
    const { data } = await supabase
      .from("traffic_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.length) setRow(data[0] as TrafficData);
  };

  const fetchAlerts = async () => {
    // Pull recent rows; highlight non-UPDATE or tilt alerts
    const { data } = await supabase
      .from("traffic_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (data?.length) {
      const filtered = (data as TrafficData[]).filter(
        (d) => d.event_type !== "update" || d.tilt_detected === true
      );
      setAlerts(filtered.slice(0, 50)); // keep top 50
    }
  };

  const fetchConfig = async () => {
    const { data } = await supabase
      .from("traffic_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (data?.length) {
      const c = data[0] as TrafficConfig;
      setCfg(c);
      setGreenMs(c.normal_green_ms);
      setYellowMs(c.yellow_ms);
    }
  };

  // --- Effects: realtime + polling ---
  useEffect(() => {
    let alive = true;

    fetchLatest();
    fetchAlerts();
    fetchConfig();

    const chData = supabase
      .channel("traffic-data")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "traffic_data" }, (payload) => {
        if (!alive) return;
        const r = payload.new as TrafficData;
        setRow(r);
        if (r.event_type !== "update" || r.tilt_detected) {
          setAlerts((prev) => {
            const next = [r, ...prev];
            return next.slice(0, 50);
          });
        }
      })
      .subscribe();

    const chCfg = supabase
      .channel("traffic-config")
      .on("postgres_changes", { event: "*", schema: "public", table: "traffic_config" }, () => {
        if (!alive) return;
        fetchConfig();
      })
      .subscribe();

    // 1s polling for robustness + “live feel”
    const iv1 = setInterval(fetchLatest, 1000);
    const iv2 = setInterval(fetchAlerts, 1000);
    const iv3 = setInterval(fetchConfig, 1000);

    return () => {
      alive = false;
      clearInterval(iv1);
      clearInterval(iv2);
      clearInterval(iv3);
      supabase.removeChannel(chData);
      supabase.removeChannel(chCfg);
    };
  }, []);

  // --- Save controls ---
  const saveConfig = async () => {
    setSaving(true);
    const { error } = await supabase.from("traffic_config").insert({
      normal_green_ms: greenMs,
      yellow_ms: yellowMs,
    });
    setSaving(false);
    if (!error) setSavedAt(new Date().toISOString());
  };

  // --- Derived UI bits ---
  const connectionHealthy = useMemo(() => {
    if (!row?.created_at) return false;
    const delta = Date.now() - new Date(row.created_at).getTime();
    return delta < 10_000; // seen within last 10s
  }, [row?.created_at]);

  const lightColor = (row?.light_main ?? "red") as LightColor;

  const TrafficLight = ({ color }: { color: LightColor }) => (
    <div className="flex flex-col items-center">
      <div className="h-64 w-28 rounded-[2rem] bg-slate-950 p-3 flex flex-col justify-between shadow-2xl ring-1 ring-white/10">
        <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${color === "red"    ? "bg-red-500 shadow-[0_0_22px_8px_rgba(239,68,68,0.6)] animate-pulse" : "bg-slate-700"}`} />
        <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${color === "yellow" ? "bg-yellow-400 shadow-[0_0_22px_8px_rgba(234,179,8,0.55)] animate-pulse" : "bg-slate-700"}`} />
        <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${color === "green"  ? "bg-green-500 shadow-[0_0_22px_8px_rgba(34,197,94,0.6)] animate-pulse" : "bg-slate-700"}`} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Badge className={`${row?.congestion ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          {row?.congestion ? "Congested" : "Flowing"}
        </Badge>
        <Badge className="bg-slate-100 text-slate-800 capitalize">{color ?? "red"}</Badge>
      </div>
    </div>
  );

  const StatCard = ({
    title,
    value,
    icon,
    tone = "default",
    sub,
  }: {
    title: string;
    value: string;
    icon: React.ReactNode;
    tone?: "default" | "ok" | "warn" | "bad";
    sub?: string;
  }) => {
    const toneClass =
      tone === "ok"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : tone === "bad"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-50 text-slate-700";
    return (
      <Card className="bg-white/90 backdrop-blur">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">{title}</div>
            <div className={`rounded-md px-2 py-1 text-xs ${toneClass}`}>{icon}</div>
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </CardContent>
      </Card>
    );
  };

  // Formatters
  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString() : "--";

  const alertRowClass = (e: TrafficData) => {
    if (e.event_type === "congestion" || e.tilt_detected) return "bg-rose-50";
    if (e.event_type === "clear") return "bg-emerald-50";
    if (e.event_type === "boot") return "bg-blue-50";
    return "";
  };

  // if not signed in show login form
  if (!user) return <LoginForm onLogin={login} />;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-sky-700 text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-10 backdrop-blur bg-black/20 ring-1 ring-white/10">
        <div className="mx-auto max-w-screen-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrafficIcon className="text-yellow-300" />
            <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
              Smart Traffic Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 mr-3">
              <div className="text-sm text-slate-100">Signed in as {user.username}</div>
              <button
                onClick={logout}
                className="text-sm text-slate-200 bg-black/20 px-2 py-1 rounded hover:bg-black/30"
              >
                Sign out
              </button>
            </div>
            <Badge className={`${connectionHealthy ? "bg-emerald-500" : "bg-rose-500"} text-white`}>
              <Signal className="mr-1 h-4 w-4" />
              {connectionHealthy ? "Live" : "Reconnecting"}
            </Badge>
            <Badge className="bg-black/60 text-slate-100">
              <Clock className="mr-1 h-4 w-4" />
              {fmtTime(row?.created_at)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-screen-2xl p-6 grid gap-6">
        {/* Top stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Current Light"
            value={(row?.light_main ?? "—").toString().toUpperCase()}
            icon={<TrafficIcon className="h-4 w-4" />}
            tone={row?.light_main === "green" ? "ok" : row?.light_main === "yellow" ? "warn" : "bad"}
            sub={`Since ${fmtTime(row?.created_at)}`}
          />
          <StatCard
            title="Traffic"
            value={row?.congestion ? "Congested" : "Flowing"}
            icon={<Activity className="h-4 w-4" />}
            tone={row?.congestion ? "bad" : "ok"}
            sub={row?.distance_cm ? `${row.distance_cm.toFixed(1)} cm` : undefined}
          />
          <StatCard
            title="Baseline / Threshold"
            value={`${row?.baseline_cm?.toFixed?.(1) ?? "—"} / ${row?.threshold_cm?.toFixed?.(1) ?? "—"} cm`}
            icon={<MapPin className="h-4 w-4" />}
            sub="Auto-calibrated at boot"
          />
          <StatCard
            title="Tilt"
            value={row?.tilt_detected ? "Alert" : "Stable"}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={row?.tilt_detected ? "bad" : "ok"}
            sub={
              typeof row?.pitch_deg === "number" && typeof row?.roll_deg === "number"
                ? `P ${row.pitch_deg.toFixed(1)}° / R ${row.roll_deg.toFixed(1)}°`
                : undefined
            }
          />
        </div>

        {/* Controls (full width) */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Main Green */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">Main Green (ms)</span>
                  <span className="text-sm text-slate-600">{greenMs} ms</span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={60000}
                  step={500}
                  value={greenMs}
                  onChange={(e) => setGreenMs(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>

              {/* Yellow */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">Yellow (ms)</span>
                  <span className="text-sm text-slate-600">{yellowMs} ms</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={100}
                  value={yellowMs}
                  onChange={(e) => setYellowMs(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Timing"}
              </button>
              {savedAt && (
                <span className="text-sm text-slate-600">
                  Saved at {new Date(savedAt).toLocaleTimeString()}
                </span>
              )}
              <span className="ml-auto text-sm text-slate-500">
                Device applies within ~5s
              </span>
              {row?.cfg_green_ms && row?.cfg_yellow_ms && (
                <span className="text-sm text-slate-500">
                  In effect: <b>{row.cfg_green_ms} ms</b> / <b>{row.cfg_yellow_ms} ms</b>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Middle row: Traffic Light + Map */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Traffic Lights */}
          <Card className="bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Traffic Lights</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {row ? (
                <TrafficLight color={lightColor} />
              ) : (
                <p className="text-slate-500">Waiting…</p>
              )}

              {row?.tilt_detected && (
                <div className="mt-6 flex items-center gap-2 rounded-lg bg-rose-100 p-3 w-full">
                  <AlertTriangle className="text-rose-600" />
                  <span className="text-rose-700 font-medium">Tilt detected (≥ 3°)!</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle>System Location</CardTitle>
            </CardHeader>
            <CardContent>
              <TrafficMap
                lat={LOCATION.lat}
                lng={LOCATION.lng}
                name={LOCATION.name}
                congestion={row?.congestion ?? false}
              />
              <div className="mt-3 text-xs text-slate-500 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {LOCATION.lat}, {LOCATION.lng}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row: Tilt + Street Light */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tilt */}
          <Card className="bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Tilt</CardTitle>
            </CardHeader>
            <CardContent>
              {row ? (
                <div
                  className={`p-4 rounded-lg ${
                    row.tilt_detected ? "bg-rose-100 text-rose-800" : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {row.tilt_detected ? "⚠️ Tilt ≥ 3°" : "Stable"}
                  {typeof row.pitch_deg === "number" && typeof row.roll_deg === "number" && (
                    <span className="ml-2 text-xs opacity-80">
                      (P: {row.pitch_deg.toFixed(1)}° / R: {row.roll_deg.toFixed(1)}°)
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">Waiting…</p>
              )}
            </CardContent>
          </Card>

          {/* Street Light */}
          <Card className="bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Street Light</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              {row ? (
                <>
                  <Lightbulb className={`h-6 w-6 ${row.street_light_on ? "text-yellow-500" : "text-slate-400"}`} />
                  <span className="text-slate-700">
                    {row.street_light_on ? "ON (Dark)" : "OFF (Light)"}
                  </span>
                </>
              ) : (
                <p className="text-slate-500">Waiting…</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts Log (full width) */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <CardTitle>Alerts Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Light</th>
                      <th className="px-4 py-2">Traffic</th>
                      <th className="px-4 py-2">Distance</th>
                      <th className="px-4 py-2">Tilt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.length === 0 && (
                      <tr>
                        <td className="px-4 py-3 text-slate-500" colSpan={6}>
                          No alerts yet.
                        </td>
                      </tr>
                    )}
                    {alerts.map((e) => (
                      <tr key={e.id} className={`${alertRowClass(e)} border-t border-slate-100`}>
                        <td className="px-4 py-2 text-slate-700">{fmtTime(e.created_at)}</td>
                        <td className="px-4 py-2 capitalize">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              e.event_type === "congestion"
                                ? "bg-rose-200 text-rose-800"
                                : e.event_type === "clear"
                                ? "bg-emerald-200 text-emerald-800"
                                : e.event_type === "tilt"
                                ? "bg-amber-200 text-amber-900"
                                : e.event_type === "boot"
                                ? "bg-blue-200 text-blue-900"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {e.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 capitalize text-slate-700">{e.light_main ?? "—"}</td>
                        <td className="px-4 py-2">
                          {e.congestion ? (
                            <span className="text-rose-700">Congested</span>
                          ) : (
                            <span className="text-emerald-700">Clear</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {typeof e.distance_cm === "number" ? `${e.distance_cm.toFixed(1)} cm` : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {e.tilt_detected ? (
                            <span className="text-rose-700">Tilt</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Showing last {alerts.length} significant events.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
