
"use client";
import Link from "next/link";
import { useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type DetectedIssue = {
  id: number;
  title: string;
  system: string;
  severity: string;
  status: string;
  description: string;
  cause: string;
  recommendation: string;
};

export default function LogAnalyzer() {
  const [logs, setLogs] = useState("");
  const [system, setSystem] = useState("Application Logs");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DetectedIssue[]>([]);
  const [analyzed, setAnalyzed] = useState(false);

  async function analyzeLogs() {
    if (!logs.trim()) {
      setError("Please enter logs before analysis.");
      return;
    }

    setLoading(true);
    setError("");
    setResult([]);
    setAnalyzed(false);

    try {
      const token = localStorage.getItem("nexora_token");
      if (!token) {
        throw new Error("Your session is missing. Please sign in from the dashboard and try again.");
      }

      const response = await fetch(`${API_URL}/api/analyze-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logs, system }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Analysis failed.");
      }

      setResult(Array.isArray(data.issues) ? data.issues : []);
      setAnalyzed(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect to backend."
      );
    } finally {
      setLoading(false);
    }
  }

  const severityColor = (severity: string) => {
    if (severity === "Critical") return "text-red-400";
    if (severity === "High") return "text-orange-400";
    return "text-yellow-400";
  };

  return (
    <main className="min-h-screen bg-[#080d19] text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto">

        <Link href="/" className="text-blue-400 hover:text-blue-300">
  ← Back to Dashboard
</Link>

        <div className="mt-8 mb-8">
          <p className="text-blue-400 text-sm font-semibold">
            NEXORA AI / INTELLIGENCE
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-2">
            Log Analyzer
          </h1>
          <p className="text-gray-400 mt-2">
            Analyze application logs and automatically identify system faults.
          </p>
        </div>

        <section className="bg-[#111a2b] border border-gray-800 rounded-2xl p-6">
          <label className="block text-sm text-gray-300 mb-2">
            System Name
          </label>

          <input
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="Enter system name"
            className="w-full bg-[#080d19] border border-gray-700 rounded-lg p-3 mb-5 outline-none focus:border-blue-500"
          />

          <label className="block text-sm text-gray-300 mb-2">
            Application Logs
          </label>

          <textarea
            value={logs}
            onChange={(e) => setLogs(e.target.value)}
            placeholder={"Paste your logs here...\n\nExample:\nERROR: API request timeout\nWARNING: Deprecated function\nCRITICAL: Out of memory"}
            rows={12}
            className="w-full bg-[#080d19] border border-gray-700 rounded-lg p-4 font-mono text-sm outline-none focus:border-blue-500 resize-y"
          />

          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={analyzeLogs}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold"
            >
              {loading ? "Analyzing..." : "Analyze Logs"}
            </button>

            <button
              onClick={() => {
                setLogs("");
                setResult([]);
                setError("");
                setAnalyzed(false);
              }}
              className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg"
            >
              Clear
            </button>
          </div>
        </section>

        {analyzed && (
          <section className="mt-8">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-2xl font-bold">Analysis Results</h2>
              <span className="text-blue-400">
                {result.length} issues saved
              </span>
            </div>

            {result.length === 0 ? (
              <div className="bg-[#111a2b] border border-gray-800 rounded-xl p-6 text-gray-300">
                No matching issues detected in these logs.
              </div>
            ) : (
              <div className="space-y-4">
                {result.map((issue) => (
                  <div
                    key={issue.id}
                    className="bg-[#111a2b] border border-gray-800 rounded-xl p-5"
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="font-bold text-lg">
                        {issue.title}
                      </h3>

                      <span className={`font-semibold ${severityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </div>

                    <p className="text-gray-400 text-sm mt-2">
                      System: {issue.system} | Issue ID: #{issue.id}
                    </p>

                    <div className="mt-4 space-y-3 text-sm">
                      <p>
                        <span className="text-gray-400">Description: </span>
                        {issue.description}
                      </p>

                      <p>
                        <span className="text-gray-400">Possible Cause: </span>
                        {issue.cause}
                      </p>

                      <p>
                        <span className="text-gray-400">Recommendation: </span>
                        {issue.recommendation}
                      </p>
                    </div>

                    <p className="text-green-400 text-xs mt-4">
                      Saved to Issue Monitor · Status: {issue.status || "Open"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
