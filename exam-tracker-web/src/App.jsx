import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  Clock, CalendarDays, Flame, Timer, BookOpen, Newspaper, HelpCircle,
  Link2, Plus, Trash2, Upload, Image as ImageIcon, CheckCircle2, Circle,
  X, Loader2, Play, Pause, RotateCcw, TrendingUp, Target, Sparkles,
  AlertCircle, Rocket, Radar, GraduationCap, ListChecks
} from 'lucide-react';

/* ===================== constants ===================== */

const SUBJECTS = ['quant', 'reasoning', 'english', 'ca'];
const SUBJECT_LABEL = { quant: 'Quant', reasoning: 'Reasoning', english: 'English', ca: 'Current Affairs' };
const SUBJECT_COLOR = { quant: '#22d3ee', reasoning: '#e879f9', english: '#34d399', ca: '#fbbf24' };
const SUBJECT_BG = { quant: 'bg-cyan-400', reasoning: 'bg-fuchsia-400', english: 'bg-emerald-400', ca: 'bg-amber-400' };
const SUBJECT_TEXT = { quant: 'text-cyan-400', reasoning: 'text-fuchsia-400', english: 'text-emerald-400', ca: 'text-amber-400' };
const SUBJECT_BORDER = { quant: 'border-cyan-400', reasoning: 'border-fuchsia-400', english: 'border-emerald-400', ca: 'border-amber-400' };

const DEFAULT_EXAMS = [
  { id: 'iob-lbo', name: 'IOB LBO', deadline: '2026-08-24', examDate: '', notes: 'Applications closing — TN / KA / MH / GJ only, local language required.' },
  { id: 'ibps-clerk', name: 'IBPS Clerk (CRP-CSA-XVI)', deadline: '2026-08-28', examDate: '', notes: 'Corrigendum issued — confirm final date on ibps.in.' },
  { id: 'sbi-clerk', name: 'SBI Clerk', deadline: '2026-08-31', examDate: '', notes: '' },
  { id: 'rrb-po', name: 'RRB PO', deadline: '', examDate: '', notes: 'Notification expected Sep–Oct 2026.' },
  { id: 'rrb-clerk', name: 'RRB Clerk', deadline: '', examDate: '', notes: 'Notification expected Sep–Oct 2026.' },
];

const DEFAULT_RESOURCES = [
  { id: 'r1', subject: 'quant', name: 'Harshal Agarwal — Zero to Infinity', platform: 'YouTube course', notes: 'Daily 1–1.5 hr lecture + practice-along' },
  { id: 'r2', subject: 'quant', name: 'Aashish Arora — Speed Maths', platform: 'yesofficer', notes: 'Practice PDFs' },
  { id: 'r3', subject: 'reasoning', name: 'Ankush Lamba — Reasoning', platform: 'yesofficer', notes: 'Video lecture + practice' },
  { id: 'r4', subject: 'english', name: 'Nimisha Bansal — Editorials & Grammar', platform: 'YouTube / yesofficer', notes: '' },
  { id: 'r5', subject: 'ca', name: 'Kapil Kathpal — Daily 8 AM class', platform: 'YouTube', notes: 'Plus daily PDFs' },
  { id: 'r6', subject: 'ca', name: 'Smartkeeda', platform: 'PDFs', notes: 'Daily current affairs' },
];

const MODEL = 'gemini-2.5-flash'; // set server-side in api/ask.js — this is just a label

/* ===================== storage helpers ===================== */

async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key);
    return res && res.value ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function saveKey(key, value) {
  try {
    const res = await window.storage.set(key, JSON.stringify(value));
    return !!res;
  } catch (e) {
    console.error('storage save failed for', key, e);
    return false;
  }
}

/* ===================== date helpers ===================== */

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  }
  return out;
}

/* ===================== Claude API helpers ===================== */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function resizeImageFile(file, maxDim = 1400, quality = 0.82) {
  // Downscales + re-encodes as JPEG before upload. Phone screenshots/photos can
  // easily be 3-8MB raw, which risks the serverless function's request-size
  // limit; this typically brings that down to a few hundred KB.
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) { reject(new Error('Could not process that image.')); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ base64: String(reader.result).split(',')[1], previewUrl: URL.createObjectURL(blob) });
          reader.onerror = () => reject(new Error('Could not read the processed image.'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not load that image.')); };
    img.src = objectUrl;
  });
}

async function callClaude(promptText, images = []) {
  const content = [];
  images.forEach((img) => {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  });
  content.push({ type: 'text', text: promptText });

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content }],
      }),
    });
    const rawText = await response.text().catch(() => '');
    let data = {};
    if (rawText) {
      try { data = JSON.parse(rawText); } catch (e) { data = {}; }
    }
    if (!response.ok) {
      const msg = (data && data.error && data.error.message)
        || (rawText ? `HTTP ${response.status}: ${rawText.replace(/\s+/g, ' ').slice(0, 180)}` : `Request failed — HTTP ${response.status}`);
      return { ok: false, error: msg };
    }
    const text = ((data && data.content) || []).map((b) => b.text || '').join('\n').trim();
    if (!text) return { ok: false, error: rawText ? `Empty response from the model. Raw: ${rawText.slice(0, 180)}` : 'Empty response from the model.' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Network request failed.' };
  }
}

function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Walk from the first '{' and track brace depth to find the true matching
    // close, instead of a greedy regex that grabs up to the LAST '}' in the
    // text — that breaks the moment the model adds any trailing sentence.
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (e2) { return null; }
        }
      }
    }
    return null;
  }
}

function friendlyErrorMessage(raw) {
  if (!raw) return 'Something went wrong — try again.';
  const parsed = parseJsonLoose(raw);
  if (parsed) {
    const resolved = parsed.resolved || parsed;
    const isLimitHit = (resolved && resolved.status === 'exceeded') || parsed.type === 'exceeded_limit';
    if (isLimitHit) {
      const resetsRaw = (resolved.limit && resolved.limit.resets_at) || parsed.resetsAt;
      let resetsText = '';
      if (resetsRaw) {
        const resetDate = typeof resetsRaw === 'number' ? new Date(resetsRaw * 1000) : new Date(resetsRaw);
        if (!isNaN(resetDate.getTime())) {
          resetsText = ` Resets around ${resetDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`;
        }
      }
      return `You've hit your Claude usage limit for this window.${resetsText} This is shared with regular chat — try again after it resets, or upgrade for more headroom.`;
    }
    if (parsed.error && parsed.error.message) return parsed.error.message;
  }
  if (/exceeded_limit|rate.?limit|429/i.test(raw)) {
    return "You've hit your Claude usage limit for this window — shared with regular chat. Try again after it resets.";
  }
  return raw.length > 220 ? raw.slice(0, 220) + '…' : raw;
}

/* ===================== small UI atoms ===================== */

function Panel({ children, className = '' }) {
  return (
    <div className={`relative rounded-xl border border-slate-800 bg-slate-900 p-5 ${className}`}>
      {children}
    </div>
  );
}

