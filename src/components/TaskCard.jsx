import { getEscalationState, getTimeRemaining } from '../escalation';

export default function TaskCard({ task, onClick, now, index = 0 }) {
  const state = getEscalationState(task, now);
  const timeStr = task.isComplete ? 'Done' : getTimeRemaining(task.deadline, now);

  // Map task type to beautiful SVG icons
  const renderIcon = () => {
    const iconClass = "w-5 h-5 text-stone-300 group-hover:text-white transition-colors";
    switch (task.task_type) {
      case 'writing':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        );
      case 'study':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18c-2.305 0-4.408.867-6 2.292m0-14.25v14.25" />
          </svg>
        );
      case 'interview_prep':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 .621-.504 1.125-1.125 1.125H4.875c-.621 0-1.125-.504-1.125-1.125v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.45.258-.717.258H4.875c-.266 0-.523-.093-.717-.258m16.5 0a2.18 2.18 0 0 1-.75 1.661v3.39c0 .51-.218 1-.61 1.324L15 18.625m-10.5-4.475a2.18 2.18 0 0 0-.75 1.66v3.4c0 .51.218 1 .61 1.324L9 18.625m-6-4.475c.194.165.45.258.717.258H19.125c.267 0 .524-.093.718-.258M12 3v13.5m0-13.5L9.75 5.25M12 3l2.25 2.25" />
          </svg>
        );
      case 'admin_email':
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25 2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        );
      default:
        return (
          <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        );
    }
  };

  // Determine status dot color (urgency dot)
  const getDotColorClass = () => {
    if (task.isComplete) return 'bg-[#30d158]';
    switch (state) {
      case 'overdue':
      case 'critical':
        return 'bg-[#ff453a]';
      case 'nudge':
        return 'bg-[#ff9f0a]';
      default:
        return 'bg-[#727278]';
    }
  };

  const preview = task.head_start_artifact
    ? task.head_start_artifact
        .split('\n')
        .find((line) => line.trim() && !line.startsWith('#'))
        ?.trim()
        .slice(0, 75) || ''
    : '';

  return (
    <button
      onClick={() => onClick(task)}
      style={{ animationDelay: `${index * 40}ms` }}
      className={`w-full text-left p-4 bg-momentum-card border border-momentum-border hover:border-momentum-border-hover hover:bg-momentum-card-hover rounded-2xl transition-all duration-200 flex items-center gap-4 cursor-pointer relative overflow-hidden group shadow-sm animate-fade-in-up ${
        task.isComplete ? 'opacity-50' : ''
      }`}
    >
      {/* Grayscale Frosted Glass Icon container */}
      <div className="w-11 h-11 rounded-xl border border-white/5 bg-white/5 flex items-center justify-center shrink-0 transition-all duration-250 group-hover:bg-white/10">
        {renderIcon()}
      </div>

      {/* Task Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className={`font-semibold text-sm truncate transition-all ${
            task.isComplete ? 'line-through text-stone-500' : 'text-white'
          }`}>
            {task.title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Status pill badge with urgency dot */}
          <span className="text-[10px] font-medium tracking-wide text-momentum-secondary flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${getDotColorClass()}`} />
            {timeStr}
          </span>
          {/* Artifact Preview */}
          {preview && (
            <span className="text-xs text-momentum-muted truncate max-w-[150px]">
              {preview}
            </span>
          )}
        </div>
      </div>

      {/* Chevron indicator */}
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-stone-500 group-hover:text-stone-300 transition-colors shrink-0">
        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
    </button>
  );
}
