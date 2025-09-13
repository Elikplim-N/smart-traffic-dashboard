"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Lightbulb, MapPin } from "lucide-react";
import dynamic from "next/dynamic";

const TrafficMap = dynamic(() => import("@/components/TrafficMap"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface TrafficData {
  id: string;
  created_at: string;
  event_type: string;
  congestion: boolean;
  light_main: "red" | "yellow" | "green" | null;
  tilt_detected: boolean | null;
  street_light_on: boolean | null;
  pitch_deg: number | null;
  roll_deg: number | null;
  baseline_cm: number | null;
  threshold_cm: number | null;
}

const LOCATION = { lat: 5.6037, lng: -0.1870, name: "Accra Traffic System" };

export default function Dashboard() {
  const [row, setRow] = useState<TrafficData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simple client-only login (no Supabase auth)
  const [user, setUser] = useState<{ name: string } | null>(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const login = (name: string) => {
    const u = { name };
    setUser(u);
    try { localStorage.setItem("user", JSON.stringify(u)); } catch {}
  };
  const logout = () => {
    setUser(null);
    try { localStorage.removeItem("user"); } catch {}
  };

  const LoginForm = ({ onLogin }: { onLogin: (name: string) => void }) => {
    const [name, setName] = useState("");
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onLogin(name.trim());
              }}
              className="space-y-4"
            >
              <input
                aria-label="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded border px-3 py-2"
              />
              <div className="flex items-center justify-between">
                <button type="submit" className="rounded bg-blue-600 text-white px-4 py-2">
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setName("guest"); onLogin("guest"); }}
                  className="text-sm text-slate-600"
                >
                  Join as guest
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

  useEffect(() => {
    let alive = true;

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("traffic_data")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!alive) return;
      if (!error && data?.length) {
        setRow(data[0] as TrafficData);
      }
      if (isLoading) setIsLoading(false);
    };

    // Initial fetch
    fetchLatest();

    // Realtime subscription
    const ch = supabase
      .channel("traffic-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "traffic_data" },
        (payload) => {
          if (!alive) return;
          setRow(payload.new as TrafficData);
          if (isLoading) setIsLoading(false);
        }
      )
      .subscribe();

    // Polling as fallback
    const interval = setInterval(fetchLatest, 1000);

    return () => {
      alive = false;
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, [isLoading]);
  
  // If not logged in show the simple login UI
  if (!user) {
    return <LoginForm onLogin={login} />;
  }
 
  const TrafficLight = ({ color }: { color: "red" | "yellow" | "green" | null }) => (
    <div className="flex flex-col items-center">
      <div className="relative h-56 w-24 rounded-[2rem] bg-slate-900 p-3 shadow-2xl">
        <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900"></div>
        <div className="relative flex h-full flex-col justify-between">
          <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${
            color === "red" 
              ? "bg-red-500 shadow-[0_0_22px_8px_rgba(239,68,68,0.6)] animate-pulse" 
              : "bg-slate-700"
          }`} />
          <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${
            color === "yellow" 
              ? "bg-yellow-400 shadow-[0_0_22px_8px_rgba(234,179,8,0.55)] animate-pulse" 
              : "bg-slate-700"
          }`} />
          <div className={`h-16 w-16 mx-auto rounded-full transition-all duration-500 ${
            color === "green" 
              ? "bg-green-500 shadow-[0_0_22px_8px_rgba(34,197,94,0.6)] animate-pulse" 
              : "bg-slate-700"
          }`} />
        </div>
      </div>
      <Badge className={`mt-4 text-sm px-3 py-1 ${
        row?.congestion 
          ? "bg-red-100 text-red-800 hover:bg-red-200" 
          : "bg-green-100 text-green-800 hover:bg-green-200"
      }`}>
        {row?.congestion ? (
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Congested
          </span>
        ) : (
          "Flowing"
        )}
      </Badge>
    </div>
  );

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-blue-200"></div>
        <div className="absolute top-0 h-16 w-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-gray-500">Connecting to traffic system...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="flex items-center justify-end mb-4">
        <div className="text-sm text-slate-700 mr-4">Signed in as {user?.name}</div>
        <button onClick={logout} className="text-sm text-red-600">Sign out</button>
      </div>
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Accra Traffic Monitoring System</h1>
          <p className="text-slate-600 mt-1">Real-time traffic and infrastructure monitoring</p>
        </header>

        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {/* Traffic Lights */}
            <Card className="bg-white/80 backdrop-blur-sm shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  Traffic Lights
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                {row ? (
                  <>
                    <TrafficLight color={row.light_main ?? "red"} />
                    {row?.tilt_detected && (
                      <div className="mt-6 flex items-center gap-3 rounded-lg bg-red-50 p-4 w-full border border-red-100">
                        <AlertTriangle className="text-red-600 h-5 w-5 flex-shrink-0" />
                        <div>
                          <p className="text-red-800 font-medium">Tilt detected (≥ 3°)!</p>
                          <p className="text-red-600 text-sm mt-1">
                            Immediate inspection required
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-4" suppressHydrationWarning>
                      Last update: {row ? new Date(row.created_at).toLocaleTimeString() : "--"}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500 py-8">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Tilt & Street Light */}
            <div className="space-y-5">
              <Card className="bg-white/80 backdrop-blur-sm shadow-sm border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Tilt Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {row ? (
                    <div className={`p-4 rounded-lg ${
                      row.tilt_detected 
                        ? "bg-red-50 border border-red-100" 
                        : "bg-emerald-50 border border-emerald-100"
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${
                          row.tilt_detected ? "bg-red-500" : "bg-emerald-500"
                        }`}></div>
                        <span className={`font-medium ${
                          row.tilt_detected ? "text-red-800" : "text-emerald-800"
                        }`}>
                          {row.tilt_detected ? "⚠️ Tilt detected" : "Stable"}
                        </span>
                      </div>
                      {typeof row.pitch_deg === "number" && typeof row.roll_deg === "number" && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-white/50 p-2 rounded">
                            <p className="text-slate-500">Pitch</p>
                            <p className="font-mono">{row.pitch_deg.toFixed(1)}°</p>
                          </div>
                          <div className="bg-white/50 p-2 rounded">
                            <p className="text-slate-500">Roll</p>
                            <p className="font-mono">{row.roll_deg.toFixed(1)}°</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 py-4">No data available</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/80 backdrop-blur-sm shadow-sm border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Street Light
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {row ? (
                    <div className="flex items-center gap-3">
                      <Lightbulb className={`h-8 w-8 ${
                        row.street_light_on ? "text-amber-500" : "text-slate-400"
                      }`} />
                      <div>
                        <p className="font-medium text-slate-800">
                          {row.street_light_on ? "ON" : "OFF"}
                        </p>
                        <p className="text-sm text-slate-600">
                          {row.street_light_on ? "Dark conditions detected" : "Sufficient ambient light"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 py-4">No data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Map */}
            <Card className="md:col-span-2 bg-white/80 backdrop-blur-sm shadow-sm border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  System Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80 rounded-lg overflow-hidden border border-slate-200">
                  {row ? (
                    <TrafficMap
                      lat={LOCATION.lat}
                      lng={LOCATION.lng}
                      name={LOCATION.name}
                      congestion={row?.congestion ?? false}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-slate-50">
                      <p className="text-slate-500">Map loading...</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-slate-600">{LOCATION.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {row?.congestion ? "High Traffic" : "Normal Traffic"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}