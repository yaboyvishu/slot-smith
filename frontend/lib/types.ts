export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

type Digit =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

export type Time = `${Digit}${Digit}:${Digit}${Digit}`;

export interface Faculty {
  id: string;
  name: string;
  preferred_slot_ids: string[];
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export interface TimeSlot {
  id: string;
  day: Day;
  start: Time;
  end: Time;
  label: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  faculty_id: string;
  student_count: number;
  sessions_per_week: number;
  session_length_slots: number;
}

export interface ProjectData {
  courses: Course[];
  faculty: Faculty[];
  rooms: Room[];
  slots: TimeSlot[];
}

export interface Preference {
  id: string;
  type: "faculty_prefers_slots";
  faculty_id: string;
  slot_ids: string[];
}

export interface Constraints {
  no_teacher_clash: boolean;
  no_room_clash: boolean;
  room_capacity: boolean;
  preferences: Preference[];
}

export interface TimetableEntry {
  id: string;
  course_id: string;
  faculty_id: string;
  room_id: string;
  start_slot_id: string;
  length_slots: number;
  slot_ids: string[];
}

export type TimetableEntryInput = Omit<TimetableEntry, "slot_ids"> & {
  slot_ids?: string[];
};

export type ConflictType =
  | "teacher_clash"
  | "room_clash"
  | "room_capacity"
  | "missing_reference"
  | "no_room_big_enough"
  | "teacher_overloaded"
  | "not_enough_slots"
  | "no_consecutive_block"
  | "blocking_rules"
  | "preference_unmet";

export interface Conflict {
  type: ConflictType;
  message: string;
  suggested_fix: string | null;
  affected_entry_ids: string[];
  affected_slot_ids: string[];
}

export type GenerateStatus =
  | "complete"
  | "complete_with_unmet_preferences"
  | "impossible";

export interface GenerateResult {
  status: GenerateStatus;
  timetable: TimetableEntry[];
  unmet_constraints: Conflict[];
  preferences_met: number;
  preferences_total: number;
}

export interface Project {
  id: string;
  name: string;
  data: ProjectData;
  constraints: Constraints;
  timetable: TimetableEntry[];
}

export interface HealthResponse {
  status: "ok";
}

export interface ValidateRequest {
  timetable: TimetableEntryInput[];
}

export interface ValidateResponse {
  valid: boolean;
  clashes: Conflict[];
}

export interface SaveTimetableRequest {
  timetable: TimetableEntryInput[];
}

export interface CreateProjectRequest {
  name: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}
