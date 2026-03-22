/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Home as HomeIcon, 
  Heart, 
  BarChart2, 
  Pencil, 
  ChevronLeft, 
  Plus, 
  Bike, 
  Book, 
  Utensils, 
  Check, 
  Clock, 
  MessageSquare,
  Activity as ActivityIcon,
  X,
  Mic,
  List,
  Trash2,
  Settings,
  GripVertical,
  ExternalLink,
  LogOut,
  History,
  BookOpen,
  ChevronRight,
  Cloud,
  Bot,
  Database,
  Info
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import confetti from 'canvas-confetti';
import { Category, Activity, SubTask, CategoryStats, JournalEntry } from './types';
import { processDictation, AIUpdate } from './services/aiService';

// --- Helpers ---
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getTodayDateKey = () => {
  return new Date().toISOString().split('T')[0];
};

const getDateKeyForDayName = (dayName: string) => {
  const today = new Date();
  const todayDayIndex = today.getDay(); // 0-6
  const targetDayIndex = DAYS.indexOf(dayName);
  const diff = targetDayIndex - todayDayIndex;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + diff);
  return targetDate.toISOString().split('T')[0];
};

const getLogForDate = (activity: Activity, dateKey: string) => {
  return activity.logs[dateKey] || {
    completed: false,
    duration: 0,
    note: '',
    subTaskStatus: {}
  };
};

// --- Mock Data ---
const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat1', title: 'reading', icon: '📚', color: 'bg-app-yellow' },
  { id: 'cat2', title: 'movement', icon: '🚴', color: 'bg-app-green' },
  { id: 'cat3', title: 'mind', icon: '🧘', color: 'bg-app-yellow' },
  { id: 'cat4', title: 'nutrition', icon: '🥗', color: 'bg-app-green' },
];

const INITIAL_ACTIVITIES: Activity[] = [
  {
    id: '1',
    title: 'gym',
    categoryId: 'cat2',
    days: ['Monday'],
    subTasks: [
      { id: 's1', title: 'leg press' },
      { id: 's2', title: 'calf raises' },
      { id: 's3', title: 'split squats' },
    ],
    logs: {
      [getDateKeyForDayName('Monday')]: {
        completed: false,
        duration: 60,
        note: 'Today I felt very tired',
        subTaskStatus: { 's1': false, 's2': false, 's3': false }
      }
    }
  },
  {
    id: '2',
    title: 'bike',
    categoryId: 'cat2',
    days: ['Monday', 'Wednesday', 'Friday'],
    subTasks: [],
    logs: {}
  },
  {
    id: '3',
    title: 'stretch',
    categoryId: 'cat2',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    subTasks: [],
    logs: {}
  },
  {
    id: '4',
    title: 'eat sushi',
    categoryId: 'cat4',
    days: ['Friday', 'Saturday'],
    subTasks: [],
    logs: {}
  },
  {
    id: '5',
    title: 'read poem',
    categoryId: 'cat1',
    days: ['Monday', 'Wednesday', 'Friday'],
    subTasks: [],
    logs: {}
  }
];

const DEFAULT_AI_PROMPT = `User transcript: "{{transcript}}"

Available activities: {{activities}}

Current date context: {{date}} (Today is {{today}})

Task: Parse the transcript and identify which activities were mentioned as completed. 
1. If an activity matches one in the "Available activities" list, use its ID.
2. If an activity is mentioned but DOES NOT match any in the list, mark it as isNew: true and suggest a category name and icon.
3. Extract the day of the week (e.g. "Monday", "Tuesday", etc.) if mentioned, otherwise assume today ({{today}}).
4. Extract duration (in minutes) and any specific notes if mentioned.

Return a JSON array of updates. Only include activities that were explicitly mentioned or strongly implied as completed.`;

const ConfirmationModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  isDanger?: boolean;
}> = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", isDanger = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6"
      >
        <div className="space-y-2">
          <h3 className={`text-xl font-black uppercase tracking-tight ${isDanger ? 'text-red-500' : 'text-app-purple'}`}>{title}</h3>
          <p className="text-app-muted font-medium text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all ${isDanger ? 'bg-red-500 text-white' : 'bg-app-purple text-white'}`}
          >
            {confirmText}
          </button>
          <button 
            onClick={onCancel}
            className="w-full py-4 rounded-2xl bg-black/5 text-app-muted font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const SettingsScreen: React.FC<{
  prompt: string;
  onSavePrompt: (prompt: string) => void;
  onDeleteHistory: () => void;
  onDeleteFile: () => void;
  onImportFromSheets: () => void;
  onLoadPresets: () => void;
  isSheetsConnected: boolean;
  onConnectSheets: () => void;
  onLogout: () => void;
  spreadsheetUrl: string | null;
  lastSynced: string | null;
  debugInfo?: any;
  connectionError?: string | null;
  isSyncing?: boolean;
  subView: 'menu' | 'cloud' | 'prompt' | 'data' | 'system' | 'journal';
  onSubViewChange: (view: 'menu' | 'cloud' | 'prompt' | 'data' | 'system' | 'journal') => void;
}> = ({ 
  prompt, 
  onSavePrompt, 
  onDeleteHistory, 
  onDeleteFile, 
  onImportFromSheets, 
  onLoadPresets, 
  isSheetsConnected, 
  onConnectSheets, 
  onLogout, 
  spreadsheetUrl, 
  lastSynced, 
  debugInfo, 
  connectionError, 
  isSyncing,
  subView,
  onSubViewChange,
  journalEntries // We need to pass this down
}) => {
  const [localPrompt, setLocalPrompt] = useState(prompt);
  const [showDebug, setShowDebug] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [isPinging, setIsPinging] = useState(false);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const testConnection = async (endpoint: string = '/api/app-status') => {
    setIsPinging(true);
    setPingResult(`Pinging ${endpoint}...`);
    try {
      const res = await fetch(`${endpoint}?t=${Date.now()}`);
      const text = await res.text();
      const traceHeaders = {
        trace: res.headers.get('x-server-trace'),
        path: res.headers.get('x-req-path'),
        url: res.headers.get('x-req-url')
      };
      setPingResult(`Endpoint: ${endpoint}\nStatus: ${res.status}\nContent-Type: ${res.headers.get('content-type')}\n\nTrace Headers:\n- Trace: ${traceHeaders.trace}\n- Path: ${traceHeaders.path}\n- URL: ${traceHeaders.url}\n\nBody Preview: ${text.substring(0, 200)}`);
      
      // Also fetch logs
      try {
        const logRes = await fetch(`/api/debug-logs?t=${Date.now()}`);
        const logText = await logRes.text();
        if (logRes.ok && logText.trim().startsWith('{')) {
          const logData = JSON.parse(logText);
          setServerLogs(logData.logs || []);
        } else {
          console.warn("Logs endpoint returned non-JSON:", logText.substring(0, 50));
        }
      } catch (logErr) {
        console.error("Error fetching logs:", logErr);
      }
    } catch (e: any) {
      setPingResult(`Error: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  if (subView === 'menu') {
    const menuItems = [
      { id: 'cloud', title: 'Cloud Sync', icon: <Cloud size={20} />, description: 'Google Sheets integration' },
      { id: 'prompt', title: 'AI Prompt', icon: <Bot size={20} />, description: 'Customize AI behavior' },
      { id: 'data', title: 'Data Magmt', icon: <Database size={20} />, description: 'Import, export, and clear data' },
      { id: 'journal', title: 'Journal', icon: <History size={20} />, description: 'View your activity logs' },
      { id: 'system', title: 'System Info', icon: <Info size={20} />, description: 'Diagnostics and logs' },
    ] as const;

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight uppercase">Configuration</h1>
          <p className="text-app-muted font-medium">Manage your account and system settings.</p>
        </div>

        <div className="space-y-3">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'journal') {
                  onSubViewChange('journal' as any); // We'll handle this in App.tsx or keep it as a subview
                } else {
                  onSubViewChange(item.id);
                }
              }}
              className="w-full bg-white p-6 rounded-3xl card-shadow flex items-center justify-between group active:scale-[0.98] transition-all border border-black/5"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-app-bg rounded-2xl flex items-center justify-center text-app-text group-hover:bg-app-purple group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <div className="text-left">
                  <h3 className="font-black uppercase text-sm tracking-tight">{item.title}</h3>
                  <p className="text-[10px] text-app-muted font-bold uppercase tracking-widest">{item.description}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-app-muted/30 group-hover:text-app-text transition-colors" />
            </button>
          ))}

          <button
            onClick={() => {
              setConfirmConfig({
                isOpen: true,
                title: "Log Out",
                message: "Are you sure you want to log out? Your local data will remain, but cloud sync will be disabled.",
                isDanger: true,
                onConfirm: onLogout
              });
            }}
            className="w-full bg-white p-6 rounded-3xl card-shadow flex items-center justify-between group active:scale-[0.98] transition-all border border-red-500/10 hover:border-red-500/30"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
                <LogOut size={20} />
              </div>
              <div className="text-left">
                <h3 className="font-black uppercase text-sm tracking-tight text-red-500">Log Out</h3>
                <p className="text-[10px] text-red-500/60 font-bold uppercase tracking-widest">Disconnect account</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-red-500/20 group-hover:text-red-500 transition-colors" />
          </button>
        </div>

        <ConfirmationModal 
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          isDanger={confirmConfig.isDanger}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8 pb-32 relative z-10"
    >
      {subView === 'cloud' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl card-shadow space-y-4">
            {isSheetsConnected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${isSyncing ? 'bg-app-green/20 text-app-green' : 'bg-app-green text-white'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full bg-white ${isSyncing ? 'animate-spin border-t-transparent' : 'animate-pulse'}`} />
                    {isSyncing ? 'Syncing' : 'Synced'}
                  </div>
                  
                  {lastSynced && (
                    <span className="text-[9px] text-app-muted font-bold uppercase tracking-tight">
                      Last sync: {lastSynced}
                    </span>
                  )}
                </div>

                <div className="bg-app-bg/50 p-4 rounded-2xl border border-black/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">Google Spreadsheet</span>
                    <a 
                      href={spreadsheetUrl || '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-app-purple font-black uppercase tracking-widest hover:underline flex items-center gap-1"
                    >
                      Open <ExternalLink size={10} />
                    </a>
                  </div>
                  <p className="text-[9px] text-app-muted font-medium leading-relaxed">
                    Your data is safely backed up to Google Sheets. Check the "Goals" and "Logs" tabs in your spreadsheet.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-app-muted font-medium">Connect your Google account to back up your goals and activities to a spreadsheet automatically.</p>
                <button 
                  onClick={onConnectSheets}
                  className="w-full bg-app-text text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Connect Google Sheets
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {subView === 'prompt' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl card-shadow space-y-4">
            <textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              className="w-full h-80 bg-app-bg/50 rounded-2xl p-4 focus:ring-2 focus:ring-app-text outline-none font-mono text-xs leading-relaxed resize-none"
              placeholder="Enter AI system prompt..."
            />
            <div className="p-4 bg-app-text/5 rounded-2xl space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">Available Placeholders</p>
              <div className="flex flex-wrap gap-2">
                {['{{transcript}}', '{{activities}}', '{{today}}', '{{date}}'].map(p => (
                  <code key={p} className="text-[9px] bg-white px-1.5 py-0.5 rounded border border-black/5 font-bold text-app-text">{p}</code>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLocalPrompt(DEFAULT_AI_PROMPT)}
                className="flex-1 py-3 rounded-xl border-2 border-app-text/10 text-app-text font-black uppercase text-xs tracking-widest hover:bg-black/5 transition-colors"
              >
                Reset to Default
              </button>
              <button
                onClick={() => onSavePrompt(localPrompt)}
                className="flex-1 py-3 rounded-xl bg-app-text text-white font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Save Prompt
              </button>
            </div>
          </div>
          <p className="text-[10px] text-app-muted font-medium italic">
            Use <code className="bg-black/5 px-1 rounded">{"{{transcript}}"}</code> and <code className="bg-black/5 px-1 rounded">{"{{activities}}"}</code> as placeholders for dynamic data.
          </p>
        </div>
      )}

      {subView === 'data' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl card-shadow space-y-6">
            <div className="space-y-2">
              <h4 className="text-sm font-black uppercase">Pre-set Records</h4>
              <p className="text-xs text-app-muted font-medium">Load a set of 3 categories (Nutrition, Movement, Learnings) with 3 activities each. This will clear all current history.</p>
              <button
                onClick={() => {
                  setConfirmConfig({
                    isOpen: true,
                    title: "Load Pre-set Data",
                    message: "This will DELETE all current history and load new pre-set categories and activities. Continue?",
                    isDanger: true,
                    onConfirm: onLoadPresets
                  });
                }}
                disabled={isSyncing}
                className="w-full py-4 rounded-xl bg-app-green text-white font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all mt-2 disabled:opacity-50 cursor-pointer relative z-10"
              >
                {isSyncing ? 'Processing...' : 'Load Pre-set Data'}
              </button>
            </div>

            <div className="pt-4 border-t border-black/5 space-y-2">
              <h4 className="text-sm font-black uppercase text-red-500">Danger Zone</h4>
              <p className="text-xs text-app-muted font-medium">Manage your data history and cloud storage.</p>
              <button
                type="button"
                onClick={() => {
                  setConfirmConfig({
                    isOpen: true,
                    title: "Delete History",
                    message: "Are you sure you want to delete ALL local records and clear the spreadsheet data? The file itself will NOT be deleted.",
                    isDanger: true,
                    onConfirm: onDeleteHistory
                  });
                }}
                className="w-full py-4 rounded-xl border-2 border-red-500/20 text-red-500 font-black uppercase text-xs tracking-widest hover:bg-red-50 transition-colors mt-2 cursor-pointer relative z-10"
              >
                Delete History
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmConfig({
                    isOpen: true,
                    title: "Delete File",
                    message: "Are you sure you want to delete the 'Raphael Goal Tracker' file from your Google Drive? This will permanently remove all historical logs and the file itself.",
                    isDanger: true,
                    onConfirm: onDeleteFile
                  });
                }}
                disabled={isSyncing}
                className="w-full py-4 rounded-xl border-2 border-red-500/20 text-red-500 font-black uppercase text-xs tracking-widest hover:bg-red-50 transition-colors mt-2 disabled:opacity-50 cursor-pointer relative z-10"
              >
                {isSyncing ? 'Processing...' : 'Delete File'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmConfig({
                    isOpen: true,
                    title: "Import from Sheets",
                    message: "Are you sure you want to import data from Sheets? This will overwrite your current local activities with the data from the spreadsheet.",
                    isDanger: false,
                    onConfirm: onImportFromSheets
                  });
                }}
                disabled={isSyncing}
                className="w-full py-4 rounded-xl border-2 border-app-purple/20 text-app-purple font-black uppercase text-xs tracking-widest hover:bg-app-purple/5 transition-colors mt-2 disabled:opacity-50 cursor-pointer relative z-10"
              >
                {isSyncing ? 'Syncing...' : 'Import Data from Sheets'}
              </button>

            </div>

            <ConfirmationModal 
              isOpen={confirmConfig.isOpen}
              title={confirmConfig.title}
              message={confirmConfig.message}
              isDanger={confirmConfig.isDanger}
              onConfirm={confirmConfig.onConfirm}
              onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            />
          </div>
        </div>
      )}

      {subView === 'system' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-xs font-black uppercase text-app-muted tracking-widest">System Info</label>
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-[10px] font-bold uppercase text-app-purple"
            >
              {showDebug ? 'Hide' : 'Show'} Debug
            </button>
          </div>
          
          <div className="bg-white p-6 rounded-3xl card-shadow space-y-4">
            <div className="flex flex-col gap-2">
              <p className="text-app-muted uppercase font-bold text-[10px]">Connection Diagnostics:</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => testConnection('/api/health')}
                  disabled={isPinging}
                  className="bg-app-purple text-white px-3 py-1 rounded-lg font-bold uppercase text-[9px] active:scale-95 disabled:opacity-50"
                >
                  {isPinging ? 'Testing...' : 'Test Connection'}
                </button>
                <button 
                  onClick={() => {
                    fetch('/api/debug-logs')
                      .then(res => res.json())
                      .then(data => {
                        alert("Server Logs:\n" + data.logs.join('\n'));
                      })
                      .catch(err => alert("Failed to fetch logs: " + err.message));
                  }}
                  className="bg-app-text text-white px-3 py-1 rounded-lg font-bold uppercase text-[9px] active:scale-95"
                >
                  Server Logs
                </button>
              </div>
            </div>

            {pingResult && (
              <div className="p-3 bg-app-bg rounded-xl border border-black/5 whitespace-pre-wrap break-all font-mono text-[9px]">
                {pingResult}
              </div>
            )}

            {serverLogs.length > 0 && (
              <div className="space-y-2">
                <p className="text-app-muted uppercase font-bold text-[10px]">Server Logs (Recent):</p>
                <div className="p-3 bg-black/80 text-green-400 rounded-xl max-h-40 overflow-y-auto font-mono text-[9px]">
                  {serverLogs.map((log, i) => (
                    <p key={i} className="mb-1">{log}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-black/5 space-y-1 text-[10px]">
              <p className="text-app-muted uppercase font-bold">Client Context:</p>
              <p><span className="text-app-purple">Origin:</span> {debugInfo?.origin}</p>
              <p><span className="text-app-purple">Href:</span> {debugInfo?.href}</p>
              <p className="truncate"><span className="text-app-purple">UA:</span> {debugInfo?.userAgent}</p>
            </div>
            
            <div className="pt-4 border-t border-black/5 space-y-1 text-[10px]">
              <p className="text-app-muted uppercase font-bold">Spreadsheet Info:</p>
              <p className="truncate"><span className="text-app-purple">URL:</span> {debugInfo?.spreadsheetUrl || 'Not synced yet'}</p>
              {debugInfo?.spreadsheetUrl && (
                <p className="text-[8px] text-app-muted break-all">{debugInfo.spreadsheetUrl}</p>
              )}
            </div>

            <div className="pt-4 border-t border-black/5 space-y-1 text-[10px]">
              <p className="text-app-muted uppercase font-bold">Server Connection:</p>
              <p><span className="text-app-purple">Status:</span> {debugInfo?.serverConfig ? '✅ Connected' : '❌ Failed'}</p>
              {connectionError && (
                <p className="text-red-500 font-bold"><span className="text-app-purple">Auto-Check Error:</span> {connectionError}</p>
              )}
              {debugInfo?.serverConfig && (
                <pre className="mt-2 p-2 bg-app-bg rounded-lg overflow-x-auto">
                  {JSON.stringify(debugInfo.serverConfig, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {subView === 'journal' && (
        <JournalScreen key="journal" entries={journalEntries || []} />
      )}
    </motion.div>
  );
};

// --- Main App ---

const COLORS = [
  { name: 'Blue', class: 'bg-app-blue' },
  { name: 'Green', class: 'bg-app-green' },
  { name: 'Orange', class: 'bg-app-orange' },
  { name: 'Pink', class: 'bg-app-pink' }
];

const EMOJIS = ['🎯', '🏃', '🧘', '📚', '🎨', '🍳', '🎸', '💻', '🌱', '🏠', '💼', '🚲'];

const Layout: React.FC<{ 
  children: React.ReactNode; 
  currentTab: string; 
  onTabChange: (tab: string) => void;
  title?: string | React.ReactNode;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}> = ({ children, currentTab, onTabChange, title, onBack, rightAction }) => {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-app-bg font-sans selection:bg-app-purple/20">
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full bg-white relative shadow-2xl min-h-[100dvh]">
        {/* Header */}
        <header className="sticky top-0 p-6 flex justify-between items-center shrink-0 bg-white/80 backdrop-blur-md z-40 border-b border-black/5">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 -ml-2 hover:bg-black/5 rounded-full transition-colors active:scale-90">
                <ChevronLeft size={24} />
              </button>
            )}
            {title && (
              typeof title === 'string' ? (
                <h1 className="text-xl font-black tracking-tight uppercase text-app-text">{title}</h1>
              ) : (
                title
              )
            )}
          </div>
          <div className="flex items-center gap-4">
            {rightAction}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 pt-4 pb-32">
          {children}
        </main>

        {/* Navigation */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-app-purple p-4 flex justify-around items-center rounded-t-[2.5rem] shadow-[0_-15px_40px_rgba(0,0,0,0.15)] z-50">
          <button 
            onClick={() => onTabChange('home')}
            className={`p-3 rounded-2xl transition-all active:scale-90 ${currentTab === 'home' ? 'bg-white/20 text-white' : 'text-white/60'}`}
          >
            <HomeIcon size={24} />
          </button>
          <button 
            onClick={() => onTabChange('overview')}
            className={`p-3 rounded-2xl transition-all active:scale-90 ${currentTab === 'overview' ? 'bg-white/20 text-white' : 'text-white/60'}`}
          >
            <Heart size={24} />
          </button>
          <button 
            onClick={() => onTabChange('stats')}
            className={`p-3 rounded-2xl transition-all active:scale-90 ${currentTab === 'stats' ? 'bg-white/20 text-white' : 'text-white/60'}`}
          >
            <BarChart2 size={24} />
          </button>
          <button 
            onClick={() => onTabChange('settings')}
            className={`p-3 rounded-2xl transition-all active:scale-90 ${currentTab === 'settings' ? 'bg-white/20 text-white' : 'text-white/60'}`}
          >
            <Settings size={24} />
          </button>
        </nav>
      </div>
    </div>
  );
};

// --- Screens ---

const HomeScreen: React.FC<{ 
  categories: Category[];
  onSelectCategory: (catId: string) => void;
  onCreateCategory: () => void;
  isSheetsConnected: boolean;
  onConnectSheets: () => void;
  onSyncSheets: () => void;
  isSyncing: boolean;
  isRecording: boolean;
  isProcessingAI: boolean;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onViewAll: () => void;
  interimTranscript: string;
  spreadsheetUrl: string | null;
  serverConfig: { hasClientId: boolean; hasClientSecret: boolean } | null;
  lastSynced: string | null;
}> = ({ categories, onSelectCategory, onCreateCategory, isSheetsConnected, onConnectSheets, onSyncSheets, isSyncing, isRecording, isProcessingAI, onStartDictation, onStopDictation, onViewAll, interimTranscript, spreadsheetUrl, serverConfig, lastSynced }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-12"
    >
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight uppercase">Home Screen</h1>
            <p className="text-app-muted font-medium">What's your goal?</p>
          </div>
        </div>

        <button 
          onMouseDown={onStartDictation}
          onMouseUp={onStopDictation}
          onMouseLeave={onStopDictation}
          onTouchStart={(e) => {
            e.preventDefault();
            onStartDictation();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            onStopDictation();
          }}
          disabled={isProcessingAI}
          className={`w-full bg-white p-6 rounded-3xl card-shadow flex flex-col items-center justify-center gap-4 transition-all active:scale-[0.98] border-2 border-dashed select-none touch-none ${
            isRecording ? 'border-app-green bg-app-green/5 text-app-green animate-pulse' : 
            isProcessingAI ? 'border-app-purple bg-app-purple/5 text-app-purple' : 
            'border-black/5 text-app-muted hover:text-app-text'
          }`}
        >
          <div className="flex items-center gap-4">
            {isProcessingAI ? (
              <div className="w-6 h-6 border-2 border-app-purple/30 border-t-app-purple rounded-full animate-spin" />
            ) : (
              <Mic size={24} className={isRecording ? 'animate-bounce' : ''} />
            )}
            <span className="text-sm font-black uppercase tracking-widest">
              {isRecording ? 'Listening...' : isProcessingAI ? 'AI is processing...' : 'Dictate about your day'}
            </span>
          </div>
          
          {isRecording && interimTranscript && (
            <div className="w-full mt-4 p-4 bg-white/50 rounded-2xl border border-app-green/20">
              <p className="text-xs font-medium italic text-app-text/70 line-clamp-2">
                "{interimTranscript}"
              </p>
            </div>
          )}
        </button>

        {serverConfig && (!serverConfig.hasClientId || !serverConfig.hasClientSecret) && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-[10px] text-red-600 font-bold uppercase tracking-tight">
              ⚠️ Missing Google API Credentials
            </p>
            <p className="text-[9px] text-red-500 mt-1">
              Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`${cat.color} aspect-square rounded-3xl flex flex-col items-center justify-center card-shadow transition-transform active:scale-95 gap-2 relative overflow-hidden group`}
          >
            <span className="text-4xl">{cat.icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-app-text/60">{cat.title}</span>
          </button>
        ))}
        <button 
          onClick={onCreateCategory}
          className="bg-app-green/30 aspect-square rounded-3xl flex items-center justify-center border-2 border-dashed border-app-text/20 hover:bg-app-green/40 transition-colors"
        >
          <Plus size={32} className="text-app-text/40" />
        </button>
      </div>

      <button 
        onClick={onViewAll}
        className="w-full bg-white/50 py-6 rounded-3xl border-2 border-dashed border-black/5 text-app-muted font-black uppercase tracking-widest hover:text-app-text hover:bg-white transition-all active:scale-[0.98]"
      >
        All categories
      </button>
    </motion.div>
  );
};

const ActivityListScreen: React.FC<{ 
  category: Category; 
  activities: Activity[]; 
  onToggleActivity: (id: string, dateKey: string) => void;
  onSelectActivity: (activity: Activity, dateKey: string) => void;
  onCreateActivity: (activity: Omit<Activity, 'id' | 'logs' | 'subTasks'>) => void;
  onOpenCreate: () => void;
  onCompleteDay: (dateKey: string) => void;
  completedDays: string[];
}> = ({ category, activities, onToggleActivity, onSelectActivity, onCreateActivity, onOpenCreate, onCompleteDay, completedDays }) => {
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);

  const selectedDateKey = getDateKeyForDayName(selectedDay);
  const filteredActivities = activities.filter(a => a.categoryId === category.id && a.days.includes(selectedDay));
  const isDayCompleted = completedDays.includes(selectedDateKey);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {DAYS.map(day => {
          const dayDateKey = getDateKeyForDayName(day);
          const isDayCompleted = completedDays.includes(dayDateKey);
          return (
            <button 
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedDay === day 
                  ? 'bg-app-text text-white shadow-md' 
                  : isDayCompleted 
                    ? 'bg-app-green/20 text-app-green border border-app-green/30'
                    : 'bg-white text-app-muted border border-app-text/5'
              }`}
            >
              {day.substring(0, 3)}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {filteredActivities.map(activity => {
          const log = getLogForDate(activity, selectedDateKey);
          return (
            <div 
              key={activity.id}
              className={`${category.color} p-6 rounded-3xl flex justify-between items-center card-shadow cursor-pointer group relative`}
              onClick={() => onSelectActivity(activity, selectedDateKey)}
            >
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-black uppercase">{activity.title}</span>
                <div className="flex gap-1">
                  {DAYS.map(d => {
                    const isScheduled = activity.days.includes(d);
                    const isCompleted = activity.logs[getDateKeyForDayName(d)]?.completed;
                    return (
                      <div 
                        key={d} 
                        className={`w-3.5 h-2 rounded-full flex items-center justify-center transition-all ${
                          isCompleted ? 'bg-app-text text-white' : 
                          isScheduled ? 'border border-app-text/20 bg-transparent' : 
                          'bg-app-text/5'
                        }`}
                      >
                        {isCompleted && <Check size={6} strokeWidth={4} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleActivity(activity.id, selectedDateKey);
                    }}
                    className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${
                      log.completed ? 'bg-white/40 border-transparent shadow-sm' : 'bg-transparent border-app-text/10'
                    }`}
                  >
                    {log.completed && <Check size={24} className="text-app-text" />}
                  </button>
              </div>
            </div>
          );
        })}

        <button 
          onClick={onOpenCreate}
          className="w-full bg-app-green/20 p-6 rounded-3xl flex justify-center items-center border-2 border-dashed border-app-text/10 hover:bg-app-green/30 transition-colors"
        >
          <Plus size={24} className="text-app-text/40" />
        </button>
      </div>

      <div className="pt-4">
        <button 
          onClick={() => onCompleteDay(selectedDateKey)}
          className={`w-full py-6 rounded-3xl font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-3 ${
            isDayCompleted 
              ? 'bg-app-green text-white' 
              : 'bg-app-text text-white'
          }`}
        >
          {isDayCompleted ? (
            <>
              <Check size={24} />
              Day Completed
            </>
          ) : (
            'Complete Day'
          )}
        </button>
      </div>

      <EditActivityDrawer 
        isOpen={false} // This is now handled by parent
        onClose={() => {}}
        activity={null}
        onSave={() => {}}
      />
    </motion.div>
  );
};

