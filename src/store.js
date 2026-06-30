// ============================================================================
// Store — localStorage persistence for tasks and kept/broken record.
// Handles corrupted/empty localStorage gracefully (spec fallback #3).
// ============================================================================

const TASKS_KEY = 'momentum_tasks';
const RECORD_KEY = 'momentum_record';

// ---------------------------------------------------------------------------
// Tasks CRUD
// ---------------------------------------------------------------------------

export function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    // Corrupted localStorage — initialize fresh (spec fallback #3)
    console.warn('Corrupted tasks in localStorage, initializing fresh state');
    localStorage.removeItem(TASKS_KEY);
    return [];
  }
}

export function saveTasks(tasks) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save tasks:', err.message);
  }
}

export function addTask(tasks, newTask) {
  const updated = [newTask, ...tasks];
  saveTasks(updated);
  return updated;
}

export function updateTask(tasks, taskId, updates) {
  const updated = tasks.map((t) =>
    t.id === taskId ? { ...t, ...updates } : t
  );
  saveTasks(updated);
  return updated;
}

export function deleteTask(tasks, taskId) {
  const updated = tasks.filter((t) => t.id !== taskId);
  saveTasks(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Kept/Broken Record
// ---------------------------------------------------------------------------

export function loadRecord() {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return { kept: 0, broken: 0, history: [] };
    const parsed = JSON.parse(raw);
    if (typeof parsed.kept !== 'number' || typeof parsed.broken !== 'number') {
      return { kept: 0, broken: 0, history: [] };
    }
    if (!Array.isArray(parsed.history)) {
      parsed.history = [];
    }
    return parsed;
  } catch {
    console.warn('Corrupted record in localStorage, initializing fresh');
    localStorage.removeItem(RECORD_KEY);
    return { kept: 0, broken: 0, history: [] };
  }
}

export function saveRecord(record) {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch (err) {
    console.error('Failed to save record:', err.message);
  }
}

export function recordKept(record, task) {
  const updated = {
    ...record,
    kept: record.kept + 1,
    history: [
      {
        type: 'kept',
        taskId: task.id,
        taskTitle: task.title,
        consequenceAvoided: task.consequence_card,
        timestamp: new Date().toISOString(),
      },
      ...record.history,
    ],
  };
  saveRecord(updated);
  return updated;
}

export function recordBroken(record, task) {
  const updated = {
    ...record,
    broken: record.broken + 1,
    history: [
      {
        type: 'broken',
        taskId: task.id,
        taskTitle: task.title,
        consequence: task.consequence_card,
        timestamp: new Date().toISOString(),
      },
      ...record.history,
    ],
  };
  saveRecord(updated);
  return updated;
}

export function removeTaskFromRecord(record, task) {
  const historyEntry = record.history.find(
    (h) => h.taskId === task.id || h.taskTitle === task.title
  );
  if (!historyEntry) return record;

  const isKept = historyEntry.type === 'kept';
  const updated = {
    ...record,
    kept: isKept ? Math.max(0, record.kept - 1) : record.kept,
    broken: !isKept ? Math.max(0, record.broken - 1) : record.broken,
    history: record.history.filter(
      (h) => h.taskId !== task.id && h.taskTitle !== task.title
    ),
  };
  saveRecord(updated);
  return updated;
}
