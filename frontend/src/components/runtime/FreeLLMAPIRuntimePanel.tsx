import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Play,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  getFreeLLMAPIStatus,
  testFreeLLMAPIConnection,
  startFreeLLMAPIService,
  stopFreeLLMAPIService,
  FreeLLMAPIStatusResponse,
} from '@/api/runtime';

export const FreeLLMAPIRuntimePanel: React.FC = () => {
  const [status, setStatus] = useState<FreeLLMAPIStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState(() => {
    try {
      return localStorage.getItem('hyades_freellmapi_autostart') === 'true';
    } catch {
      return false;
    }
  });

  const loadStatus = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await getFreeLLMAPIStatus();
      setStatus(res);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed checking FreeLLMAPI status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleToggleAutoStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAutoStart(checked);
    try {
      localStorage.setItem('hyades_freellmapi_autostart', String(checked));
    } catch {
      // Ignore
    }
    setActionMessage(
      checked
        ? 'Automatic startup preference enabled. Hyades will probe and initialize FreeLLMAPI.'
        : 'Automatic startup preference disabled.'
    );
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await testFreeLLMAPIConnection();
      setStatus(res);
      if (res.is_running) {
        setActionMessage(`Connection successful! Latency: ${res.latency_ms ?? 0}ms.`);
      } else {
        setActionError(`Endpoint unreachable: ${res.status}`);
      }
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStartService = async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await startFreeLLMAPIService();
      setActionMessage(res.message);
      await loadStatus();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed starting process');
    } finally {
      setLoading(false);
    }
  };

  const handleStopService = async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await stopFreeLLMAPIService();
      setActionMessage(res.message);
      await loadStatus();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed stopping process');
    } finally {
      setLoading(false);
    }
  };

  const renderBadge = () => {
    if (!status) return null;
    switch (status.status) {
      case 'Running':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Running · Usable
          </span>
        );
      case 'Stopped':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Installed · Stopped
          </span>
        );
      case 'Starting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 border border-sky-200 text-sky-800">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
            Starting...
          </span>
        );
      case 'Configuration Required':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 border border-purple-200 text-purple-800">
            <AlertCircle size={12} />
            Configuration Required
          </span>
        );
      case 'Error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-800">
            <XCircle size={12} />
            Service Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 border border-stone-200 text-stone-700">
            <span className="w-2 h-2 rounded-full bg-stone-400" />
            Not Installed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="p-5 bg-white border border-[#DCD6C8] rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#162135] text-[#FAF8F2] flex items-center justify-center">
              <Cpu size={20} className="text-[#C05638]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="serif text-base font-semibold text-[#1C1917]">FreeLLMAPI Local Runtime</h3>
                {renderBadge()}
              </div>
              <p className="text-xs text-[#878074]">
                Private, local-first LLM routing and extraction runtime for Hyades
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadStatus}
              disabled={loading}
              className="p-2 bg-[#EFECE4] hover:bg-[#E5E0D5] text-[#1C1917] rounded-lg border border-[#DCD6C8] transition-colors cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={loading}
              className="px-3 py-1.5 bg-[#EFECE4] hover:bg-[#E5E0D5] text-[#1C1917] text-xs font-medium rounded-lg border border-[#DCD6C8] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Zap size={14} className="text-[#C05638]" />
              <span>Test Connection</span>
            </button>
          </div>
        </div>

        {/* Runtime Diagnostics Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#EFECE4] text-xs">
          <div className="p-3 bg-[#FAF8F2] rounded-lg border border-[#EFECE4]">
            <span className="text-[11px] text-[#878074] uppercase tracking-wider font-semibold block mb-0.5">
              Service Endpoint
            </span>
            <span className="font-mono text-[#1C1917] font-medium break-all">
              {status?.endpoint || 'http://localhost:3001'}
            </span>
          </div>
          <div className="p-3 bg-[#FAF8F2] rounded-lg border border-[#EFECE4]">
            <span className="text-[11px] text-[#878074] uppercase tracking-wider font-semibold block mb-0.5">
              Runtime Latency
            </span>
            <span className="font-mono text-[#1C1917] font-medium">
              {status?.latency_ms !== undefined ? `${status.latency_ms} ms` : 'Unreachable'}
            </span>
          </div>
          <div className="p-3 bg-[#FAF8F2] rounded-lg border border-[#EFECE4]">
            <span className="text-[11px] text-[#878074] uppercase tracking-wider font-semibold block mb-0.5">
              Detected Version
            </span>
            <span className="font-mono text-[#1C1917] font-medium">
              {status?.version ? `v${status.version}` : 'Not Detected'}
            </span>
          </div>
        </div>

        {/* Credentials / Setup Warning */}
        {status?.requires_credentials && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle size={14} className="text-[#C05638] shrink-0" />
              <span>Unified API Key Configuration Required</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              FreeLLMAPI requires an authenticated unified API key (<code className="font-mono text-[#C05638]">freellmapi-...</code>) for inference endpoints.
              Ensure FreeLLMAPI database is mounted at <code className="font-mono">/app/freellmapi/server/data/freeapi.db</code> or set <code className="font-mono">FREELLMAPI_API_KEY</code> in your environment.
            </p>
          </div>
        )}

        {/* Messages */}
        {actionMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}
        {actionError && (
          <div className="p-3 bg-[#FDF2E9] border border-[#FADBD8] text-[#9A3412] text-xs rounded-lg flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Controls and Auto-Start Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#EFECE4]">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={handleToggleAutoStart}
              className="w-4 h-4 rounded text-[#C05638] focus:ring-[#C05638] border-[#C9C2B0]"
            />
            <div>
              <span className="text-xs font-semibold text-[#1C1917] block">
                Start FreeLLMAPI automatically when Hyades opens
              </span>
              <span className="text-[11px] text-[#878074]">
                Probes local endpoint on application launch and initializes safely
              </span>
            </div>
          </label>

          <div className="flex items-center gap-2">
            {status?.status === 'Stopped' && (
              <button
                type="button"
                onClick={handleStartService}
                disabled={loading}
                className="px-3.5 py-1.5 bg-[#C05638] hover:bg-[#A9482E] text-[#FAF8F2] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Play size={13} />
                <span>Start Service</span>
              </button>
            )}
            {status?.is_running && (
              <button
                type="button"
                onClick={handleStopService}
                disabled={loading}
                className="px-3.5 py-1.5 bg-[#EFECE4] hover:bg-[#E5E0D5] text-[#1C1917] text-xs font-semibold rounded-lg border border-[#DCD6C8] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Square size={13} className="text-[#C05638]" />
                <span>Stop Service</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guided Installation & Setup Guide */}
      <div className="p-5 bg-white border border-[#DCD6C8] rounded-xl shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-[#162135]" />
          <h4 className="serif text-sm font-semibold text-[#1C1917]">
            Guided Setup & Installation Instructions
          </h4>
        </div>

        <p className="text-xs text-[#57534E] leading-relaxed">
          FreeLLMAPI is a unified, privacy-preserving proxy router that delivers OpenAI-compatible endpoints
          for offline, edge, and provider-backed language models without leaking private notes to untrusted destinations.
        </p>

        <div className="space-y-3">
          {/* Option A: Quickstart */}
          <div className="p-3.5 bg-[#FAF8F2] border border-[#EFECE4] rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C1917]">
                Option 1: Run Locally via Node.js
              </span>
              <span className="text-[10px] mono text-[#878074]">Port 3001</span>
            </div>
            <p className="text-[11px] text-[#878074]">
              Clone and start the service in your preferred terminal:
            </p>
            <pre className="bg-[#162135] text-[#FAF8F2] p-3 rounded-md text-[11px] font-mono overflow-x-auto select-all">
{`git clone https://github.com/freellmapi/freellmapi.git
cd freellmapi
npm install
npm run dev -w server`}
            </pre>
          </div>

          {/* Option B: Docker Container */}
          <div className="p-3.5 bg-[#FAF8F2] border border-[#EFECE4] rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1C1917]">
                Option 2: Run via Docker One-Liner
              </span>
              <span className="text-[10px] mono text-[#878074]">Isolated Sandbox</span>
            </div>
            <pre className="bg-[#162135] text-[#FAF8F2] p-3 rounded-md text-[11px] font-mono overflow-x-auto select-all">
{`docker run -d --name freellmapi -p 3001:3001 -e PORT=3001 ghcr.io/freellmapi/freellmapi:latest`}
            </pre>
          </div>

          {/* Option C: Verification & Troubleshooting */}
          <div className="p-3.5 bg-[#FAF8F2] border border-[#EFECE4] rounded-lg space-y-2">
            <span className="text-xs font-semibold text-[#1C1917] block">
              Verification & Health Check
            </span>
            <p className="text-[11px] text-[#878074] leading-relaxed">
              Once running, the endpoint provides an unauthenticated health probe at{' '}
              <code className="text-[#C05638] font-mono">http://localhost:3001/api/ping</code> returning{' '}
              <code className="text-[#1C1917] font-mono">{`{"status":"ok"}`}</code>. Hyades automatically binds
              to this endpoint to empower offline note generation and graph reasoning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};