function GlowDot({ colorClass }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className={`absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-60 blur-sm`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colorClass}`} />
    </span>
  );
}

function SectionTitle({ icon: Icon, children, accent = 'text-cyan-400' }) {
  return (
    <h2 className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-slate-400 mb-4`}>
      <Icon className={`h-4 w-4 ${accent}`} />
      {children}
    </h2>
  );
}

function NeonButton({ children, onClick, type = 'button', variant = 'primary', disabled, className = '' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-slate-950 hover:from-cyan-400 hover:to-fuchsia-400',
    ghost: 'border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-400',
    danger: 'border border-rose-800 text-rose-400 hover:bg-rose-950',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-400 ${props.className || ''}`}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-400 ${props.className || ''}`}
    />
  );
}

function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-900 bg-slate-900 px-3 py-2 text-sm text-rose-300">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="break-words min-w-0">{message}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return <p className="py-6 text-center text-sm text-slate-600">{text}</p>;
}

function FormattedText({ text, className = '' }) {
  if (!text) return null;
  const lines = String(text).split(/\n+/).filter((l) => l.trim().length);
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length);
        return (
          <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j} className="font-semibold text-slate-200">{part.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

/* ===================== countdown bar ===================== */

function CountdownChip({ label, dateStr }) {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  const urgent = d <= 3;
  const passed = d < 0;
  return (
    <div className={`flex max-w-36 items-center gap-2 rounded-lg border px-3 py-1.5 sm:max-w-none ${urgent && !passed ? 'border-rose-500 animate-pulse' : 'border-slate-700'}`}>
      <span className="truncate font-mono text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`flex-shrink-0 font-mono text-lg font-bold tabular-nums ${passed ? 'text-slate-600' : urgent ? 'text-rose-400' : 'text-cyan-400'}`}>
        {passed ? 'closed' : `${d}d`}
      </span>
    </div>
  );
}

function CountdownBar({ exams }) {
  const withDeadline = exams.filter((e) => e.deadline && daysUntil(e.deadline) >= 0).sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  const withExamDate = exams.filter((e) => e.examDate && daysUntil(e.examDate) >= 0).sort((a, b) => daysUntil(a.examDate) - daysUntil(b.examDate));
  const nearestDeadline = withDeadline[0];
  const nearestExam = withExamDate[0];

  return (
    <div className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-fuchsia-400" />
          <span className="font-mono text-sm font-bold uppercase tracking-widest text-slate-100">Mission Control</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nearestDeadline ? <CountdownChip label={`Apply · ${nearestDeadline.name}`} dateStr={nearestDeadline.deadline} /> : null}
          {nearestExam ? <CountdownChip label={`Exam · ${nearestExam.name}`} dateStr={nearestExam.examDate} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ===================== tab nav ===================== */

const TABS = [
  { id: 'today', label: 'Today', icon: Rocket },
  { id: 'exams', label: 'Exams', icon: CalendarDays },
  { id: 'mocks', label: 'Mocks', icon: Target },
  { id: 'drills', label: 'Drills', icon: Timer },
  { id: 'ca', label: 'Current Affairs', icon: Newspaper },
  { id: 'english', label: 'English', icon: BookOpen },
  { id: 'doubts', label: 'Doubts', icon: HelpCircle },
  { id: 'resources', label: 'Resources', icon: GraduationCap },
  { id: 'materials', label: 'Materials', icon: Link2 },
];

function TabNav({ active, onChange }) {
  return (
    <div className="mx-auto max-w-6xl overflow-x-auto px-4 pt-4">
      <div className="flex gap-1.5 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-mono text-xs uppercase tracking-wide transition ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-slate-950 font-bold'
                  : 'border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== image uploader (shared) ===================== */

function ImageUploader({ files, setFiles, maxFiles = 3 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setBusy(true);
    const room = Math.max(0, maxFiles - files.length);
    const toAdd = selected.slice(0, room);
    const withData = [];
    for (const file of toAdd) {
      try {
        const { base64, previewUrl } = await resizeImageFile(file);
        withData.push({ name: file.name, mediaType: 'image/jpeg', data: base64, previewUrl });
      } catch (e) {
        // skip unreadable file
      }
    }
    setFiles([...files, ...withData]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (idx) => setFiles(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {files.map((f, idx) => (
          <div key={idx} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-700">
            <img src={f.previewUrl} alt={f.name} className="h-full w-full object-cover" />
            <button
              onClick={() => removeAt(idx)}
              className="absolute right-0.5 top-0.5 rounded-full bg-slate-950 p-0.5 text-slate-300 hover:text-rose-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length < maxFiles && (
          <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-cyan-400 hover:text-cyan-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="font-mono text-xs">{files.length}/{maxFiles}</span>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePick} />
          </label>
        )}
      </div>
      <p className="mt-1.5 font-mono text-xs text-slate-600">Up to {maxFiles} screenshots — shoot a scrolling result page in parts.</p>
    </div>
  );
}

/* ===================== charts ===================== */

function ActivityChart({ dailyLogs }) {
  const dates = lastNDates(14);
  const data = dates.map((d) => {
    const entry = dailyLogs[d] || {};
    const row = { date: d.slice(5) };
    SUBJECTS.forEach((s) => { row[s] = entry[s] ? entry[s].reduce((a, b) => a + (b.minutes || 0), 0) : 0; });
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} label={{ value: 'min', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => SUBJECT_LABEL[v] || v} />
        {SUBJECTS.map((s) => (
          <Bar key={s} dataKey={s} stackId="a" fill={SUBJECT_COLOR[s]} radius={s === 'ca' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MockTrendChart({ mocks, cutoff }) {
  const data = [...mocks].sort((a, b) => a.date.localeCompare(b.date)).map((m, i) => ({
    label: `#${i + 1}`,
    score: m.totalMarks,
  }));
  if (!data.length) return <EmptyState text="Log a mock to see your trend line here." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} />
        {cutoff ? <ReferenceLine y={cutoff} stroke="#fbbf24" strokeDasharray="6 4" label={{ value: 'cutoff', fill: '#fbbf24', fontSize: 10, position: 'insideTopLeft' }} /> : null}
        <Line type="monotone" dataKey="score" stroke="#e879f9" strokeWidth={3} dot={{ r: 4, fill: '#e879f9' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PaceChart({ drills }) {
  const data = [...drills].sort((a, b) => a.date.localeCompare(b.date)).slice(-20).map((d) => ({
    label: d.date.slice(5),
    pace: d.timeSeconds > 0 ? +((d.questions / (d.timeSeconds / 60)).toFixed(2)) : 0,
    subject: d.subject,
  }));
  if (!data.length) return <EmptyState text="Log a timed drill to see your pace trend here." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} label={{ value: 'q/min', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }} />
        <Line type="monotone" dataKey="pace" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, fill: '#22d3ee' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ===================== TODAY TAB ===================== */

function TodayTab({ exams, dailyLogs, setDailyLogs, mocks, drills, caEntries, editorialEntries }) {
  const [subject, setSubject] = useState('quant');
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState('');
  const today = todayISO();
  const todayEntry = dailyLogs[today] || {};

  const streak = (() => {
    let count = 0;
    let cursor = new Date();
    while (true) {
      const key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
      const has = dailyLogs[key] && SUBJECTS.some((s) => (dailyLogs[key][s] || []).length > 0);
      if (!has) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  })();

  const logStudy = () => {
    if (!topic.trim() || !minutes) return;
    const entry = { ...dailyLogs };
    if (!entry[today]) entry[today] = {};
    if (!entry[today][subject]) entry[today][subject] = [];
    entry[today][subject] = [...entry[today][subject], { topic: topic.trim(), minutes: Number(minutes) }];
    setDailyLogs(entry);
    setTopic('');
    setMinutes('');
  };

  const checklist = [
    { key: 'quant', label: 'Quant practice logged', done: (todayEntry.quant || []).length > 0 },
    { key: 'reasoning', label: 'Reasoning practice logged', done: (todayEntry.reasoning || []).length > 0 },
    { key: 'english', label: 'English / editorial logged', done: (todayEntry.english || []).length > 0 || editorialEntries.some((e) => e.date === today) },
    { key: 'ca', label: 'Current affairs logged', done: (todayEntry.ca || []).length > 0 || caEntries.some((e) => e.date === today) },
    { key: 'mock', label: 'Mock or drill given', done: mocks.some((m) => m.date === today) || drills.some((d) => d.date === today) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="flex items-center gap-3">
          <div className="rounded-lg bg-orange-950 p-2.5"><Flame className="h-6 w-6 text-orange-400" /></div>
          <div>
            <p className="font-mono text-2xl font-bold text-slate-100">{streak}</p>
            <p className="font-mono text-xs uppercase tracking-wider text-slate-500">day streak</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-950 p-2.5"><Target className="h-6 w-6 text-cyan-400" /></div>
          <div>
            <p className="font-mono text-2xl font-bold text-slate-100">{mocks.length}</p>
            <p className="font-mono text-xs uppercase tracking-wider text-slate-500">mocks logged</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3">
          <div className="rounded-lg bg-fuchsia-950 p-2.5"><ListChecks className="h-6 w-6 text-fuchsia-400" /></div>
          <div>
            <p className="font-mono text-2xl font-bold text-slate-100">{checklist.filter((c) => c.done).length}/{checklist.length}</p>
            <p className="font-mono text-xs uppercase tracking-wider text-slate-500">today's checklist</p>
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle icon={Sparkles} accent="text-fuchsia-400">Log what you studied</SectionTitle>
        <div className="flex flex-wrap gap-2 mb-3">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${subject === s ? `${SUBJECT_BG[s]} text-slate-950` : 'border border-slate-700 text-slate-400'}`}
            >
              {SUBJECT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <TextInput placeholder="Topic — e.g. seating arrangement, tenses, SI-CI" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <TextInput type="number" placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <NeonButton onClick={logStudy}><Plus className="h-4 w-4" />Log</NeonButton>
        </div>
      </Panel>

      <Panel>
        <SectionTitle icon={ListChecks} accent="text-emerald-400">Today's checklist</SectionTitle>
        <div className="space-y-2">
          {checklist.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-sm">
              {c.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-700" />}
              <span className={c.done ? 'text-slate-300' : 'text-slate-500'}>{c.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle icon={TrendingUp} accent="text-cyan-400">Last 14 days</SectionTitle>
        <ActivityChart dailyLogs={dailyLogs} />
      </Panel>
    </div>
  );
}

/* ===================== EXAMS TAB ===================== */

function ExamsTab({ exams, setExams }) {
  const update = (id, field, value) => setExams(exams.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  const remove = (id) => setExams(exams.filter((e) => e.id !== id));
  const add = () => setExams([...exams, { id: 'exam-' + Date.now(), name: 'New exam', deadline: '', examDate: '', notes: '' }]);

  const sorted = [...exams].sort((a, b) => {
    const da = daysUntil(a.deadline) ?? 9999;
    const db = daysUntil(b.deadline) ?? 9999;
    return da - db;
  });

  return (
    <div className="space-y-4">
      {sorted.map((e) => {
        const d = daysUntil(e.deadline);
        return (
          <Panel key={e.id}>
            <div className="flex items-start justify-between gap-3">
              <TextInput value={e.name} onChange={(ev) => update(e.id, 'name', ev.target.value)} className="mb-3 text-base font-semibold" />
              <button onClick={() => remove(e.id)} className="mt-1 text-slate-600 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Application deadline</label>
                <TextInput type="date" value={e.deadline} onChange={(ev) => update(e.id, 'deadline', ev.target.value)} />
                {d !== null && <p className={`mt-1 font-mono text-xs ${d <= 3 ? 'text-rose-400' : 'text-slate-500'}`}>{d < 0 ? 'closed' : `${d} days left`}</p>}
              </div>
              <div>
                <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Exam date</label>
                <TextInput type="date" value={e.examDate} onChange={(ev) => update(e.id, 'examDate', ev.target.value)} />
              </div>
              <div>
                <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Notes</label>
                <TextInput value={e.notes} onChange={(ev) => update(e.id, 'notes', ev.target.value)} placeholder="e.g. eligibility, state restriction" />
              </div>
            </div>
          </Panel>
        );
      })}
      <NeonButton variant="ghost" onClick={add}><Plus className="h-4 w-4" />Add exam</NeonButton>
    </div>
  );
}

/* ===================== MOCKS TAB ===================== */

function MocksTab({ mocks, setMocks }) {
  const blankSection = { attempted: '', correct: '', total: '', unseen: '' };
  const [form, setForm] = useState({
    date: todayISO(), platform: 'Guidely', totalMarks: '',
    quant: { ...blankSection }, reasoning: { ...blankSection }, english: { ...blankSection },
  });
  const [images, setImages] = useState([]);
  const [cutoff, setCutoff] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateSection = (sec, field, val) => setForm({ ...form, [sec]: { ...form[sec], [field]: val } });

  const runAnalysis = async () => {
    if (!images.length) { setError('Add at least one screenshot to analyze.'); return; }
    setLoading(true);
    setError('');
    const prompt = `You are helping a banking-exam aspirant (IBPS/SBI/RRB prelims level) read their mock test result screenshots.
Look at the attached screenshot(s) of a mock test result/analysis page and respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{"overallSummary":"2-3 sentence summary of how they did","sectionBreakdown":[{"section":"Quant","observation":"1-2 sentences: accuracy vs speed, weak topics if visible"}],"speedVsAccuracy":"1-2 sentences on whether the bottleneck looks like speed or accuracy","nextAction":"one concrete, specific thing to practice before the next mock"}
Cover whichever sections (Quant/Reasoning/English) are visible in the screenshots. Keep it concrete and specific to numbers you can actually see — do not invent figures.`;
    const res = await callClaude(prompt, images);
    setLoading(false);
    if (!res.ok) { setError(friendlyErrorMessage(res.error)); return; }
    const parsed = parseJsonLoose(res.text);
    const entry = {
      id: 'mock-' + Date.now(),
      date: form.date,
      platform: form.platform,
      totalMarks: Number(form.totalMarks) || 0,
      sections: { quant: form.quant, reasoning: form.reasoning, english: form.english },
      analysis: parsed || { overallSummary: res.text, sectionBreakdown: [], speedVsAccuracy: '', nextAction: '' },
    };
    setMocks([entry, ...mocks]);
    setForm({ date: todayISO(), platform: 'Guidely', totalMarks: '', quant: { ...blankSection }, reasoning: { ...blankSection }, english: { ...blankSection } });
    setImages([]);
  };

  const logWithoutAnalysis = () => {
    const entry = {
      id: 'mock-' + Date.now(), date: form.date, platform: form.platform, totalMarks: Number(form.totalMarks) || 0,
      sections: { quant: form.quant, reasoning: form.reasoning, english: form.english }, analysis: null,
    };
    setMocks([entry, ...mocks]);
    setForm({ date: todayISO(), platform: 'Guidely', totalMarks: '', quant: { ...blankSection }, reasoning: { ...blankSection }, english: { ...blankSection } });
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle icon={Target} accent="text-fuchsia-400">Log a mock</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Date</label>
            <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Platform</label>
            <TextInput value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} placeholder="Guidely / Oliveboard / Smartkeeda" />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-500">Total marks</label>
            <TextInput type="number" value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} />
          </div>
        </div>

        {['quant', 'reasoning', 'english'].map((sec) => (
          <div key={sec} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-center">
            <span className={`font-mono text-xs font-semibold ${SUBJECT_TEXT[sec]}`}>{SUBJECT_LABEL[sec]}</span>
            <TextInput type="number" placeholder="Attempted" value={form[sec].attempted} onChange={(e) => updateSection(sec, 'attempted', e.target.value)} />
            <TextInput type="number" placeholder="Correct" value={form[sec].correct} onChange={(e) => updateSection(sec, 'correct', e.target.value)} />
            <TextInput type="number" placeholder="Unseen" value={form[sec].unseen} onChange={(e) => updateSection(sec, 'unseen', e.target.value)} />
          </div>
        ))}

        <div className="my-4 border-t border-slate-800 pt-4">
          <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-slate-500">Result screenshots (optional — for AI analysis)</label>
          <ImageUploader files={images} setFiles={setImages} maxFiles={3} />
        </div>

        <ErrorNote message={error} />

        <div className="mt-3 flex flex-wrap gap-2">
          <NeonButton onClick={runAnalysis} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Analyzing…' : 'Save + analyze screenshots'}
          </NeonButton>
          <NeonButton variant="ghost" onClick={logWithoutAnalysis}>Save without analysis</NeonButton>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle icon={TrendingUp} accent="text-cyan-400">Score trend</SectionTitle>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase text-slate-500">Cutoff</span>
            <TextInput type="number" value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} className="w-16 py-1 text-xs" />
          </div>
        </div>
        <MockTrendChart mocks={mocks} cutoff={cutoff} />
      </Panel>

      <div>
        <SectionTitle icon={Target} accent="text-fuchsia-400">History</SectionTitle>
        {!mocks.length && <EmptyState text="No mocks logged yet." />}
        <div className="space-y-3">
          {mocks.map((m) => (
            <Panel key={m.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-slate-200">{m.platform} — {fmtDate(m.date)}</span>
                <span className="font-mono text-lg font-bold text-fuchsia-400">{m.totalMarks}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-400">
                {['quant', 'reasoning', 'english'].map((sec) => (
                  m.sections[sec] && m.sections[sec].attempted ? (
                    <span key={sec}><span className={SUBJECT_TEXT[sec]}>{SUBJECT_LABEL[sec]}</span>: {m.sections[sec].correct}/{m.sections[sec].attempted} correct, {m.sections[sec].unseen || 0} unseen</span>
                  ) : null
                ))}
              </div>
              {m.analysis && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <p className="text-slate-300">{m.analysis.overallSummary}</p>
                  {(m.analysis.sectionBreakdown || []).map((sb, i) => (
                    <p key={i} className="text-slate-400"><span className="font-semibold text-slate-300">{sb.section}: </span>{sb.observation}</p>
                  ))}
                  {m.analysis.speedVsAccuracy && <p className="text-slate-400"><span className="font-semibold text-slate-300">Speed vs accuracy: </span>{m.analysis.speedVsAccuracy}</p>}
                  {m.analysis.nextAction && <p className="text-emerald-400"><span className="font-semibold">Next: </span>{m.analysis.nextAction}</p>}
                </div>
              )}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== DRILLS TAB ===================== */

function DrillsTab({ drills, setDrills }) {
  const [subject, setSubject] = useState('quant');
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState('');
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const start = () => {
    startRef.current = Date.now() - elapsedMs;
    intervalRef.current = setInterval(() => setElapsedMs(Date.now() - startRef.current), 100);
    setRunning(true);
  };
  const pause = () => { clearInterval(intervalRef.current); setRunning(false); };
  const reset = () => { clearInterval(intervalRef.current); setRunning(false); setElapsedMs(0); };

  const mmss = (ms) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const logDrill = () => {
    if (!questions || elapsedMs === 0) return;
    const entry = {
      id: 'drill-' + Date.now(), date: todayISO(), subject, topic: topic.trim() || SUBJECT_LABEL[subject],
      questions: Number(questions), timeSeconds: Math.round(elapsedMs / 1000),
    };
    setDrills([entry, ...drills]);
    setTopic(''); setQuestions(''); reset();
  };

  return (
    <div className="space-y-5">
      <Panel className="text-center">
        <SectionTitle icon={Timer} accent="text-cyan-400">Speed drill stopwatch</SectionTitle>
        <p className="mb-4 font-mono text-4xl sm:text-5xl font-bold tabular-nums text-cyan-400">{mmss(elapsedMs)}</p>
        <div className="mb-4 flex justify-center gap-2">
          {!running ? (
            <NeonButton onClick={start}><Play className="h-4 w-4" />{elapsedMs > 0 ? 'Resume' : 'Start'}</NeonButton>
          ) : (
            <NeonButton onClick={pause} variant="ghost"><Pause className="h-4 w-4" />Pause</NeonButton>
          )}
          <NeonButton variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</NeonButton>
        </div>
        <div className="mx-auto grid max-w-md gap-2 sm:grid-cols-3">
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
          </select>
          <TextInput placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <TextInput type="number" placeholder="# questions" value={questions} onChange={(e) => setQuestions(e.target.value)} />
        </div>
        <NeonButton className="mt-3" onClick={logDrill} disabled={elapsedMs === 0 || !questions}><Plus className="h-4 w-4" />Log this set</NeonButton>
      </Panel>

      <Panel>
        <SectionTitle icon={TrendingUp} accent="text-emerald-400">Pace over time</SectionTitle>
        <PaceChart drills={drills} />
      </Panel>

      <div>
        <SectionTitle icon={Timer} accent="text-cyan-400">History</SectionTitle>
        {!drills.length && <EmptyState text="No drills logged yet — run the stopwatch above." />}
        <div className="space-y-2">
          {drills.slice(0, 15).map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <GlowDot colorClass={SUBJECT_BG[d.subject]} />
                <span className="text-slate-300">{d.topic}</span>
              </div>
              <span className="font-mono text-xs text-slate-500">{d.questions}q in {mmss(d.timeSeconds * 1000)} · {(d.questions / (d.timeSeconds / 60)).toFixed(1)} q/min</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== CURRENT AFFAIRS TAB ===================== */

function CATab({ caEntries, setCaEntries }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openQuiz, setOpenQuiz] = useState(null);

  const generate = async () => {
    if (!text.trim() && !images.length) { setError('Paste today\'s CA text or upload the PDF/screenshot.'); return; }
    setLoading(true); setError('');
    const prompt = `You are preparing daily current-affairs material for an Indian banking-exam aspirant (IBPS/SBI prelims level).
${text.trim() ? `Source text:\n${text.trim()}\n` : 'Read the attached screenshot(s) of current affairs content.'}
Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape. Never use LaTeX or math delimiters (no \\text, \\frac, $...$, or backslash commands) anywhere in the JSON — write any numbers, fractions, or formulas in plain text instead (e.g. "1/2 kg = 500 grams", "x = 5"), since backslashes break JSON parsing:
{"summary":"3-4 sentence digest of the most exam-relevant points","keyPoints":["short fact 1","short fact 2","..."],"quiz":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"one line"}]}
Write 5 quiz questions, exam-style (who/what/when/scheme names/appointments/numbers), based only on the given content.`;
    const res = await callClaude(prompt, images);
    setLoading(false);
    if (!res.ok) { setError(friendlyErrorMessage(res.error)); return; }
    const parsed = parseJsonLoose(res.text);
    if (!parsed) { setError('Could not parse the response as JSON. Raw: ' + res.text.slice(0, 250)); return; }
    const entry = { id: 'ca-' + Date.now(), date: todayISO(), sourceText: text.trim().slice(0, 400), ...parsed };
    setCaEntries([entry, ...caEntries]);
    setText(''); setImages([]);
  };

  const streakCA = (() => {
    let count = 0, cursor = new Date();
    while (true) {
      const key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
      if (!caEntries.some((e) => e.date === key)) break;
      count += 1; cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  })();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-amber-400" />
        <span className="font-mono text-sm text-slate-300">{streakCA}-day CA streak</span>
      </div>

      <Panel>
        <SectionTitle icon={Newspaper} accent="text-amber-400">New digest + quiz</SectionTitle>
        <TextArea rows={5} placeholder="Paste today's current affairs text here (Smartkeeda PDF text, Kapil Kathpal notes, etc.)" value={text} onChange={(e) => setText(e.target.value)} className="mb-3" />
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-slate-500">Or upload a screenshot instead</label>
        <ImageUploader files={images} setFiles={setImages} maxFiles={3} />
        <ErrorNote message={error} />
        <NeonButton className="mt-3" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Generating…' : 'Generate digest + quiz'}
        </NeonButton>
      </Panel>

      <div>
        <SectionTitle icon={Newspaper} accent="text-amber-400">History</SectionTitle>
        {!caEntries.length && <EmptyState text="No current affairs entries yet." />}
        <div className="space-y-3">
          {caEntries.map((e) => (
            <Panel key={e.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{fmtDate(e.date)}</span>
                <button onClick={() => setOpenQuiz(openQuiz === e.id ? null : e.id)} className="font-mono text-xs text-amber-400 hover:underline">
                  {openQuiz === e.id ? 'hide quiz' : `quiz (${(e.quiz || []).length})`}
                </button>
              </div>
              <p className="mb-2 text-sm text-slate-300">{e.summary}</p>
              <ul className="mb-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
                {(e.keyPoints || []).map((k, i) => <li key={i}>{k}</li>)}
              </ul>
              {openQuiz === e.id && <QuizBlock quiz={e.quiz || []} />}
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizBlock({ quiz, onPracticeMore, practiceMoreLoading, practiceMoreError }) {
  const [answers, setAnswers] = useState({});
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(([i, picked]) => picked === quiz[Number(i)]?.correctIndex).length;
  const allAnswered = quiz.length > 0 && answeredCount === quiz.length;
  const scorePct = allAnswered ? correctCount / quiz.length : 0;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
      {quiz.map((q, i) => (
        <div key={i}>
          <p className="mb-1.5 text-sm text-slate-200">{i + 1}. {q.question}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {q.options.map((opt, oi) => {
              const picked = answers[i];
              const isCorrect = oi === q.correctIndex;
              const show = picked !== undefined;
              let cls = 'border-slate-700 text-slate-300';
              if (show && isCorrect) cls = 'border-emerald-500 text-emerald-400';
              else if (show && picked === oi) cls = 'border-rose-500 text-rose-400';
              return (
                <button key={oi} onClick={() => setAnswers({ ...answers, [i]: oi })} className={`rounded-lg border px-3 py-1.5 text-left text-xs ${cls}`}>
                  {opt}
                </button>
              );
            })}
          </div>
          {answers[i] !== undefined && q.explanation && <FormattedText text={q.explanation} className="mt-1.5 text-xs text-slate-400" />}
        </div>
      ))}
      {allAnswered && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
          <span className={`font-mono text-sm font-bold ${scorePct === 1 ? 'text-emerald-400' : scorePct < 0.6 ? 'text-rose-400' : 'text-amber-400'}`}>
            {correctCount}/{quiz.length} correct
          </span>
          {onPracticeMore && (
            <NeonButton variant="ghost" onClick={onPracticeMore} disabled={practiceMoreLoading}>
              {practiceMoreLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {practiceMoreLoading ? 'Generating…' : scorePct < 0.6 ? 'Drill this more' : 'Practice a few more'}
            </NeonButton>
          )}
        </div>
      )}
      {practiceMoreError && <ErrorNote message={practiceMoreError} />}
    </div>
  );
}

/* ===================== ENGLISH / EDITORIAL TAB ===================== */

function EnglishTab({ editorialEntries, setEditorialEntries, descriptiveEntries, setDescriptiveEntries }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [dwPrompt, setDwPrompt] = useState('');
  const [dwResponse, setDwResponse] = useState('');
  const [dwTarget, setDwTarget] = useState(150);
  const [dwImages, setDwImages] = useState([]);
  const [dwLoading, setDwLoading] = useState(false);
  const [dwError, setDwError] = useState('');
  const dwWordCount = dwResponse.trim() ? dwResponse.trim().split(/\s+/).filter(Boolean).length : 0;

  const analyze = async () => {
    if (!text.trim() && !images.length) { setError('Paste the editorial text or upload a screenshot.'); return; }
    setLoading(true); setError('');
    const prompt = `You are an English coach for an Indian banking-exam aspirant (prelims + mains level).
${text.trim() ? `Editorial text:\n${text.trim()}\n` : 'Read the attached screenshot(s) of an editorial.'}
Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape. Never use LaTeX or math delimiters (no \\text, \\frac, $...$, or backslash commands) anywhere in the JSON — write any numbers, fractions, or formulas in plain text instead (e.g. "1/2 kg = 500 grams", "x = 5"), since backslashes break JSON parsing:
{"precis":"a short precis in 60-80 words","vocab":[{"word":"...","meaning":"simple one-line meaning","usage":"short example sentence"}],"grammar":["one grammar/structure point actually used in this piece, explained in one line","..."],"predictedVocab":["word likely to appear in upcoming exam vocab-based questions based on this piece's theme","..."]}
Pick 6-8 genuinely hard/exam-relevant words from the piece for "vocab". Give 3-4 "grammar" points. Give 5 "predictedVocab" words related to the piece's theme, not necessarily in the text itself.`;
    const res = await callClaude(prompt, images);
    setLoading(false);
    if (!res.ok) { setError(friendlyErrorMessage(res.error)); return; }
    const parsed = parseJsonLoose(res.text);
    if (!parsed) { setError('Could not parse the response as JSON. Raw: ' + res.text.slice(0, 250)); return; }
    const entry = { id: 'edit-' + Date.now(), date: todayISO(), sourceText: text.trim().slice(0, 400), ...parsed };
    setEditorialEntries([entry, ...editorialEntries]);
    setText(''); setImages([]);
  };

  const evaluateDescriptive = async () => {
    if (!dwResponse.trim() && !dwImages.length) { setDwError('Write or upload your essay/letter response first.'); return; }
    setDwLoading(true); setDwError('');
    const prompt = `You are a strict mains-level evaluator for Indian banking exam descriptive English (essay or letter writing — SBI PO / IBPS PO / IOB LBO style).
Prompt given to the candidate: "${dwPrompt.trim() || '(not specified — infer the likely prompt type from the response)'}"
Target length: around ${dwTarget} words.
${dwResponse.trim() ? `Candidate's response:\n${dwResponse.trim()}\n` : "Read the candidate's response from the attached screenshot(s)."}
Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape. Never use LaTeX or math delimiters (no \\text, \\frac, $...$, or backslash commands) anywhere in the JSON — write any numbers, fractions, or formulas in plain text instead (e.g. "1/2 kg = 500 grams", "x = 5"), since backslashes break JSON parsing:
{"score":7,"structure":"1-2 sentences on organization, paragraphing, and flow","language":"1-2 sentences on grammar, vocabulary, and tone","contentRelevance":"1-2 sentences on how well it actually answers the given prompt","improvements":["one concrete, specific fix","another concrete fix","a third concrete fix"]}
Score out of 10 the way a real mains examiner would — do not inflate it just to be encouraging.`;
    const res = await callClaude(prompt, dwImages);
    setDwLoading(false);
    if (!res.ok) { setDwError(friendlyErrorMessage(res.error)); return; }
    const parsed = parseJsonLoose(res.text);
    if (!parsed) { setDwError('Could not parse the response as JSON. Raw: ' + res.text.slice(0, 250)); return; }
    const entry = { id: 'dw-' + Date.now(), date: todayISO(), prompt: dwPrompt.trim(), wordCount: dwWordCount, target: dwTarget, ...parsed };
    setDescriptiveEntries([entry, ...descriptiveEntries]);
    setDwPrompt(''); setDwResponse(''); setDwImages([]);
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle icon={BookOpen} accent="text-emerald-400">Analyze an editorial</SectionTitle>
        <TextArea rows={6} placeholder="Paste today's editorial text (The Hindu, etc.)" value={text} onChange={(e) => setText(e.target.value)} className="mb-3" />
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-slate-500">Or upload a screenshot instead</label>
        <ImageUploader files={images} setFiles={setImages} maxFiles={3} />
        <ErrorNote message={error} />
        <NeonButton className="mt-3" onClick={analyze} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Analyzing…' : 'Analyze editorial'}
        </NeonButton>
      </Panel>

      <div>
        <SectionTitle icon={BookOpen} accent="text-emerald-400">History</SectionTitle>
        {!editorialEntries.length && <EmptyState text="No editorials analyzed yet." />}
        <div className="space-y-3">
          {editorialEntries.map((e) => (
            <Panel key={e.id}>
              <p className="mb-2 font-mono text-xs text-slate-500">{fmtDate(e.date)}</p>
              <p className="mb-3 text-sm italic text-slate-300">{e.precis}</p>
              <div className="mb-3">
                <p className="mb-1 font-mono text-xs uppercase tracking-wider text-emerald-400">Vocab</p>
                <div className="space-y-1">
                  {(e.vocab || []).map((v, i) => (
                    <p key={i} className="text-xs text-slate-400"><span className="font-semibold text-slate-200">{v.word}</span> — {v.meaning} <span className="italic text-slate-600">({v.usage})</span></p>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <p className="mb-1 font-mono text-xs uppercase tracking-wider text-cyan-400">Grammar</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-400">
                  {(e.grammar || []).map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-wider text-fuchsia-400">Predicted vocab to remember</p>
                <div className="flex flex-wrap gap-1.5">
                  {(e.predictedVocab || []).map((w, i) => (
                    <span key={i} className="rounded-full border border-fuchsia-800 px-2 py-0.5 text-xs text-fuchsia-300">{w}</span>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-5">
        <Panel>
          <SectionTitle icon={Sparkles} accent="text-fuchsia-400">Descriptive writing practice — essay / letter</SectionTitle>
          <p className="mb-3 text-xs text-slate-500">For mains-level exams (IOB LBO, RRB PO) that include a descriptive English paper. Write against a prompt, get an examiner-style score instead of guessing.</p>
          <TextInput placeholder="Prompt — e.g. 'Write a letter to your branch manager requesting a duplicate passbook'" value={dwPrompt} onChange={(e) => setDwPrompt(e.target.value)} className="mb-3" />
          <TextArea rows={7} placeholder="Write your essay or letter here…" value={dwResponse} onChange={(e) => setDwResponse(e.target.value)} className="mb-2" />
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-slate-500">
            <span className={dwWordCount > 0 && dwTarget && Math.abs(dwWordCount - dwTarget) > dwTarget * 0.3 ? 'text-amber-400' : ''}>{dwWordCount} words</span>
            <span className="flex items-center gap-1.5">Target <TextInput type="number" value={dwTarget} onChange={(e) => setDwTarget(Number(e.target.value))} className="w-16 py-1" /> words</span>
          </div>
          <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-slate-500">Or upload a photo of your handwritten answer</label>
          <ImageUploader files={dwImages} setFiles={setDwImages} maxFiles={3} />
          <ErrorNote message={dwError} />
          <NeonButton className="mt-3" onClick={evaluateDescriptive} disabled={dwLoading}>
            {dwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {dwLoading ? 'Evaluating…' : 'Get examiner-style evaluation'}
          </NeonButton>
        </Panel>

        <div className="mt-4 space-y-3">
          {descriptiveEntries.map((d) => (
            <Panel key={d.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{fmtDate(d.date)} · {d.wordCount} words{d.prompt ? ` · ${d.prompt}` : ''}</span>
                <span className="font-mono text-lg font-bold text-fuchsia-400">{d.score}/10</span>
              </div>
              <p className="mb-1 text-xs text-slate-400"><span className="font-semibold text-slate-300">Structure: </span>{d.structure}</p>
              <p className="mb-1 text-xs text-slate-400"><span className="font-semibold text-slate-300">Language: </span>{d.language}</p>
              <p className="mb-2 text-xs text-slate-400"><span className="font-semibold text-slate-300">Relevance: </span>{d.contentRelevance}</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-emerald-400">
                {(d.improvements || []).map((imp, i) => <li key={i}>{imp}</li>)}
              </ul>
            </Panel>
          ))}
          {!descriptiveEntries.length && <EmptyState text="No descriptive writing evaluated yet." />}
        </div>
      </div>
    </div>
  );
}

/* ===================== DOUBTS TAB ===================== */

function DoubtsTab({ doubts, setDoubts }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [practiceMoreId, setPracticeMoreId] = useState(null);
  const [practiceMoreError, setPracticeMoreError] = useState('');
  const [practiceMoreErrorId, setPracticeMoreErrorId] = useState(null);

  const solve = async () => {
    if (!text.trim() && !images.length) { setError('Type the question or upload a screenshot of it.'); return; }
    setLoading(true); setError('');
    const prompt = `You are a patient tutor for an Indian banking-exam aspirant (quant/reasoning/English prelims level).
${text.trim() ? `Question:\n${text.trim()}\n` : 'Read the attached screenshot(s) of a question.'}
Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape. Never use LaTeX or math delimiters (no \\text, \\frac, $...$, or backslash commands) anywhere in the JSON — write any numbers, fractions, or formulas in plain text instead (e.g. "1/2 kg = 500 grams", "x = 5"), since backslashes break JSON parsing:
{"answer":"the final answer, short","explanation":"a clear step-by-step explanation a beginner can follow","similarQuestions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"a short but complete step-by-step walkthrough — say what is actually being bought and sold in plain words first, then the calculation with real numbers, not just a bare formula substitution someone would need to already know to follow"}]}
Give exactly 3 similar practice MCQs at the same difficulty and same concept.`;
    const res = await callClaude(prompt, images);
    setLoading(false);
    if (!res.ok) { setError(friendlyErrorMessage(res.error)); return; }
    const parsed = parseJsonLoose(res.text);
    if (!parsed) { setError('Could not parse the response as JSON. Raw: ' + res.text.slice(0, 250)); return; }
    const entry = { id: 'doubt-' + Date.now(), date: todayISO(), question: text.trim().slice(0, 300) || '(from screenshot)', ...parsed };
    setDoubts([entry, ...doubts]);
    setText(''); setImages([]);
  };

  const practiceMore = async (entry) => {
    setPracticeMoreId(entry.id);
    setPracticeMoreError('');
    setPracticeMoreErrorId(null);
    const already = (entry.similarQuestions || []).map((q) => q.question).join(' | ') || 'none yet';
    const prompt = `You are generating more MCQ practice for an Indian banking-exam aspirant, on the exact same concept as this doubt.
Original question: ${entry.question}
Correct answer: ${entry.answer}
Already given (write different ones, same concept, do not repeat these): ${already}
Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape. Never use LaTeX or math delimiters (no \\text, \\frac, $...$, or backslash commands) anywhere in the JSON — write any numbers, fractions, or formulas in plain text instead (e.g. "1/2 kg = 500 grams", "x = 5"), since backslashes break JSON parsing:
{"similarQuestions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"a short but complete step-by-step walkthrough — say what is actually being bought and sold in plain words first, then the calculation with real numbers, not just a bare formula substitution someone would need to already know to follow"}]}
Give exactly 3 new practice MCQs, same difficulty and concept as the original.`;
    const res = await callClaude(prompt, []);
    setPracticeMoreId(null);
    if (!res.ok) { setPracticeMoreError(friendlyErrorMessage(res.error)); setPracticeMoreErrorId(entry.id); return; }
    const parsed = parseJsonLoose(res.text);
    if (!parsed || !parsed.similarQuestions) { setPracticeMoreError('Could not generate more questions — try again.'); setPracticeMoreErrorId(entry.id); return; }
    setDoubts(doubts.map((d) => (d.id === entry.id ? { ...d, similarQuestions: [...(d.similarQuestions || []), ...parsed.similarQuestions] } : d)));
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle icon={HelpCircle} accent="text-cyan-400">Ask a doubt</SectionTitle>
        <TextArea rows={4} placeholder="Type the question you're stuck on…" value={text} onChange={(e) => setText(e.target.value)} className="mb-3" />
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-slate-500">Or upload a screenshot instead (preferred)</label>
        <ImageUploader files={images} setFiles={setImages} maxFiles={3} />
        <ErrorNote message={error} />
        <NeonButton className="mt-3" onClick={solve} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Solving…' : 'Get answer + explanation'}
        </NeonButton>
      </Panel>

      <div className="space-y-3">
        {doubts.map((d) => (
          <Panel key={d.id}>
            <p className="mb-1 font-mono text-xs text-slate-500">{fmtDate(d.date)}</p>
            <p className="mb-2 text-sm text-slate-300">{d.question}</p>
            <div className="mb-3 rounded-lg border border-cyan-900 bg-cyan-950 p-3">
              <p className="mb-1 text-sm font-semibold text-cyan-400">Answer: {d.answer}</p>
              <FormattedText text={d.explanation} className="text-xs text-slate-400" />
            </div>
            {(d.similarQuestions || []).length > 0 && (
              <div>
                <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-fuchsia-400">Practice similar</p>
                <QuizBlock
                  quiz={d.similarQuestions}
                  onPracticeMore={() => practiceMore(d)}
                  practiceMoreLoading={practiceMoreId === d.id}
                  practiceMoreError={practiceMoreErrorId === d.id ? practiceMoreError : ''}
                />
              </div>
            )}
          </Panel>
        ))}
        {!doubts.length && <EmptyState text="No doubts logged yet." />}
      </div>
    </div>
  );
}

/* ===================== RESOURCES TAB ===================== */

function ResourcesTab({ resources, setResources }) {
  const [form, setForm] = useState({ subject: 'quant', name: '', platform: '', notes: '' });

  const add = () => {
    if (!form.name.trim()) return;
    setResources([...resources, { id: 'res-' + Date.now(), ...form }]);
    setForm({ subject: 'quant', name: '', platform: '', notes: '' });
  };
  const remove = (id) => setResources(resources.filter((r) => r.id !== id));

  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle icon={GraduationCap} accent="text-cyan-400">Add a resource you're following</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
          </select>
          <TextInput placeholder="Name — e.g. Harshal Agarwal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput placeholder="Platform — e.g. YouTube, yesofficer" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} />
          <NeonButton onClick={add}><Plus className="h-4 w-4" /></NeonButton>
        </div>
      </Panel>

      {SUBJECTS.map((s) => {
        const list = resources.filter((r) => r.subject === s);
        if (!list.length) return null;
        return (
          <div key={s}>
            <SectionTitle icon={GraduationCap} accent={SUBJECT_TEXT[s]}>{SUBJECT_LABEL[s]}</SectionTitle>
            <div className="space-y-2">
              {list.map((r) => (
                <div key={r.id} className={`flex items-center justify-between rounded-lg border-l-2 ${SUBJECT_BORDER[s]} bg-slate-900 px-4 py-2.5`}>
                  <div>
                    <p className="text-sm text-slate-200">{r.name}</p>
                    <p className="font-mono text-xs text-slate-500">{r.platform}{r.notes ? ` · ${r.notes}` : ''}</p>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-slate-600 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===================== MATERIALS TAB ===================== */

function MaterialsTab({ materials, setMaterials }) {
  const [form, setForm] = useState({ label: '', url: '', subject: 'quant' });

  const add = () => {
    if (!form.label.trim() || !form.url.trim()) return;
    setMaterials([...materials, { id: 'mat-' + Date.now(), ...form }]);
    setForm({ label: '', url: '', subject: 'quant' });
  };
  const remove = (id) => setMaterials(materials.filter((m) => m.id !== id));

  return (
    <div className="space-y-5">
      <Panel>
        <SectionTitle icon={Link2} accent="text-fuchsia-400">Material links</SectionTitle>
        <p className="mb-3 text-xs text-slate-500">
          A live, auto-syncing Google Drive connection isn't reliable to hand-build inside this artifact — Google blocks its
          own sign-in screen from loading embedded like this. Paste labeled links instead; they open in a new tab straight
          from here so you stop hunting for material across apps.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABEL[s]}</option>)}
          </select>
          <TextInput placeholder="Label — e.g. Quant PDFs folder" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <TextInput placeholder="Drive / other link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <NeonButton onClick={add}><Plus className="h-4 w-4" /></NeonButton>
        </div>
      </Panel>

      <div className="space-y-2">
        {materials.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between rounded-lg border-l-2 ${SUBJECT_BORDER[m.subject]} bg-slate-900 px-4 py-2.5 hover:bg-slate-900`}>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-200">{m.label}</span>
            </div>
            <button onClick={(e) => { e.preventDefault(); remove(m.id); }} className="text-slate-600 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </a>
        ))}
        {!materials.length && <EmptyState text="No material links saved yet." />}
      </div>
    </div>
  );
}

/* ===================== APP ===================== */

export default function ExamPrepTracker() {
  const [ready, setReady] = useState(false);
  const [storageWorks, setStorageWorks] = useState(true);
  const [tab, setTab] = useState('today');

  const [exams, setExams] = useState(DEFAULT_EXAMS);
  const [dailyLogs, setDailyLogs] = useState({});
  const [mocks, setMocks] = useState([]);
  const [drills, setDrills] = useState([]);
  const [caEntries, setCaEntries] = useState([]);
  const [editorialEntries, setEditorialEntries] = useState([]);
  const [descriptiveEntries, setDescriptiveEntries] = useState([]);
  const [doubts, setDoubts] = useState([]);
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    (async () => {
      const probe = await saveKey('__probe__', { t: Date.now() });
      setStorageWorks(probe);
      setExams(await loadKey('exams', DEFAULT_EXAMS));
      setDailyLogs(await loadKey('dailyLogs', {}));
      setMocks(await loadKey('mocks', []));
      setDrills(await loadKey('drills', []));
      setCaEntries(await loadKey('caEntries', []));
      setEditorialEntries(await loadKey('editorialEntries', []));
      setDescriptiveEntries(await loadKey('descriptiveEntries', []));
      setDoubts(await loadKey('doubts', []));
      setResources(await loadKey('resources', DEFAULT_RESOURCES));
      setMaterials(await loadKey('materials', []));
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) saveKey('exams', exams); }, [exams, ready]);
  useEffect(() => { if (ready) saveKey('dailyLogs', dailyLogs); }, [dailyLogs, ready]);
  useEffect(() => { if (ready) saveKey('mocks', mocks); }, [mocks, ready]);
  useEffect(() => { if (ready) saveKey('drills', drills); }, [drills, ready]);
  useEffect(() => { if (ready) saveKey('caEntries', caEntries); }, [caEntries, ready]);
  useEffect(() => { if (ready) saveKey('editorialEntries', editorialEntries); }, [editorialEntries, ready]);
  useEffect(() => { if (ready) saveKey('descriptiveEntries', descriptiveEntries); }, [descriptiveEntries, ready]);
  useEffect(() => { if (ready) saveKey('doubts', doubts); }, [doubts, ready]);
  useEffect(() => { if (ready) saveKey('resources', resources); }, [resources, ready]);
  useEffect(() => { if (ready) saveKey('materials', materials); }, [materials, ready]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <CountdownBar exams={exams} />
      <TabNav active={tab} onChange={setTab} />

      {!storageWorks && (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-800 bg-slate-900 px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Saving isn't working in this browser right now — check that site data/cookies aren't blocked (common in private browsing), or try a different browser. Everything still works this session either way.</span>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-5">
        {tab === 'today' && <TodayTab exams={exams} dailyLogs={dailyLogs} setDailyLogs={setDailyLogs} mocks={mocks} drills={drills} caEntries={caEntries} editorialEntries={editorialEntries} />}
        {tab === 'exams' && <ExamsTab exams={exams} setExams={setExams} />}
        {tab === 'mocks' && <MocksTab mocks={mocks} setMocks={setMocks} />}
        {tab === 'drills' && <DrillsTab drills={drills} setDrills={setDrills} />}
        {tab === 'ca' && <CATab caEntries={caEntries} setCaEntries={setCaEntries} />}
        {tab === 'english' && <EnglishTab editorialEntries={editorialEntries} setEditorialEntries={setEditorialEntries} descriptiveEntries={descriptiveEntries} setDescriptiveEntries={setDescriptiveEntries} />}
        {tab === 'doubts' && <DoubtsTab doubts={doubts} setDoubts={setDoubts} />}
        {tab === 'resources' && <ResourcesTab resources={resources} setResources={setResources} />}
        {tab === 'materials' && <MaterialsTab materials={materials} setMaterials={setMaterials} />}
      </main>
    </div>
  );
}
