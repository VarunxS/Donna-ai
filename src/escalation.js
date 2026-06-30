// ============================================================================
// Escalation Logic — Time-based state calculation (calm / nudge / critical)
// Computed client-side from deadline vs now.
// ============================================================================

/**
 * Escalation states:
 * - "calm":     >24hrs to deadline
 * - "nudge":    6-24hrs to deadline
 * - "critical": <6hrs to deadline, task still incomplete
 * - "overdue":  past deadline, task still incomplete
 * - "done":     task marked complete
 */
export function getEscalationState(task, now = new Date()) {
  if (task.isComplete) return 'done';

  const deadline = new Date(task.deadline);
  const msRemaining = deadline - now;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  if (hoursRemaining <= 0) return 'overdue';
  if (hoursRemaining < 6) return 'critical';
  if (hoursRemaining < 24) return 'nudge';
  return 'calm';
}

/**
 * Get the urgency color class for a task's current state
 */
export function getUrgencyColor(state) {
  switch (state) {
    case 'calm': return 'bg-calm';
    case 'nudge': return 'bg-nudge';
    case 'critical': return 'bg-critical';
    case 'overdue': return 'bg-critical';
    case 'done': return 'bg-calm';
    default: return 'bg-slate-400';
  }
}

/**
 * Get the urgency text color for a task's current state
 */
export function getUrgencyTextColor(state) {
  switch (state) {
    case 'calm': return 'text-calm';
    case 'nudge': return 'text-nudge';
    case 'critical': return 'text-critical';
    case 'overdue': return 'text-critical';
    case 'done': return 'text-calm';
    default: return 'text-slate-400';
  }
}

/**
 * Get the urgency border/ring color
 */
export function getUrgencyBorderColor(state) {
  switch (state) {
    case 'calm': return 'border-calm/20';
    case 'nudge': return 'border-nudge/20';
    case 'critical': return 'border-critical/20';
    case 'overdue': return 'border-critical/30';
    case 'done': return 'border-calm/20';
    default: return 'border-slate-200';
  }
}

/**
 * Get human-readable time remaining
 */
export function getTimeRemaining(deadline, now = new Date()) {
  const ms = new Date(deadline) - now;

  if (ms <= 0) return 'overdue';

  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
  }
  if (hours > 0) {
    const remainingMins = minutes % 60;
    return remainingMins > 0 ? `in ${hours}h ${remainingMins}m` : `in ${hours}h`;
  }
  return `in ${minutes}m`;
}

/**
 * Get escalation label for display
 */
export function getEscalationLabel(state) {
  switch (state) {
    case 'calm': return 'On Track';
    case 'nudge': return 'Due Soon';
    case 'critical': return 'Critical';
    case 'overdue': return 'Overdue';
    case 'done': return 'Complete';
    default: return '';
  }
}