const DailyOverviewScreen: React.FC<{
  categories: Category[];
  activities: Activity[];
  onToggleActivity: (id: string, dateKey: string) => void;
  onSelectActivity: (activity: Activity, dateKey: string) => void;
  onCompleteDay: (dateKey: string) => void;
  completedDays: string[];
}> = ({ categories, activities, onToggleActivity, onSelectActivity, onCompleteDay, completedDays }) => {
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);
  const selectedDateKey = getDateKeyForDayName(selectedDay);
  const isDayCompleted = completedDays.includes(selectedDateKey);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8 pb-12"
    >
      <div className="space-y-4">
        <h1 className="text-3xl font-black tracking-tight uppercase">Daily Overview</h1>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {DAYS.map(day => {
            const dayDateKey = getDateKeyForDayName(day);
            const isDayCompleted = completedDays.includes(dayDateKey);
            return (
              <button 
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedDay === day 
                    ? 'bg-app-text text-white shadow-md' 
                    : isDayCompleted 
                      ? 'bg-app-green/20 text-app-green border border-app-green/30'
                      : 'bg-white text-app-muted border border-app-text/5'
                }`}
              >
                {day.substring(0, 3)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-10">
        {categories.map(category => {
          const categoryActivities = activities.filter(a => a.categoryId === category.id && a.days.includes(selectedDay));
          if (categoryActivities.length === 0) return null;

          return (
            <div key={category.id} className="space-y-4">
              <div className="flex items-center gap-2 px-2">
                <span className="text-xl">{category.icon}</span>
                <span className="text-xs font-black uppercase tracking-widest text-app-muted">{category.title}</span>
              </div>
              <div className="space-y-3">
                {categoryActivities.map(activity => {
                  const log = getLogForDate(activity, selectedDateKey);
                  return (
                    <div 
                      key={activity.id}
                      className={`${category.color} p-6 rounded-3xl flex justify-between items-center card-shadow cursor-pointer active:scale-[0.99] transition-transform`}
                      onClick={() => onSelectActivity(activity, selectedDateKey)}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-2xl font-black uppercase">{activity.title}</span>
                        <div className="flex gap-1">
                          {DAYS.map(d => {
                            const isScheduled = activity.days.includes(d);
                            const isCompleted = activity.logs[getDateKeyForDayName(d)]?.completed;
                            return (
                              <div 
                                key={d} 
                                className={`w-3.5 h-2 rounded-full flex items-center justify-center transition-all ${
                                  isCompleted ? 'bg-app-text text-white' : 
                                  isScheduled ? 'border border-app-text/20 bg-transparent' : 
                                  'bg-app-text/5'
                                }`}
                              >
                                {isCompleted && <Check size={6} strokeWidth={4} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleActivity(activity.id, selectedDateKey);
                        }}
                        className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${
                          log.completed ? 'bg-white/40 border-transparent shadow-sm' : 'bg-transparent border-app-text/10'
                        }`}
                      >
                        {log.completed && <Check size={24} className="text-app-text" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4">
        <button 
          onClick={() => onCompleteDay(selectedDateKey)}
          className={`w-full py-6 rounded-3xl font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-3 ${
            isDayCompleted 
              ? 'bg-app-green text-white' 
              : 'bg-app-text text-white'
          }`}
        >
          {isDayCompleted ? (
            <>
              <Check size={24} />
              Day Completed
            </>
          ) : (
            'Complete Day'
          )}
        </button>
      </div>
    </motion.div>
  );
};

const CreateCategoryDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (cat: Omit<Category, 'id'>) => void;
  onDelete?: (id: string) => void;
  category?: Category | null;
}> = ({ isOpen, onClose, onSave, onDelete, category }) => {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('bg-app-blue');

  useEffect(() => {
    if (category) {
      setTitle(category.title);
      setIcon(category.icon);
      setColor(category.color);
    } else {
      setTitle('');
      setIcon('🎯');
      setColor('bg-app-blue');
    }
  }, [category, isOpen]);

  const handleDelete = () => {
    if (category && onDelete) {
      onDelete(category.id);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[120] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[130] p-8 pb-12 shadow-2xl max-w-md mx-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                {category ? 'Edit Category' : 'New Category'}
              </h3>
              <div className="flex items-center gap-2">
                {category && (
                  <button 
                    onClick={handleDelete}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Title</label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white rounded-2xl p-6 focus:ring-2 focus:ring-app-text outline-none font-medium text-lg card-shadow uppercase"
                  placeholder="Category Name"
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Icon</label>
                <div className="flex flex-wrap gap-3">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => setIcon(e)}
                      className={`text-2xl w-12 h-12 rounded-xl flex items-center justify-center transition-all ${icon === e ? 'bg-app-text scale-110 shadow-lg' : 'bg-white border border-black/5'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Color</label>
                <div className="flex gap-4">
                  {COLORS.map(c => (
                    <button
                      key={c.class}
                      onClick={() => setColor(c.class)}
                      className={`w-10 h-10 rounded-full transition-all ${c.class} ${color === c.class ? 'ring-4 ring-app-text ring-offset-2 scale-110' : 'opacity-60'}`}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  if (title.trim()) {
                    onSave({ title, icon, color });
                    setTitle('');
                    onClose();
                  }
                }}
                className="w-full bg-app-text text-white py-5 rounded-2xl mt-4 font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
              >
                {category ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const EditActivityDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  activity: Activity | null;
  onSave: (updates: Partial<Activity>) => void;
  onDelete?: (id: string) => void;
}> = ({ isOpen, onClose, activity, onSave, onDelete }) => {
  const [title, setTitle] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  useEffect(() => {
    if (activity) {
      setTitle(activity.title);
      setSelectedDays(activity.days);
    } else {
      setTitle('');
      setSelectedDays(['Monday']);
    }
  }, [activity, isOpen]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const dayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const handleDelete = () => {
    if (activity && onDelete) {
      onDelete(activity.id);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[80] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[90] p-8 pb-12 shadow-2xl max-w-md mx-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                {activity ? 'Edit Activity' : 'Create Activity'}
              </h3>
              <div className="flex items-center gap-2">
                {activity && (
                  <button 
                    onClick={handleDelete}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Activity Name</label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white rounded-2xl p-6 focus:ring-2 focus:ring-app-text outline-none font-medium text-lg card-shadow uppercase"
                  placeholder="Activity Title"
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Repeat</label>
                <div className="flex justify-between">
                  {DAYS.map((day, i) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                          isSelected 
                            ? 'bg-app-text text-white shadow-lg scale-110' 
                            : 'bg-white text-app-muted border border-app-text/5'
                        }`}
                      >
                        {dayInitials[i]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => {
                  onSave({ title, days: selectedDays });
                  onClose();
                }}
                className="w-full bg-app-text text-white py-5 rounded-2xl mt-4 font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
              >
                {activity ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const ActivityDetailsScreen: React.FC<{ 
  activity: Activity; 
  dateKey: string;
  onToggleSubTask: (activityId: string, subTaskId: string, dateKey: string) => void;
  onUpdateSubTask: (activityId: string, subTaskId: string, title: string) => void;
  onAddSubTask: (activityId: string, title: string) => void;
  onAddNote: (activityId: string, note: string, dateKey: string) => void;
  onUpdateDuration: (activityId: string, duration: number, dateKey: string) => void;
  onEditActivity: (activity: Activity) => void;
}> = ({ activity, dateKey, onToggleSubTask, onUpdateSubTask, onAddSubTask, onAddNote, onUpdateDuration, onEditActivity }) => {
  const [isNoteDrawerOpen, setIsNoteDrawerOpen] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState<SubTask | null>(null);
  const [isAddingSubTask, setIsAddingSubTask] = useState(false);

  const log = getLogForDate(activity, dateKey);

  const formatDuration = (mins: number) => {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs > 0) return `${hrs} hr ${m > 0 ? `${m} min` : ''}`;
    return `${m} min`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      {/* Duration Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-app-muted text-sm font-bold">
          <div className="flex items-center gap-2">
            <Clock size={20} />
            <span>Duration</span>
          </div>
          <span className="text-app-text uppercase">{formatDuration(log.duration || 0)}</span>
        </div>
        
        <div className="relative flex items-center py-4">
          <input
            type="range"
            min="0"
            max="180"
            step="1"
            value={log.duration || 0}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              onUpdateDuration(activity.id, val, dateKey);
            }}
            className="w-full h-1.5 bg-app-text/10 rounded-full appearance-none cursor-pointer accent-app-text relative z-10"
            style={{
              background: `linear-gradient(to right, #1A1A1A 0%, #1A1A1A ${(log.duration || 0) / 180 * 100}%, #E5E5E5 ${(log.duration || 0) / 180 * 100}%, #E5E5E5 100%)`
            }}
          />
        </div>
      </div>

      {/* Notes Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-app-muted text-sm font-bold">
          <MessageSquare size={20} />
          <span>Notes</span>
        </div>
        <div 
          className="flex items-start gap-4 cursor-pointer group"
          onClick={() => setIsNoteDrawerOpen(true)}
        >
          <div className="bg-white p-6 rounded-3xl card-shadow flex-1 min-h-[80px] flex items-center relative">
            {log.note ? (
              <p className="text-app-muted italic pr-8">{log.note}</p>
            ) : (
              <span className="text-app-muted/50 font-medium">Add your text</span>
            )}
            <div className="absolute right-6 text-app-text/20 group-hover:text-app-text/40 transition-colors">
              <Mic size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* List Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-app-muted text-sm font-bold">
          <List size={20} />
          <span>List</span>
        </div>
        <div className="space-y-4">
          {activity.subTasks.map(sub => {
            const isCompleted = log.subTaskStatus[sub.id] || false;
            return (
              <div key={sub.id} className="bg-white p-6 rounded-3xl flex justify-between items-center card-shadow">
                <span 
                  className="text-2xl font-black uppercase flex-1 cursor-pointer"
                  onClick={() => setEditingSubTask(sub)}
                >
                  {sub.title}
                </span>
                <button 
                  onClick={() => onToggleSubTask(activity.id, sub.id, dateKey)}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${isCompleted ? 'bg-app-text border-transparent shadow-sm' : 'bg-transparent border-app-text/10'}`}
                >
                  {isCompleted && <Check size={24} className="text-white" />}
                </button>
              </div>
            );
          })}
          
          <button 
            onClick={() => setIsAddingSubTask(true)}
            className="w-full bg-app-green/20 p-6 rounded-3xl flex justify-center items-center border-2 border-dashed border-app-text/10 hover:bg-app-green/30 transition-colors"
          >
            <Plus size={24} className="text-app-text/40" />
          </button>
        </div>
      </div>

      <NoteDrawer 
        isOpen={isNoteDrawerOpen}
        onClose={() => setIsNoteDrawerOpen(false)}
        initialValue={log.note || ''}
        onSave={(val) => onAddNote(activity.id, val, dateKey)}
        title="Edit Note"
      />

      <NoteDrawer 
        isOpen={!!editingSubTask}
        onClose={() => setEditingSubTask(null)}
        initialValue={editingSubTask?.title || ''}
        onSave={(val) => editingSubTask && onUpdateSubTask(activity.id, editingSubTask.id, val)}
        title="Edit Subtask"
        singleLine
      />

      <NoteDrawer 
        isOpen={isAddingSubTask}
        onClose={() => setIsAddingSubTask(false)}
        initialValue=""
        onSave={(val) => onAddSubTask(activity.id, val)}
        title="Add Subtask"
        singleLine
      />
    </motion.div>
  );
};

const NoteDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialValue: string;
  onSave: (value: string) => void;
  title: string;
  singleLine?: boolean;
}> = ({ isOpen, onClose, initialValue, onSave, title, singleLine }) => {
  const [text, setText] = useState(initialValue);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) setText(initialValue);
    return () => {
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [isOpen, initialValue]);

  const startListening = () => {
    if (isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    const baseText = text ? (text.endsWith(' ') ? text : text + ' ') : '';
    let sessionFinalText = '';

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = setTimeout(() => {
        stopListening();
      }, 120000); // 2 minutes
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let currentSessionFinal = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentSessionFinal += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      sessionFinalText += currentSessionFinal;
      setText(baseText + sessionFinalText + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    };

    isListeningRef.current = true;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[70] p-8 pb-12 shadow-2xl max-w-md mx-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">{title}</h3>
              <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="relative">
              {singleLine ? (
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSave(text);
                      onClose();
                    }
                  }}
                  className="w-full bg-white rounded-2xl p-6 pr-16 focus:ring-2 focus:ring-app-text outline-none font-medium text-lg card-shadow"
                  placeholder="Type here..."
                />
              ) : (
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full h-40 bg-white rounded-3xl p-6 pr-16 focus:ring-2 focus:ring-app-text outline-none resize-none font-medium text-lg card-shadow"
                  placeholder="How are you feeling today?"
                />
              )}
              
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startListening();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  stopListening();
                }}
                className={`absolute right-4 ${singleLine ? 'top-1/2 -translate-y-1/2' : 'top-6'} p-3 rounded-xl transition-all select-none touch-none ${isListening ? 'bg-app-green text-app-text animate-slow-pulse' : 'bg-app-bg text-app-text/40 hover:text-app-text hover:bg-black/5'}`}
                title="Hold to speak"
              >
                <Mic size={24} />
              </button>
            </div>

            <button
              onClick={() => {
                onSave(text);
                onClose();
              }}
              className="w-full bg-app-text text-white py-5 rounded-2xl mt-8 font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
            >
              Save
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const AIUpdateEditDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  update: AIUpdate;
  onSave: (updated: AIUpdate) => void;
}> = ({ isOpen, onClose, update, onSave }) => {
  const [duration, setDuration] = useState(update.duration || 0);
  const [note, setNote] = useState(update.note || '');
  const [title, setTitle] = useState(update.activityTitle);

  useEffect(() => {
    if (isOpen) {
      setDuration(update.duration || 0);
      setNote(update.note || '');
      setTitle(update.activityTitle);
    }
  }, [isOpen, update]);

  const formatDuration = (mins: number) => {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs > 0) return `${hrs} hr ${m > 0 ? `${m} min` : ''}`;
    return `${m} min`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[170] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[180] p-8 pb-12 shadow-2xl max-w-md mx-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-10">
              <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <ChevronLeft size={24} />
              </button>
              <h3 className="text-xl font-black uppercase tracking-tight">
                Edit Details ({update.day || DAYS[new Date().getDay()]})
              </h3>
              <div className="w-10"></div>
            </div>

            <div className="space-y-12">
              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Activity Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white rounded-2xl p-6 focus:ring-2 focus:ring-app-text outline-none font-medium text-lg card-shadow uppercase"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-app-muted text-sm font-bold">
                  <div className="flex items-center gap-2">
                    <Clock size={20} />
                    <span>Duration</span>
                  </div>
                  <span className="text-app-text uppercase">{formatDuration(duration)}</span>
                </div>
                <div className="relative flex items-center py-4">
                  <input
                    type="range"
                    min="0"
                    max="180"
                    step="1"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-app-text/10 rounded-full appearance-none cursor-pointer accent-app-text relative z-10"
                    style={{
                      background: `linear-gradient(to right, #1A1A1A 0%, #1A1A1A ${duration / 180 * 100}%, #E5E5E5 ${duration / 180 * 100}%, #E5E5E5 100%)`
                    }}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-app-muted text-sm font-bold">
                  <MessageSquare size={20} />
                  <span>Notes</span>
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-32 bg-white rounded-3xl p-6 focus:ring-2 focus:ring-app-text outline-none resize-none font-medium text-lg card-shadow"
                  placeholder="Add your text"
                />
              </div>

              <button
                onClick={() => {
                  onSave({ ...update, duration, note, activityTitle: title });
                  onClose();
                }}
                className="w-full bg-app-text text-white py-5 rounded-2xl font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const AIConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  updates: AIUpdate[];
  onConfirm: (verifiedUpdates: AIUpdate[]) => void;
  categories: Category[];
  activities: Activity[];
  transcript: string;
}> = ({ isOpen, onClose, updates, onConfirm, categories, activities, transcript }) => {
  const [verifiedUpdates, setVerifiedUpdates] = useState<AIUpdate[]>([]);
  const [editingUpdate, setEditingUpdate] = useState<AIUpdate | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Extra safety: deduplicate updates by activityId/title and day
      const unique = updates.reduce((acc: AIUpdate[], current) => {
        const x = acc.find(item => 
          (item.activityId === current.activityId && item.activityTitle === current.activityTitle) && 
          item.day === current.day
        );
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setVerifiedUpdates(unique);
    }
  }, [isOpen, updates]);

  const toggleUpdate = (id: string, title: string, day?: string) => {
    setVerifiedUpdates(prev => 
      prev.map(u => (u.activityId === id && u.activityTitle === title && u.day === day) ? { ...u, completed: !u.completed } : u)
    );
  };

  const handleSaveEdit = (updated: AIUpdate) => {
    setVerifiedUpdates(prev => 
      prev.map(u => (u.activityId === updated.activityId && u.activityTitle === updated.activityTitle && u.day === updated.day) ? updated : u)
    );
  };

  const todayDay = DAYS[new Date().getDay()];

  const groupedByDay = useMemo(() => {
    const dayGroups: { 
      [day: string]: { 
        existing: { [catId: string]: { category: Category; updates: AIUpdate[] } },
        new: AIUpdate[]
      } 
    } = {};
    
    verifiedUpdates.forEach(update => {
      const day = update.day || todayDay;
      if (!dayGroups[day]) dayGroups[day] = { existing: {}, new: [] };
      
      if (update.isNew) {
        dayGroups[day].new.push(update);
      } else {
        const activity = activities.find(a => a.id === update.activityId);
        const category = categories.find(c => c.id === activity?.categoryId) || { id: 'unknown', title: 'Other', icon: '❓', color: 'bg-white' };
        
        if (!dayGroups[day].existing[category.id]) {
          dayGroups[day].existing[category.id] = { category, updates: [] };
        }
        dayGroups[day].existing[category.id].updates.push(update);
      }
    });
    
    return dayGroups;
  }, [verifiedUpdates, activities, categories, todayDay]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[150] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[160] p-8 pb-12 shadow-2xl max-w-md mx-auto max-h-[85vh] overflow-y-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                Confirm Updates
              </h3>
              <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-10 mb-8">
              {Object.entries(groupedByDay).map(([day, groups]: [string, any]) => (
                <div key={day} className="space-y-6">
                  <p className="text-app-muted font-medium">
                    AI identified these activities from your dictation for <span className="text-app-text font-black uppercase">{day}</span>.
                  </p>

                  <div className="space-y-8">
                    {Object.values(groups.existing as any).map((group: any) => (
                      <div key={group.category.id} className="space-y-4">
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xl">{group.category.icon}</span>
                          <span className="text-xs font-black uppercase tracking-widest text-app-muted">{group.category.title}</span>
                        </div>
                        <div className="space-y-3">
                          {group.updates.map((update: any) => {
                            const activity = activities.find(a => a.id === update.activityId);
                            return (
                              <div 
                                key={update.activityId + (update.day || '')} 
                                className={`${group.category.color} p-6 rounded-3xl flex justify-between items-center card-shadow border border-black/5 cursor-pointer active:scale-[0.99] transition-transform`}
                                onClick={() => setEditingUpdate(update)}
                              >
                                <div className="flex flex-col gap-1 flex-1">
                                  <span className="text-2xl font-black uppercase block">
                                    {update.activityTitle}
                                  </span>
                                  <div className="flex items-center gap-4 mb-2">
                                    <div className="flex gap-1">
                                      {DAYS.map(d => {
                                        const isScheduled = activity?.days.includes(d);
                                        const isCompleted = d === day ? update.completed : activity?.logs[getDateKeyForDayName(d)]?.completed;
                                        return (
                                          <div 
                                            key={d} 
                                            className={`w-3.5 h-2 rounded-full flex items-center justify-center transition-all ${
                                              isCompleted ? 'bg-app-text text-white' : 
                                              isScheduled ? 'border border-app-text/20 bg-transparent' : 
                                              'bg-app-text/5'
                                            }`}
                                          >
                                            {isCompleted && <Check size={6} strokeWidth={4} />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {update.duration && (
                                      <div className="flex items-center gap-1 text-[10px] font-black uppercase text-app-text/40">
                                        <Clock size={10} />
                                        <span>{update.duration}m</span>
                                      </div>
                                    )}
                                  </div>
                                  {update.note && (
                                    <p className="text-[10px] font-bold text-app-text/30 truncate max-w-[220px] uppercase tracking-widest">
                                      {update.note}
                                    </p>
                                  )}
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleUpdate(update.activityId, update.activityTitle, update.day);
                                  }}
                                  className={`w-12 h-12 rounded-2xl border-2 border-app-text/10 flex items-center justify-center transition-all ${
                                    update.completed ? 'bg-white/40 border-transparent shadow-sm' : 'bg-transparent'
                                  }`}
                                >
                                  {update.completed && <Check size={28} className="text-app-text" />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {groups.new.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-2">
                          <span className="text-xl">✨</span>
                          <span className="text-xs font-black uppercase tracking-widest text-app-purple">New Activities Suggested</span>
                        </div>
                        <div className="space-y-3">
                          {(groups.new as any[]).map((update) => (
                            <div 
                              key={update.activityTitle + (update.day || '')} 
                              className="bg-app-purple/5 p-6 rounded-3xl flex justify-between items-center card-shadow border border-dashed border-app-purple/20 cursor-pointer active:scale-[0.99] transition-transform"
                              onClick={() => setEditingUpdate(update)}
                            >
                              <div className="flex flex-col gap-1 flex-1">
                                <span className="text-2xl font-black uppercase block text-app-purple">
                                  {update.activityTitle}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-app-purple/60">
                                    Suggested Category: {update.suggestedCategoryIcon} {update.suggestedCategoryName}
                                  </span>
                                </div>
                                {update.note && (
                                  <p className="text-[10px] font-bold text-app-text/30 truncate max-w-[220px] uppercase tracking-widest">
                                    {update.note}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-app-purple/10 flex items-center justify-center">
                                  <Plus size={24} className="text-app-purple" />
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleUpdate(update.activityId, update.activityTitle, update.day);
                                  }}
                                  className={`w-12 h-12 rounded-2xl border-2 border-app-purple/10 flex items-center justify-center transition-all ${
                                    update.completed ? 'bg-app-purple/20 border-transparent shadow-sm' : 'bg-transparent'
                                  }`}
                                >
                                  {update.completed && <Check size={28} className="text-app-purple" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {transcript && (
              <div className="mb-8 p-5 bg-app-purple/5 rounded-3xl border border-app-purple/10">
                <div className="flex items-center gap-2 mb-2 text-app-purple/60">
                  <MessageSquare size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">What you said</span>
                </div>
                <p className="text-sm italic text-app-text/80 leading-relaxed">
                  "{transcript}"
                </p>
              </div>
            )}

            <button
              onClick={() => {
                onConfirm(verifiedUpdates);
                onClose();
              }}
              className="w-full bg-app-text text-white py-5 rounded-2xl font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
            >
              Confirm & Save
            </button>
          </motion.div>
        </>
      )}

      {editingUpdate && (
        <AIUpdateEditDrawer 
          isOpen={!!editingUpdate}
          onClose={() => setEditingUpdate(null)}
          update={editingUpdate}
          onSave={handleSaveEdit}
        />
      )}
    </AnimatePresence>
  );
};

const ReopenDayModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  dayName: string;
}> = ({ isOpen, onClose, onConfirm, dayName }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[200] backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-app-bg rounded-[40px] z-[210] p-8 shadow-2xl overflow-hidden"
          >
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-app-purple/10 rounded-full flex items-center justify-center text-app-purple">
                <Clock size={40} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tight">Re-open {dayName}?</h3>
                <p className="text-app-muted font-medium text-sm leading-relaxed px-4">
                  This day is marked as completed. Would you like to re-open it to make changes?
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 pt-4">
                <button 
                  onClick={onConfirm}
                  className="w-full bg-app-text text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
                >
                  Yes, Re-open Day
                </button>
                <button 
                  onClick={onClose}
                  className="w-full bg-black/5 text-app-muted py-5 rounded-3xl font-black uppercase tracking-widest active:scale-[0.98] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const NewActivitiesCreationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  newUpdates: AIUpdate[];
  categories: Category[];
  onCreated: (newActivities: Activity[], newCategories: Category[]) => void;
}> = ({ isOpen, onClose, newUpdates, categories, onCreated }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [newCategoryTitle, setNewCategoryTitle] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('✨');
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);

  const currentUpdate = newUpdates[currentIndex];

  useEffect(() => {
    if (currentUpdate) {
      setTitle(currentUpdate.activityTitle);
      const existingCat = categories.find(c => c.title.toLowerCase() === currentUpdate.suggestedCategoryName?.toLowerCase());
      if (existingCat) {
        setSelectedCategoryId(existingCat.id);
        setIsCreatingNewCategory(false);
      } else {
        setIsCreatingNewCategory(true);
        setNewCategoryTitle(currentUpdate.suggestedCategoryName || '');
        setNewCategoryIcon(currentUpdate.suggestedCategoryIcon || '✨');
      }
    }
  }, [currentUpdate, categories]);

  const handleCreate = () => {
    let finalCategoryId = selectedCategoryId;
    const createdCategories: Category[] = [];
    
    if (isCreatingNewCategory && newCategoryTitle.trim()) {
      const newCat: Category = {
        id: 'cat_' + Date.now(),
        title: newCategoryTitle.trim(),
        icon: newCategoryIcon,
        color: COLORS[Math.floor(Math.random() * COLORS.length)].class
      };
      finalCategoryId = newCat.id;
      createdCategories.push(newCat);
    }

    const newActivity: Activity = {
      id: 'act_' + Date.now() + '_' + currentIndex,
      title: title.trim(),
      categoryId: finalCategoryId,
      days: [currentUpdate.day || DAYS[new Date().getDay()]],
      subTasks: [],
      logs: {
        [getDateKeyForDayName(currentUpdate.day || DAYS[new Date().getDay()])]: {
          completed: currentUpdate.completed,
          duration: currentUpdate.duration || 0,
          note: currentUpdate.note || '',
          subTaskStatus: {}
        }
      }
    };

    onCreated([newActivity], createdCategories);

    if (currentIndex < newUpdates.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && currentUpdate && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[200] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-app-bg rounded-t-[40px] z-[210] p-8 pb-12 shadow-2xl max-w-md mx-auto"
          >
            <div className="w-12 h-1.5 bg-app-text/10 rounded-full mx-auto mb-8"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">
                Create Activity {currentIndex + 1}/{newUpdates.length}
              </h3>
              <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Activity Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white rounded-2xl p-6 focus:ring-2 focus:ring-app-text outline-none font-medium text-lg card-shadow uppercase"
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-app-muted tracking-widest">Category</label>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          setIsCreatingNewCategory(false);
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                          !isCreatingNewCategory && selectedCategoryId === cat.id 
                            ? 'bg-app-text text-white shadow-md' 
                            : 'bg-white text-app-muted border border-app-text/5'
                        }`}
                      >
                        {cat.icon} {cat.title}
                      </button>
                    ))}
                    <button
                      onClick={() => setIsCreatingNewCategory(true)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                        isCreatingNewCategory 
                          ? 'bg-app-purple text-white shadow-md' 
                          : 'bg-app-purple/10 text-app-purple border border-app-purple/20'
                      }`}
                    >
                      + New Category
                    </button>
                  </div>

                  {isCreatingNewCategory && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 p-4 bg-app-purple/5 rounded-2xl border border-app-purple/10"
                    >
                      <div className="flex gap-3">
                        <input
                          value={newCategoryIcon}
                          onChange={(e) => setNewCategoryIcon(e.target.value)}
                          className="w-12 h-12 bg-white rounded-xl text-center text-xl card-shadow"
                          placeholder="Icon"
                        />
                        <input
                          value={newCategoryTitle}
                          onChange={(e) => setNewCategoryTitle(e.target.value)}
                          className="flex-1 bg-white rounded-xl px-4 font-bold uppercase text-sm card-shadow"
                          placeholder="Category Name"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              <button
                onClick={handleCreate}
                className="w-full bg-app-text text-white py-5 rounded-2xl font-black uppercase tracking-widest text-lg active:scale-[0.98] transition-transform shadow-lg"
              >
                {currentIndex < newUpdates.length - 1 ? 'Create & Next' : 'Create & Finish'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const WelcomeScreen: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  return (
    <div className="fixed inset-0 bg-[#FBF9F4] flex items-center justify-center z-[100] font-nunito overflow-hidden">
      <div className="w-full max-w-md h-full bg-[#FBF9F4] relative flex flex-col justify-center overflow-hidden border-8 border-white rounded-[40px] shadow-2xl">
        
        {/* Animated Icon Marquee */}
        <div className="flex flex-col gap-4 mb-16 mask-marquee">
          
          {/* Row 1 (Scrolling Left) */}
          <div className="flex w-[200%]">
            <div className="flex gap-4 px-2 animate-scroll-left">
              {['🎯', '🏃', '🧘', '📚', '🎨', '🍳'].map((emoji, i) => (
                <div key={i} className="w-[72px] h-[72px] bg-white rounded-[20px] flex items-center justify-center text-4xl shadow-sm shrink-0 hover:scale-110 hover:rotate-6 transition-transform">
                  {emoji}
                </div>
              ))}
            </div>
            <div className="flex gap-4 px-2 animate-scroll-left">
              {['🎯', '🏃', '🧘', '📚', '🎨', '🍳'].map((emoji, i) => (
                <div key={i} className="w-[72px] h-[72px] bg-white rounded-[20px] flex items-center justify-center text-4xl shadow-sm shrink-0 hover:scale-110 hover:rotate-6 transition-transform">
                  {emoji}
                </div>
              ))}
            </div>
          </div>

          {/* Row 2 (Scrolling Right) */}
          <div className="flex w-[200%]">
            <div className="flex gap-4 px-2 animate-scroll-right">
              {['🎸', '💻', '🌱', '🏠', '💼', '🚲'].map((emoji, i) => (
                <div key={i} className="w-[72px] h-[72px] bg-white rounded-[20px] flex items-center justify-center text-4xl shadow-sm shrink-0 hover:scale-110 hover:rotate-6 transition-transform">
                  {emoji}
                </div>
              ))}
            </div>
            <div className="flex gap-4 px-2 animate-scroll-right">
              {['🎸', '💻', '🌱', '🏠', '💼', '🚲'].map((emoji, i) => (
                <div key={i} className="w-[72px] h-[72px] bg-white rounded-[20px] flex items-center justify-center text-4xl shadow-sm shrink-0 hover:scale-110 hover:rotate-6 transition-transform">
                  {emoji}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="px-8 text-center">
          <h1 className="text-[40px] font-extrabold mb-4 tracking-tighter leading-[1.1]">Good Habits</h1>
          <p className="text-base font-semibold text-[#888888] mb-10 leading-relaxed">
            Consistency is key keep track of all the habits you want to create.
          </p>
        </div>

        {/* Call to Action */}
        <button 
          onClick={onGetStarted}
          className="bg-[#D9EF8B] text-[#1A1A1A] border-none rounded-3xl py-5 px-10 text-lg font-extrabold cursor-pointer mx-8 shadow-[0_8px_16px_rgba(217,239,139,0.4)] hover:translate-y-[-2px] hover:shadow-[0_12px_20px_rgba(217,239,139,0.6)] active:translate-y-[1px] active:shadow-[0_4px_8px_rgba(217,239,139,0.4)] transition-all"
        >
          Get Started
        </button>
      </div>
    </div>
  );
};

const JournalScreen: React.FC<{ entries: JournalEntry[] }> = ({ entries }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight uppercase">Journal</h1>
        <p className="text-app-muted font-medium">Your past voice transcripts and reflections.</p>
      </div>

      <div className="space-y-4">
        {entries.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl card-shadow text-center space-y-4">
            <div className="w-16 h-16 bg-app-bg rounded-full flex items-center justify-center mx-auto text-2xl">📖</div>
            <p className="text-sm text-app-muted font-bold uppercase tracking-widest">No journal entries yet</p>
            <p className="text-xs text-app-muted/60">Start recording your habits to see them here.</p>
          </div>
        ) : (
          entries.map((entry, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white p-6 rounded-3xl card-shadow border border-black/5 space-y-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-app-muted bg-app-bg px-3 py-1 rounded-full">
                  {new Date(entry.timestamp).toLocaleDateString(undefined, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <BookOpen size={14} className="text-app-purple" />
              </div>
              <p className="text-sm font-medium leading-relaxed text-app-text">
                "{entry.transcript}"
              </p>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

const StatisticsScreen: React.FC<{ 
  activities: Activity[], 
  categories: Category[], 
  onBack: () => void,
  onReorderCategories: (newOrder: Category[]) => void
}> = ({ activities, categories, onBack, onReorderCategories }) => {
  const [timeframe, setTimeframe] = useState<'Year' | 'Month' | 'Week'>('Week');

  const getWeekData = (catId: string) => {
    return DAYS.map(day => {
      const dateKey = getDateKeyForDayName(day);
      const catActivities = activities.filter(a => a.categoryId === catId && a.days.includes(day));
      const completed = catActivities.filter(a => a.logs[dateKey]?.completed);
      return { day, completed, total: catActivities.length };
    });
  };

  const getMonthData = (catId: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dateKey = date.toISOString().split('T')[0];
      const dayName = DAYS[date.getDay()];
      
      const catActivities = activities.filter(a => a.categoryId === catId && a.days.includes(dayName));
      const completedCount = catActivities.filter(a => a.logs[dateKey]?.completed).length;
      const totalCount = catActivities.length;
      
      data.push({
        day: i,
        percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : null
      });
    }
    return data;
  };

  const getYearData = (catId: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return months.map((monthName, monthIndex) => {
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      let totalScheduled = 0;
      let totalCompleted = 0;

      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, monthIndex, i);
        const dateKey = date.toISOString().split('T')[0];
        const dayName = DAYS[date.getDay()];
        
        const catActivities = activities.filter(a => a.categoryId === catId && a.days.includes(dayName));
        totalScheduled += catActivities.length;
        totalCompleted += catActivities.filter(a => a.logs[dateKey]?.completed).length;
      }

      return {
        month: monthName,
        percentage: totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 0
      };
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-black/5 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-3xl font-black tracking-tight uppercase">statistics</h1>
        </div>
        <div className="flex gap-4">
          {(['Year', 'Month', 'Week'] as const).map(t => (
            <button 
              key={t} 
              onClick={() => setTimeframe(t)}
              className={`px-4 py-1 rounded-full text-sm font-bold transition-all ${timeframe === t ? 'bg-app-green text-app-text' : 'bg-app-green/20 text-app-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <Reorder.Group axis="y" values={categories} onReorder={onReorderCategories} className="space-y-6">
        {categories.map(cat => {
          const weekData = getWeekData(cat.id);
          const monthData = getMonthData(cat.id);
          const yearData = getYearData(cat.id);
          
          // Calculate overall percentage for display
          let overallPercentage = 0;
          if (timeframe === 'Week') {
            const total = weekData.reduce((acc, d) => acc + d.total, 0);
            const completed = weekData.reduce((acc, d) => acc + d.completed.length, 0);
            overallPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
          } else if (timeframe === 'Month') {
            const validDays = monthData.filter(d => d.percentage !== null);
            overallPercentage = validDays.length > 0 ? Math.round(validDays.reduce((acc, d) => acc + (d.percentage || 0), 0) / validDays.length) : 0;
          } else {
            overallPercentage = Math.round(yearData.reduce((acc, d) => acc + d.percentage, 0) / 12);
          }

          return (
            <Reorder.Item 
              key={cat.id} 
              value={cat}
              className={`${cat.color} p-6 rounded-3xl card-shadow overflow-hidden cursor-grab active:cursor-grabbing`}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="font-black uppercase tracking-tight text-lg">{cat.title}</span>
                </div>
                <GripVertical className="text-black/20" size={20} />
              </div>

              <div className="h-48 w-full">
                {timeframe === 'Week' ? (
                  <div className="flex justify-between items-end h-full gap-2">
                    {weekData.map((data, i) => (
                      <div key={data.day} className="flex flex-col items-center flex-1 gap-2 h-full justify-end">
                        <div className="flex flex-col-reverse gap-1.5 w-full">
                          {data.completed.map((act, idx) => (
                            <motion.div 
                              key={act.id}
                              initial={{ scale: 0, y: 10 }}
                              animate={{ scale: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="w-full h-2 bg-app-text rounded-full flex items-center justify-center shadow-sm"
                            >
                              <Check size={8} className="text-white" strokeWidth={6} />
                            </motion.div>
                          ))}
                          {data.total > data.completed.length && Array.from({ length: data.total - data.completed.length }).map((_, idx) => (
                            <div 
                              key={idx} 
                              className="w-full h-2 rounded-full border border-black/20 bg-transparent" 
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-black text-app-text/60 uppercase">{data.day.substring(0, 3)}</span>
                      </div>
                    ))}
                  </div>
                ) : timeframe === 'Month' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthData}>
                      <Line 
                        type="monotone" 
                        dataKey="percentage" 
                        stroke="#1A1A1A" 
                        strokeWidth={4} 
                        dot={{ r: 4, fill: '#1A1A1A' }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 900 }}
                        interval={4}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', fontWeight: 900 }}
                        formatter={(value: number) => [`${Math.round(value)}%`, 'Completion']}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearData}>
                      <Line 
                        type="monotone" 
                        dataKey="percentage" 
                        stroke="#1A1A1A" 
                        strokeWidth={4} 
                        dot={{ r: 4, fill: '#1A1A1A' }}
                        activeDot={{ r: 6 }}
                      />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 900 }}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', fontWeight: 900 }}
                        formatter={(value: number) => [`${Math.round(value)}%`, 'Completion']}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('app_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });
  const [activities, setActivities] = useState<Activity[]>(() => {
    const saved = localStorage.getItem('app_activities');
    return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
  });
  const [view, setView] = useState<{ type: 'home' | 'list' | 'details' | 'stats' | 'settings' | 'overview' | 'journal', data?: any }>({ type: 'home' });
  const [settingsSubView, setSettingsSubView] = useState<'menu' | 'cloud' | 'prompt' | 'data' | 'system' | 'journal'>('menu');
  const [currentTab, setCurrentTab] = useState('home');
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [pendingAIUpdates, setPendingAIUpdates] = useState<AIUpdate[]>([]);
  const [lastTranscript, setLastTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [serverConfig, setServerConfig] = useState<{ hasClientId: boolean; hasClientSecret: boolean } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [aiSystemPrompt, setAiSystemPrompt] = useState<string>(localStorage.getItem('ai_system_prompt') || DEFAULT_AI_PROMPT);

  const recognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const shouldProcessRef = useRef<boolean>(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activityToEdit, setActivityToEdit] = useState<Activity | null>(null);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);

  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [newActivitiesToCreate, setNewActivitiesToCreate] = useState<AIUpdate[]>([]);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [dayToReopen, setDayToReopen] = useState<{ key: string, name: string } | null>(null);
  const [completedDays, setCompletedDays] = useState<string[]>(() => {
    const saved = localStorage.getItem('completed_days');
    return saved ? JSON.parse(saved) : [];
  });
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('app_journal');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('completed_days', JSON.stringify(completedDays));
  }, [completedDays]);

  useEffect(() => {
    localStorage.setItem('app_journal', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('app_categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('app_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    // Check server health and config - use relative path for better reliability
    fetch(`/api/health?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return res.json();
        }
        throw new Error(`Non-JSON: ${res.status}`);
      })
      .then(data => {
        if (data.config) {
          setServerConfig(data.config);
          setConnectionError(null);
        }
      })
      .catch(err => {
        // Silent catch - we don't want to break the app if health check fails
        console.warn("Status check failed (silent):", err.message);
        setConnectionError(err.message);
      });

    // Load tokens from localStorage if available
    const savedTokens = localStorage.getItem('google_tokens');
    if (savedTokens) {
      const tokens = JSON.parse(savedTokens);
      setGoogleTokens(tokens);
      setIsSheetsConnected(true);
      fetchJournalEntries(tokens);
      // We don't have the spreadsheet URL yet, but the first sync will get it
    }
    
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Debounced auto-sync
  useEffect(() => {
    if (!isSheetsConnected || !googleTokens) return;
    
    const timeoutId = setTimeout(() => {
      syncToSheets(null, true);
    }, 5000); // 5s debounce
    
    return () => clearTimeout(timeoutId);
  }, [activities, categories, isSheetsConnected, googleTokens]);

  const fetchJournalEntries = async (tokensOverride?: any) => {
    const tokens = tokensOverride || googleTokens;
    if (!tokens) return;

    try {
      const res = await fetch(`${window.location.origin}/api/sheets/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens })
      });
      const data = await res.json();
      if (res.ok && data.journal) {
        const newJournal: JournalEntry[] = [];
        if (data.journal.length > 1) {
          for (let i = 1; i < data.journal.length; i++) {
            const [timestamp, transcript] = data.journal[i];
            if (timestamp && transcript) {
              newJournal.push({ timestamp, transcript });
            }
          }
        }
        // Show newest first
        setJournalEntries(newJournal.reverse());
      }
    } catch (e) {
      console.error("Failed to fetch journal entries:", e);
    }
  };

  const handleOAuthMessage = async (event: MessageEvent) => {
    // Basic origin check for security
    if (!event.origin.includes('run.app') && !event.origin.includes('localhost')) return;

    if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
      console.log("OAuth success message received with tokens");
      const tokens = event.data.tokens;
      setGoogleTokens(tokens);
      setIsSheetsConnected(true);
      localStorage.setItem('google_tokens', JSON.stringify(tokens));
      
      // Trigger sync immediately with the new tokens
      syncToSheets(tokens);
      fetchJournalEntries(tokens);
      alert("Successfully connected to Google Sheets!");
    }
  };

  const handleLogout = () => {
    setGoogleTokens(null);
    setIsSheetsConnected(false);
    localStorage.removeItem('google_tokens');
    setView({ type: 'home' });
  };

  const connectSheets = async () => {
    try {
      const authUrlEndpoint = `${window.location.origin}/api/auth/google/url`;
      console.log("Fetching auth URL from:", authUrlEndpoint);
      
      const res = await fetch(authUrlEndpoint);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status}. ${text.substring(0, 50)}`);
      }
      
      const data = await res.json();
      const url = data.url;
      
      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        throw new Error("Server returned an invalid authentication URL.");
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      console.log("Device detected as mobile:", isMobile);
      
      if (isMobile) {
        // Direct redirect for mobile to avoid all popup/window.open issues
        console.log("Redirecting to Google Auth...");
        window.location.href = url;
      } else {
        // Popup flow for desktop
        console.log("Opening OAuth popup...");
        const windowName = 'googleauth';
        const popup = window.open(url, windowName, 'width=600,height=700');
        
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          if (window.confirm("Popup was blocked. Would you like to redirect to the login page instead?")) {
            window.location.href = url;
          }
        }
      }
    } catch (e: any) {
      console.error("OAuth Connection Error:", e);
      alert(`Connection failed: ${e.message || 'Unknown error'}`);
    }
  };

  const handleStartDictation = () => {
    if (isRecording || isProcessingAI) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true; // Keep it continuous so it doesn't stop on pause
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      isRecordingRef.current = true;
      shouldProcessRef.current = false;
      setInterimTranscript('');
      
      // Set 2 minute timeout
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = setTimeout(() => {
        handleStopDictation();
      }, 120000); // 2 minutes
    };

    recognition.onresult = async (event: any) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      
      if (interim) {
        setInterimTranscript(interim);
      }

      if (final) {
        console.log("Final Transcript (partial):", final);
        transcriptRef.current += ' ' + final;
        setLastTranscript(transcriptRef.current);
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
      isRecordingRef.current = false;
      shouldProcessRef.current = false;
      if (event.error !== 'no-speech') {
        alert(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = async () => {
      setIsRecording(false);
      isRecordingRef.current = false;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);

      if (shouldProcessRef.current) {
        shouldProcessRef.current = false;
        const finalFullTranscript = transcriptRef.current.trim();
        console.log("Processing full transcript on end:", finalFullTranscript);
        if (finalFullTranscript) {
          if (isSheetsConnected && googleTokens) {
            setJournalEntries(prev => [{ timestamp: new Date().toISOString(), transcript: finalFullTranscript }, ...prev]);
            fetch(`${window.location.origin}/api/sheets/log-transcript`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: finalFullTranscript, tokens: googleTokens })
            })
            .then(() => fetchJournalEntries())
            .catch(err => console.error("Failed to log transcript", err));
          }

          setIsProcessingAI(true);
          try {
            const rawUpdates = await processDictation(finalFullTranscript, activities, aiSystemPrompt);
            console.log("AI Updates:", rawUpdates);
            
            // Deduplicate updates by activityId
            const uniqueUpdates = rawUpdates.reduce((acc: AIUpdate[], current) => {
              const x = acc.find(item => item.activityId === current.activityId);
              if (!x) {
                return acc.concat([current]);
              } else {
                return acc;
              }
            }, []);

            if (uniqueUpdates.length > 0) {
              setPendingAIUpdates(uniqueUpdates);
            } else {
              alert("AI couldn't identify any activities. Try being more specific!");
            }
          } catch (error) {
            console.error("AI processing failed", error);
            alert("AI processing failed. Please try again.");
          } finally {
            setIsProcessingAI(false);
          }
        }
      }
    };

    setLastTranscript('');
    transcriptRef.current = '';
    isRecordingRef.current = true; // Set immediately to catch early releases
    recognition.start();
  };

  const handleStopDictation = () => {
    if (recognitionRef.current && isRecordingRef.current) {
      shouldProcessRef.current = true;
      recognitionRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    }
  };

  const handleConfirmAIUpdates = (verifiedUpdates: AIUpdate[]) => {
    const todayDay = DAYS[new Date().getDay()];

    // Separate existing and new
    const existingUpdates = verifiedUpdates.filter(u => !u.isNew);
    const newUpdates = verifiedUpdates.filter(u => u.isNew);

    if (existingUpdates.length > 0) {
      setActivities(prev => prev.map(activity => {
        const updatesForActivity = existingUpdates.filter(u => u.activityId === activity.id);

        if (updatesForActivity.length > 0) {
          let updatedActivity = { ...activity };
          
          updatesForActivity.forEach(update => {
            const targetDay = update.day || todayDay;
            const targetKey = getDateKeyForDayName(targetDay);
            const currentLog = getLogForDate(updatedActivity, targetKey);
            
            updatedActivity = {
              ...updatedActivity,
              days: updatedActivity.days.includes(targetDay) ? updatedActivity.days : [...updatedActivity.days, targetDay],
              logs: {
                ...updatedActivity.logs,
                [targetKey]: {
                  ...currentLog,
                  completed: update.completed,
                  duration: update.duration || currentLog.duration,
                  note: update.note ? (currentLog.note ? `${currentLog.note}\n${update.note}` : update.note) : currentLog.note
                }
              }
            };
          });
          
          return updatedActivity;
        }
        return activity;
      }));
    }

    if (newUpdates.length > 0) {
      setNewActivitiesToCreate(newUpdates);
    }

    setPendingAIUpdates([]);
  };

  const syncToSheets = async (tokensOverride?: any, silent = false) => {
    const tokens = tokensOverride || googleTokens;
    if (!tokens) {
      if (!silent) console.log("Cannot sync: No tokens available");
      return;
    }

    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Enrich activities with category titles for the spreadsheet
      const enrichedActivities = activities.map(a => ({
        ...a,
        category: categories.find(c => c.id === a.categoryId)?.title || 'Uncategorized'
      }));
      
      console.log(`[SYNC] Sending ${enrichedActivities.length} activities to server`);
      console.log(`[SYNC] Sample activity:`, enrichedActivities[0]);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const syncUrl = `${window.location.origin}/api/sheets/sync`;
      console.log("Syncing to:", syncUrl);
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: enrichedActivities, tokens }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || 'Sync failed');
        }
        if (data.url) {
          const isActuallyNew = data.isNewFile && spreadsheetUrl && spreadsheetUrl !== data.url;
          setSpreadsheetUrl(data.url);
          setLastSynced(new Date().toLocaleTimeString());
          console.log("Sync successful, URL:", data.url);
          
          if (isActuallyNew) {
            alert("⚠️ Source Spreadsheet Not Found: The previous spreadsheet was missing or deleted. A new one has been created to ensure your data is safe.");
          }
        }
      } else {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text.substring(0, 200));
        throw new Error(`Server returned ${res.status} ${res.statusText}. Please check server logs.`);
      }
    } catch (e: any) {
      console.error("Failed to sync to sheets:", e.message);
      if (!silent) {
        alert(`Sync failed: ${e.message}. Please try connecting again.`);
      }
      if (e.message.includes('authenticated') || e.message.includes('invalid_grant')) {
        setIsSheetsConnected(false);
        setGoogleTokens(null);
        localStorage.removeItem('google_tokens');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCompleteDay = (dateKey: string) => {
    const isCompleted = completedDays.includes(dateKey);
    if (isCompleted) {
      const dayName = DAYS.find(d => getDateKeyForDayName(d) === dateKey) || 'this day';
      setDayToReopen({ key: dateKey, name: dayName });
      setIsReopenModalOpen(true);
    } else {
      setCompletedDays(prev => [...prev, dateKey]);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#000000', '#5A5A40', '#E6E6E6']
      });
    }
  };

  const checkDayCompletion = (dateKey: string) => {
    if (completedDays.includes(dateKey)) {
      const dayName = DAYS.find(d => getDateKeyForDayName(d) === dateKey) || 'this day';
      setDayToReopen({ key: dateKey, name: dayName });
      setIsReopenModalOpen(true);
      return false;
    }
    return true;
  };

  const handleToggleActivity = (id: string, dateKey: string) => {
    if (!completedDays.includes(dateKey) || checkDayCompletion(dateKey)) {
      if (completedDays.includes(dateKey)) {
        setCompletedDays(prev => prev.filter(d => d !== dateKey));
      }
      setActivities(prev => prev.map(a => {
        if (a.id === id) {
          const log = getLogForDate(a, dateKey);
          return {
            ...a,
            logs: {
              ...a.logs,
              [dateKey]: { ...log, completed: !log.completed }
            }
          };
        }
        return a;
      }));
    }
  };

  const handleToggleSubTask = (activityId: string, subTaskId: string, dateKey: string) => {
    if (!completedDays.includes(dateKey) || checkDayCompletion(dateKey)) {
      if (completedDays.includes(dateKey)) {
        setCompletedDays(prev => prev.filter(d => d !== dateKey));
      }
      setActivities(prev => prev.map(a => {
        if (a.id === activityId) {
          const log = getLogForDate(a, dateKey);
          const newStatus = !log.subTaskStatus[subTaskId];
          return {
            ...a,
            logs: {
              ...a.logs,
              [dateKey]: {
                ...log,
                completed: newStatus ? true : log.completed,
                subTaskStatus: {
                  ...log.subTaskStatus,
                  [subTaskId]: newStatus
                }
              }
            }
          };
        }
        return a;
      }));
    }
  };

  const handleUpdateSubTask = (activityId: string, subTaskId: string, title: string) => {
    setActivities(prev => prev.map(a => {
      if (a.id === activityId) {
        return {
          ...a,
          subTasks: a.subTasks.map(s => s.id === subTaskId ? { ...s, title } : s)
        };
      }
      return a;
    }));
  };

  const handleAddSubTask = (activityId: string, title: string) => {
    if (!title.trim()) return;
    setActivities(prev => prev.map(a => {
      if (a.id === activityId) {
        return {
          ...a,
          subTasks: [...a.subTasks, { id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, title }]
        };
      }
      return a;
    }));
  };

  const handleAddNote = (activityId: string, note: string, dateKey: string) => {
    if (!completedDays.includes(dateKey) || checkDayCompletion(dateKey)) {
      if (completedDays.includes(dateKey)) {
        setCompletedDays(prev => prev.filter(d => d !== dateKey));
      }
      setActivities(prev => prev.map(a => {
        if (a.id === activityId) {
          const log = getLogForDate(a, dateKey);
          return {
            ...a,
            logs: {
              ...a.logs,
              [dateKey]: { 
                ...log, 
                note,
                completed: note.trim().length > 0 ? true : log.completed
              }
            }
          };
        }
        return a;
      }));
    }
  };

  const handleUpdateActivity = (activityId: string, updates: Partial<Activity>) => {
    setActivities(prev => prev.map(a => a.id === activityId ? { ...a, ...updates } : a));
  };

  const handleDeleteActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
    setIsEditModalOpen(false);
    if (view.type === 'details') {
      const category = categories.find(c => c.id === view.data.activity.categoryId);
      navigateTo('list', category);
    }
  };

  const handleCreateCategory = (cat: Omit<Category, 'id'>) => {
    const newCat: Category = {
      ...cat,
      id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    setCategories(prev => [...prev, newCat]);
  };

  const handleUpdateCategory = (id: string, updates: Partial<Category>) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDeleteCategory = (id: string) => {
    if (window.confirm('Are you sure you want to delete this category? All activities within it will also be deleted.')) {
      setCategories(prev => prev.filter(c => c.id !== id));
      setActivities(prev => prev.filter(a => a.categoryId !== id));
      navigateTo('home');
      setIsCategoryModalOpen(false);
    }
  };

  const handleDeleteHistory = async () => {
    console.log("Deleting history...");
    
    // 1. Clear local state
    setCategories([]);
    setActivities([]);
    setCompletedDays([]);
    localStorage.removeItem('completed_days');
    localStorage.removeItem('app_categories');
    localStorage.removeItem('app_activities');

    // 2. Clear spreadsheet if connected
    if (googleTokens) {
      setIsSyncing(true);
      try {
        const res = await fetch(`${window.location.origin}/api/sheets/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: googleTokens })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to clear spreadsheet data");
        setLastSynced(null);
      } catch (e: any) {
        console.error("Error clearing spreadsheet:", e);
        alert(`Local data deleted, but spreadsheet clear failed: ${e.message}`);
      } finally {
        setIsSyncing(false);
      }
    }

    navigateTo('home');
    alert('History has been deleted locally and cleared from the spreadsheet.');
  };

  const handleImportFromSheets = async () => {
    if (!googleTokens) {
      alert("Please connect to Google Sheets first.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch(`${window.location.origin}/api/sheets/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: googleTokens })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch data");

      const { goals, logs, journal } = data;
      if (!goals || goals.length <= 1) {
        alert("No data found in the spreadsheet to import.");
        return;
      }

      // Reconstruct activities
      const newActivities: Activity[] = [];
      const inferredCategories: Category[] = [...categories];

      // Skip header: ID, Title, Category, Days
      for (let i = 1; i < goals.length; i++) {
        const [id, title, categoryTitle, daysStr] = goals[i];
        if (!id) continue;

        let cat = inferredCategories.find(c => c.title === categoryTitle);
        if (!cat) {
          cat = {
            id: `cat_${Date.now()}_${i}`,
            title: categoryTitle || 'Uncategorized',
            icon: '📁',
            color: 'bg-app-purple'
          };
          inferredCategories.push(cat);
        }

        newActivities.push({
          id,
          title,
          categoryId: cat.id,
          days: daysStr ? daysStr.split(',').map((s: string) => s.trim()) : [],
          logs: {},
          subTasks: []
        });
      }

      // Reconstruct logs: Date, Activity ID, Title, Category, Completed, Duration (min), Note, Subtasks Status
      for (let i = 1; i < logs.length; i++) {
        const [date, activityId, , , completed, duration, note, subtasksStatus] = logs[i];
        const activity = newActivities.find(a => a.id === activityId);
        if (activity) {
          const currentSubTaskStatus: Record<string, boolean> = {};
          
          if (subtasksStatus) {
            subtasksStatus.split('|').forEach((t: string) => {
              const parts = t.split(':');
              if (parts.length === 2) {
                const title = parts[0].trim();
                const isCompleted = parts[1].trim() === 'DONE';
                
                let subTask = activity.subTasks.find(st => st.title === title);
                if (!subTask) {
                  subTask = {
                    id: `st_${Date.now()}_${Math.random()}`,
                    title
                  };
                  activity.subTasks.push(subTask);
                }
                currentSubTaskStatus[subTask.id] = isCompleted;
              }
            });
          }

          activity.logs[date] = {
            completed: completed === 'TRUE',
            duration: parseInt(duration) || 0,
            note: note || '',
            subTaskStatus: currentSubTaskStatus
          };
        }
      }

      // Reconstruct journal: Timestamp, Transcript
      const newJournal: JournalEntry[] = [];
      if (journal && journal.length > 1) {
        for (let i = 1; i < journal.length; i++) {
          const [timestamp, transcript] = journal[i];
          if (timestamp && transcript) {
            newJournal.push({ timestamp, transcript });
          }
        }
      }

      setCategories(inferredCategories);
      setActivities(newActivities);
      setJournalEntries(newJournal);
      alert("Import successful! Your local data has been updated from the spreadsheet.");
    } catch (e: any) {
      alert(`Import Error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!googleTokens) {
      alert("Please connect to Google Sheets first.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch(`${window.location.origin}/api/sheets/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: googleTokens })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete cloud data");
      
      setSpreadsheetUrl(null);
      setLastSynced(null);
      alert(data.message || "Cloud file deleted successfully.");
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoadPresets = async () => {
    console.log("handleLoadPresets started");
    setIsSyncing(true);
    try {
      // 1. Delete History first (clears local and cloud)
      console.log("Clearing local data...");
      
      setCategories([]);
      setActivities([]);
      setCompletedDays([]);
      localStorage.removeItem('completed_days');
      localStorage.removeItem('app_categories');
      localStorage.removeItem('app_activities');

      if (googleTokens) {
        console.log("Clearing spreadsheet data...");
        const res = await fetch(`${window.location.origin}/api/sheets/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: googleTokens })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Spreadsheet clear failed:", errData);
          // We continue anyway to load local presets, but notify the user
          alert(`Note: Local data cleared, but spreadsheet clear failed: ${errData.error || res.statusText}`);
        } else {
          console.log("Spreadsheet cleared successfully");
        }
        setLastSynced(null);
      }

      // 2. Load Presets
      console.log("Generating preset data...");
      const timestamp = Date.now();
      const nutritionId = `cat_${timestamp}_nut`;
      const movementId = `cat_${timestamp}_mov`;
      const learningsId = `cat_${timestamp}_lrn`;

      const newCategories: Category[] = [
        { id: nutritionId, title: 'Nutrition', icon: '🍳', color: 'bg-app-orange' },
        { id: movementId, title: 'Movement', icon: '🏃', color: 'bg-app-blue' },
        { id: learningsId, title: 'Learnings', icon: '📚', color: 'bg-app-green' },
      ];

      const newActivities: Activity[] = [
        // Nutrition
        { 
          id: `act_${timestamp}_n1`, 
          categoryId: nutritionId, 
          title: 'Healthy Breakfast', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_n1_1`, title: 'Protein source' },
            { id: `st_${timestamp}_n1_2`, title: 'Fiber/Greens' }
          ] 
        },
        { 
          id: `act_${timestamp}_n2`, 
          categoryId: nutritionId, 
          title: 'Hydration Goal', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_n2_1`, title: '2L Water' }
          ] 
        },
        { 
          id: `act_${timestamp}_n3`, 
          categoryId: nutritionId, 
          title: 'Meal Prep', 
          days: ['Sunday', 'Wednesday'], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_n3_1`, title: 'Plan menu' },
            { id: `st_${timestamp}_n3_2`, title: 'Grocery shop' }
          ] 
        },
        // Movement
        { 
          id: `act_${timestamp}_m1`, 
          categoryId: movementId, 
          title: 'Morning Stretch', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_m1_1`, title: 'Neck & Shoulders' },
            { id: `st_${timestamp}_m1_2`, title: 'Lower Back' }
          ] 
        },
        { 
          id: `act_${timestamp}_m2`, 
          categoryId: movementId, 
          title: 'Daily Walk', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_m2_1`, title: '30 mins' }
          ] 
        },
        { 
          id: `act_${timestamp}_m3`, 
          categoryId: movementId, 
          title: 'Strength Training', 
          days: ['Monday', 'Wednesday', 'Friday'], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_m3_1`, title: 'Warm up' },
            { id: `st_${timestamp}_m3_2`, title: 'Main set' }
          ] 
        },
        // Learnings
        { 
          id: `act_${timestamp}_l1`, 
          categoryId: learningsId, 
          title: 'Read 20 Pages', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [] 
        },
        { 
          id: `act_${timestamp}_l2`, 
          categoryId: learningsId, 
          title: 'Skill Practice', 
          days: ['Tuesday', 'Thursday', 'Saturday'], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_l2_1`, title: 'Focus work' }
          ] 
        },
        { 
          id: `act_${timestamp}_l3`, 
          categoryId: learningsId, 
          title: 'Journaling', 
          days: [...DAYS], 
          logs: {}, 
          subTasks: [
            { id: `st_${timestamp}_l3_1`, title: 'Reflect on day' }
          ] 
        },
      ];

      setCategories(newCategories);
      setActivities(newActivities);
      
      console.log("Presets loaded, navigating home...");
      navigateTo('home');
      alert('History cleared and pre-set records loaded successfully!');
    } catch (e: any) {
      console.error("Error loading presets:", e);
      alert(`Failed to load presets: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateActivity = (activity: Omit<Activity, 'id' | 'logs' | 'subTasks'>) => {
    const newActivity: Activity = {
      ...activity,
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      subTasks: [],
      logs: {}
    };
    setActivities(prev => [...prev, newActivity]);
  };

  const handleUpdateDuration = (activityId: string, duration: number, dateKey: string) => {
    if (!completedDays.includes(dateKey) || checkDayCompletion(dateKey)) {
      if (completedDays.includes(dateKey)) {
        setCompletedDays(prev => prev.filter(d => d !== dateKey));
      }
      setActivities(prev => prev.map(a => {
        if (a.id === activityId) {
          const log = getLogForDate(a, dateKey);
          return {
            ...a,
            logs: {
              ...a.logs,
              [dateKey]: { 
                ...log, 
                duration,
                completed: duration > 0 ? true : log.completed
              }
            }
          };
        }
        return a;
      }));
    }
  };

  // Auto-sync effect
  useEffect(() => {
    if (isSheetsConnected && googleTokens) {
      const timer = setTimeout(() => {
        syncToSheets();
      }, 1000); // Debounce sync
      return () => clearTimeout(timer);
    }
  }, [activities, isSheetsConnected]);

  const navigateTo = (type: 'home' | 'list' | 'details' | 'stats' | 'settings' | 'overview' | 'journal', data?: any) => {
    if (type === 'journal') {
      setView({ type: 'settings', data });
      setCurrentTab('settings');
      setSettingsSubView('journal');
      return;
    }
    setView({ type, data });
    if (type === 'settings') {
      setCurrentTab('settings');
      setSettingsSubView('menu');
    }
    else if (type === 'stats') setCurrentTab('stats');
    else if (type === 'home') setCurrentTab('home');
    else if (type === 'overview') setCurrentTab('overview');
  };

  const handleBack = () => {
    if (view.type === 'settings' && settingsSubView !== 'menu') {
      setSettingsSubView('menu');
      return;
    }
    
    if (view.type === 'details') {
      const category = categories.find(c => c.id === view.data.activity.categoryId);
      navigateTo('list', category);
    }
    else if (view.type === 'list') navigateTo('home');
    else if (view.type === 'stats') navigateTo('home');
    else if (view.type === 'settings') navigateTo('home');
    else if (view.type === 'overview') navigateTo('home');
    else if (view.type === 'journal') navigateTo('home');
  };

  if (!googleTokens) {
    return <WelcomeScreen onGetStarted={connectSheets} />;
  }

  return (
    <Layout 
      currentTab={currentTab} 
      onTabChange={(tab) => {
        if (tab === 'home') navigateTo('home');
        if (tab === 'overview') navigateTo('overview');
        if (tab === 'stats') navigateTo('stats');
        if (tab === 'journal') navigateTo('journal');
        if (tab === 'settings') navigateTo('settings');
      }}
      onBack={view.type !== 'home' ? handleBack : undefined}
      title={
        view.type === 'list' ? view.data.title : 
        view.type === 'details' ? (() => {
          const activity = activities.find(a => a.id === view.data.activity.id);
          const dateKey = view.data.dateKey;
          const log = activity ? getLogForDate(activity, dateKey) : null;
          const cat = categories.find(c => c.id === view.data.activity.categoryId);
          return (
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
              <span className="text-app-muted">{cat?.title}</span>
              <span className="text-app-muted/30 mx-1">&gt;</span>
              <span>{view.data.activity.title}</span>
              {activity && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleActivity(activity.id, dateKey);
                  }}
                  className={`ml-2 w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all ${log?.completed ? `${cat?.color || 'bg-app-green'} border-transparent shadow-sm` : 'border-app-text/10 bg-transparent'}`}
                >
                  {log?.completed && <Check size={24} className="text-app-text" />}
                </button>
              )}
            </div>
          );
        })() : 
        view.type === 'stats' ? 'Statistics' : 
        view.type === 'settings' ? (
          settingsSubView === 'menu' ? 'Configuration' :
          settingsSubView === 'cloud' ? 'Cloud Sync' :
          settingsSubView === 'prompt' ? 'AI System Prompt' :
          settingsSubView === 'data' ? 'Data Management' : 
          settingsSubView === 'journal' ? 'Journal' : 'System Info'
        ) : undefined
      }
      rightAction={
        view.type === 'list' ? (
          <button 
            onClick={() => {
              setCategoryToEdit(view.data);
              setIsCategoryModalOpen(true);
            }}
            className="p-1 hover:bg-black/5 rounded-full transition-colors"
          >
            <Pencil size={24} />
          </button>
        ) : view.type === 'details' ? (
          <button 
            onClick={() => {
              const activity = activities.find(a => a.id === view.data.activity.id);
              if (activity) {
                setActivityToEdit(activity);
                setIsEditModalOpen(true);
              }
            }}
            className="p-1 hover:bg-black/5 rounded-full transition-colors"
          >
            <Pencil size={24} />
          </button>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait">
        {view.type === 'home' && (
          <HomeScreen 
            key="home" 
            categories={categories}
            onSelectCategory={(catId) => {
              const cat = categories.find(c => c.id === catId);
              navigateTo('list', cat);
            }} 
            onCreateCategory={() => {
              setCategoryToEdit(null);
              setIsCategoryModalOpen(true);
            }}
            isSheetsConnected={isSheetsConnected}
            onConnectSheets={connectSheets}
            onSyncSheets={syncToSheets}
            isSyncing={isSyncing}
            isRecording={isRecording}
            isProcessingAI={isProcessingAI}
            onStartDictation={handleStartDictation}
            onStopDictation={handleStopDictation}
            onViewAll={() => navigateTo('overview')}
            interimTranscript={interimTranscript}
            spreadsheetUrl={spreadsheetUrl}
            serverConfig={serverConfig}
            lastSynced={lastSynced}
          />
        )}
        {view.type === 'overview' && (
          <DailyOverviewScreen 
            key="overview"
            categories={categories}
            activities={activities}
            onToggleActivity={handleToggleActivity}
            onSelectActivity={(act, dateKey) => navigateTo('details', { activity: act, dateKey })}
            onCompleteDay={handleCompleteDay}
            completedDays={completedDays}
          />
        )}
        {view.type === 'list' && (
          <ActivityListScreen 
            key="list"
            category={view.data} 
            activities={activities}
            onToggleActivity={handleToggleActivity}
            onSelectActivity={(act, dateKey) => navigateTo('details', { activity: act, dateKey })}
            onCreateActivity={handleCreateActivity}
            onOpenCreate={() => {
              setActivityToEdit(null);
              setIsEditModalOpen(true);
            }}
            onCompleteDay={handleCompleteDay}
            completedDays={completedDays}
          />
        )}
        {view.type === 'details' && (() => {
          const activity = activities.find(a => a.id === view.data.activity.id);
          const dateKey = view.data.dateKey;
          if (!activity) return null;
          return (
            <ActivityDetailsScreen 
              key="details"
              activity={activity}
              dateKey={dateKey}
              onToggleSubTask={handleToggleSubTask}
              onUpdateSubTask={handleUpdateSubTask}
              onAddSubTask={handleAddSubTask}
              onAddNote={handleAddNote}
              onUpdateDuration={handleUpdateDuration}
              onEditActivity={(act) => {
                setActivityToEdit(act);
                setIsEditModalOpen(true);
              }}
            />
          );
        })()}
        {view.type === 'stats' && (
          <StatisticsScreen 
            key="stats" 
            activities={activities} 
            categories={categories} 
            onBack={() => navigateTo('home')} 
            onReorderCategories={setCategories}
          />
        )}
        {view.type === 'settings' && (
          <SettingsScreen 
            key="settings" 
            prompt={aiSystemPrompt} 
            onSavePrompt={(p) => {
              setAiSystemPrompt(p);
              localStorage.setItem('ai_system_prompt', p);
              alert('AI System Prompt updated successfully!');
            }} 
            onDeleteHistory={handleDeleteHistory}
            onDeleteFile={handleDeleteFile}
            onImportFromSheets={handleImportFromSheets}
            onLoadPresets={handleLoadPresets}
            isSheetsConnected={isSheetsConnected}
            onConnectSheets={connectSheets}
            onLogout={handleLogout}
            spreadsheetUrl={spreadsheetUrl}
            lastSynced={lastSynced}
            isSyncing={isSyncing}
            debugInfo={{
              origin: window.location.origin,
              href: window.location.href,
              userAgent: navigator.userAgent,
              serverConfig: serverConfig,
              spreadsheetUrl: spreadsheetUrl
            }}
            connectionError={connectionError}
            subView={settingsSubView}
            onSubViewChange={setSettingsSubView}
            journalEntries={journalEntries}
          />
        )}
      </AnimatePresence>

      <EditActivityDrawer 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        activity={activityToEdit}
        onDelete={handleDeleteActivity}
        onSave={(updates) => {
          if (activityToEdit) {
            handleUpdateActivity(activityToEdit.id, updates);
          } else {
            handleCreateActivity({ 
              title: updates.title || 'New Activity', 
              days: updates.days || ['Monday'],
              categoryId: view.data.id
            });
          }
        }}
      />

      <CreateCategoryDrawer 
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        category={categoryToEdit}
        onDelete={handleDeleteCategory}
        onSave={(cat) => {
          if (categoryToEdit) {
            handleUpdateCategory(categoryToEdit.id, cat);
          } else {
            handleCreateCategory(cat);
          }
        }}
      />

      <AIConfirmationModal 
        isOpen={pendingAIUpdates.length > 0}
        onClose={() => setPendingAIUpdates([])}
        updates={pendingAIUpdates}
        onConfirm={handleConfirmAIUpdates}
        categories={categories}
        activities={activities}
        transcript={lastTranscript}
      />

      <ReopenDayModal 
        isOpen={isReopenModalOpen}
        onClose={() => setIsReopenModalOpen(false)}
        onConfirm={() => {
          if (dayToReopen) {
            setCompletedDays(prev => prev.filter(d => d !== dayToReopen.key));
            setIsReopenModalOpen(false);
          }
        }}
        dayName={dayToReopen?.name || ''}
      />

      <NewActivitiesCreationModal 
        isOpen={newActivitiesToCreate.length > 0}
        onClose={() => setNewActivitiesToCreate([])}
        newUpdates={newActivitiesToCreate}
        categories={categories}
        onCreated={(newActs, newCats) => {
          if (newCats.length > 0) {
            setCategories(prev => [...prev, ...newCats]);
          }
          const updatedActivities = [...activities, ...newActs];
          setActivities(updatedActivities);
          // Trigger sync with the updated activities
          setTimeout(() => syncToSheets(), 500);
        }}
      />
    </Layout>
  );
}
