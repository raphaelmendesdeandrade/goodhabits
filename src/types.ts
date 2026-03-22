export interface Category {
  id: string;
  title: string;
  icon: string; // Emoji
  color: string; // Tailwind bg class
}

export interface SubTask {
  id: string;
  title: string;
}

export interface ActivityLog {
  completed: boolean;
  duration: number;
  note: string;
  subTaskStatus: { [subTaskId: string]: boolean };
}

export interface Activity {
  id: string;
  title: string;
  categoryId: string;
  days: string[]; // Scheduled days of the week
  subTasks: SubTask[];
  logs: { [date: string]: ActivityLog }; // date string e.g. '2024-03-20'
}

export interface DailyProgress {
  day: string;
  percentage: number;
}

export interface CategoryStats {
  category: Category;
  percentage: number;
  dailyProgress: DailyProgress[];
}

export interface JournalEntry {
  timestamp: string;
  transcript: string;
}
