"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  createProject,
  getProject,
  onServerWakingUp,
  updateProjectData,
} from "../lib/api";
import type {
  Course,
  Day,
  Faculty,
  Project,
  ProjectData,
  Room,
  Time,
  TimeSlot,
} from "../lib/types";

type CollectionKey = keyof ProjectData;
type ValidationMessages = Record<string, string[]>;

const tabs: { key: CollectionKey; label: string }[] = [
  { key: "courses", label: "Courses" },
  { key: "faculty", label: "Faculty" },
  { key: "rooms", label: "Rooms" },
  { key: "slots", label: "Time slots" },
];

const days: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fieldKey(collection: CollectionKey, index: number, field: string) {
  return `${collection}.${index}.${field}`;
}

function addValidationMessage(
  messages: ValidationMessages,
  key: string,
  message: string,
) {
  messages[key] = [...(messages[key] ?? []), message];
}

function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function validateProjectData(data: ProjectData): ValidationMessages {
  const messages: ValidationMessages = {};

  for (const collection of tabs.map((tab) => tab.key)) {
    const seenIds = new Map<string, number>();
    const rows = data[collection];

    rows.forEach((row, index) => {
      if (!row.id) {
        return;
      }

      const previousIndex = seenIds.get(row.id);
      if (previousIndex !== undefined) {
        addValidationMessage(
          messages,
          fieldKey(collection, index, "id"),
          `This ID is already used in ${tabs.find((tab) => tab.key === collection)?.label}.`,
        );
        addValidationMessage(
          messages,
          fieldKey(collection, previousIndex, "id"),
          `This ID is also used in another row.`,
        );
      } else {
        seenIds.set(row.id, index);
      }
    });
  }

  data.courses.forEach((course, index) => {
    if (!course.faculty_id || !data.faculty.some((person) => person.id === course.faculty_id)) {
      addValidationMessage(
        messages,
        fieldKey("courses", index, "faculty_id"),
        "Choose a teacher that exists in the Faculty tab.",
      );
    }

    for (const field of ["sessions_per_week", "session_length_slots"] as const) {
      const value = course[field];
      if (!Number.isInteger(value) || value < 1) {
        addValidationMessage(
          messages,
          fieldKey("courses", index, field),
          "Enter a whole number greater than 0.",
        );
      }
    }

    if (!Number.isInteger(course.student_count) || course.student_count < 0) {
      addValidationMessage(
        messages,
        fieldKey("courses", index, "student_count"),
        "Enter a whole number that is 0 or greater.",
      );
    }
  });

  data.rooms.forEach((room, index) => {
    if (!Number.isInteger(room.capacity) || room.capacity < 1) {
      addValidationMessage(
        messages,
        fieldKey("rooms", index, "capacity"),
        "Room capacity must be a whole number of at least 1.",
      );
    }
  });

  data.slots.forEach((slot, index) => {
    const start = parseTime(slot.start);
    const end = parseTime(slot.end);

    if (start === null) {
      addValidationMessage(
        messages,
        fieldKey("slots", index, "start"),
        "Enter a valid time in HH:MM format.",
      );
    }

    if (end === null) {
      addValidationMessage(
        messages,
        fieldKey("slots", index, "end"),
        "Enter a valid time in HH:MM format.",
      );
    } else if (start !== null && end <= start) {
      addValidationMessage(
        messages,
        fieldKey("slots", index, "end"),
        "End time must be after start time.",
      );
    }
  });

  return messages;
}

function getErrorDetails(error: ApiError): string[] {
  return error.details.flatMap((detail) => {
    if (
      typeof detail === "object" &&
      detail !== null &&
      "field" in detail &&
      typeof detail.field === "string" &&
      "message" in detail &&
      typeof detail.message === "string"
    ) {
      return [`${detail.field}: ${detail.message}`];
    }

    return [];
  });
}

function FieldInput({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  min,
  step,
  placeholder,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "number" | "time";
  min?: number;
  step?: number;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="min-w-32">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        step={step}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-600 focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 aria-[invalid=true]:border-red-600"
      />
      {error && (
        <p id={errorId} className="mt-1 max-w-48 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function DayInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Day;
  onChange: (value: Day) => void;
}) {
  return (
    <div className="min-w-28">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as Day)}
        className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>
    </div>
  );
}

function FacultyInput({
  id,
  label,
  value,
  faculty,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  faculty: Faculty[];
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="min-w-40">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 aria-[invalid=true]:border-red-600"
      >
        <option value="">Choose faculty</option>
        {value && !faculty.some((person) => person.id === value) && (
          <option value={value}>Unknown faculty ID: {value}</option>
        )}
        {faculty.map((person, index) => (
          <option key={`${person.id}-${index}`} value={person.id}>
            {person.name || person.id || `Faculty row ${index + 1}`}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="mt-1 max-w-48 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function EditableTable<T extends { id: string }>({
  label,
  columns,
  rows,
  emptyMessage,
  onAdd,
  onDelete,
}: {
  label: string;
  columns: { key: string; label: string; render: (index: number) => ReactNode }[];
  rows: T[];
  emptyMessage: string;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          {rows.length === 0
            ? emptyMessage
            : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="min-h-10 rounded-lg border border-blue-700 px-4 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Add row
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-max border-collapse text-left">
          <caption className="sr-only">{label} data</caption>
          <thead className="bg-slate-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700"
                >
                  {column.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-[var(--panel-background)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="bg-white px-4 py-8 text-center text-sm text-slate-700"
                >
                  No {label.toLowerCase()} have been added yet. Use “Add row” to
                  create one.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.id}-${index}`} className="align-top">
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {column.render(index)}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onDelete(index)}
                      aria-label={`Delete ${label.toLowerCase()} row ${index + 1}`}
                      className="min-h-10 rounded-md px-3 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-2 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function firstCollectionWithErrors(
  errors: ValidationMessages,
): CollectionKey | null {
  return tabs.find((tab) => Object.keys(errors).some((key) => key.startsWith(`${tab.key}.`)))?.key ?? null;
}

export default function DataSetup() {
  const [projectName, setProjectName] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [activeTab, setActiveTab] = useState<CollectionKey>("courses");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => onServerWakingUp(() => setIsWakingUp(true)), []);

  const validationMessages = useMemo(
    () => (projectData ? validateProjectData(projectData) : {}),
    [projectData],
  );
  const validationCount = Object.values(validationMessages).reduce(
    (count, messages) => count + messages.length,
    0,
  );

  function showError(error: unknown) {
    setErrorMessage(
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Please try again.",
    );
    setErrorDetails(error instanceof ApiError ? getErrorDetails(error) : []);
    setStatusMessage(null);
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setIsWakingUp(false);
    setErrorMessage(null);
    setErrorDetails([]);
    setStatusMessage(null);

    try {
      const createdProject = await createProject({ name: projectName.trim() });
      const loadedProject = await getProject(createdProject.id);
      setProject(loadedProject);
      setProjectData(loadedProject.data);
      setProjectName(loadedProject.name);
    } catch (error) {
      showError(error);
    } finally {
      setIsLoading(false);
      setIsWakingUp(false);
    }
  }

  async function handleSave() {
    if (!project || !projectData) {
      return;
    }

    const errors = validateProjectData(projectData);
    const firstInvalidCollection = firstCollectionWithErrors(errors);
    if (firstInvalidCollection) {
      setActiveTab(firstInvalidCollection);
      setErrorMessage("Fix the data issues shown in the table before saving.");
      setErrorDetails([]);
      setStatusMessage(null);
      return;
    }

    setIsSaving(true);
    setIsWakingUp(false);
    setErrorMessage(null);
    setErrorDetails([]);
    setStatusMessage(null);

    try {
      const savedProject = await updateProjectData(project.id, projectData);
      setProject(savedProject);
      setProjectData(savedProject.data);
      setStatusMessage("Project data saved.");
    } catch (error) {
      showError(error);
    } finally {
      setIsSaving(false);
      setIsWakingUp(false);
    }
  }

  function updateCourse(index: number, course: Course) {
    setProjectData((current) =>
      current
        ? {
            ...current,
            courses: current.courses.map((row, rowIndex) =>
              rowIndex === index ? course : row,
            ),
          }
        : current,
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function updateFaculty(index: number, faculty: Faculty) {
    setProjectData((current) =>
      current
        ? {
            ...current,
            faculty: current.faculty.map((row, rowIndex) =>
              rowIndex === index ? faculty : row,
            ),
          }
        : current,
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function updateRoom(index: number, room: Room) {
    setProjectData((current) =>
      current
        ? {
            ...current,
            rooms: current.rooms.map((row, rowIndex) =>
              rowIndex === index ? room : row,
            ),
          }
        : current,
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function updateSlot(index: number, slot: TimeSlot) {
    setProjectData((current) =>
      current
        ? {
            ...current,
            slots: current.slots.map((row, rowIndex) =>
              rowIndex === index ? slot : row,
            ),
          }
        : current,
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function updateNumber(value: string): number {
    return value === "" ? 0 : Number(value);
  }

  function inputError(
    collection: CollectionKey,
    index: number,
    field: string,
  ): string | undefined {
    return validationMessages[fieldKey(collection, index, field)]?.[0];
  }

  function inputId(collection: CollectionKey, index: number, field: string) {
    return `${collection}-${index}-${field}`;
  }

  function renderCourses() {
    if (!projectData) return null;

    return (
      <EditableTable<Course>
        label="Courses"
        rows={projectData.courses}
        emptyMessage="No courses yet."
        onAdd={() =>
          setProjectData({
            ...projectData,
            courses: [
              ...projectData.courses,
              {
                id: "",
                code: "",
                name: "",
                faculty_id: "",
                student_count: 0,
                sessions_per_week: 1,
                session_length_slots: 1,
              },
            ],
          })
        }
        onDelete={(index) =>
          setProjectData({
            ...projectData,
            courses: projectData.courses.filter((_, rowIndex) => rowIndex !== index),
          })
        }
        columns={[
          {
            key: "id",
            label: "id",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "id")}
                label={`Course ${index + 1} id`}
                value={projectData.courses[index].id}
                error={inputError("courses", index, "id")}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], id: value })}
              />
            ),
          },
          {
            key: "code",
            label: "code",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "code")}
                label={`Course ${index + 1} code`}
                value={projectData.courses[index].code}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], code: value })}
              />
            ),
          },
          {
            key: "name",
            label: "name",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "name")}
                label={`Course ${index + 1} name`}
                value={projectData.courses[index].name}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], name: value })}
              />
            ),
          },
          {
            key: "faculty_id",
            label: "faculty_id",
            render: (index) => (
              <FacultyInput
                id={inputId("courses", index, "faculty_id")}
                label={`Course ${index + 1} faculty_id`}
                value={projectData.courses[index].faculty_id}
                faculty={projectData.faculty}
                error={inputError("courses", index, "faculty_id")}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], faculty_id: value })}
              />
            ),
          },
          {
            key: "student_count",
            label: "student_count",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "student_count")}
                label={`Course ${index + 1} student_count`}
                type="number"
                min={0}
                step={1}
                value={projectData.courses[index].student_count}
                error={inputError("courses", index, "student_count")}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], student_count: updateNumber(value) })}
              />
            ),
          },
          {
            key: "sessions_per_week",
            label: "sessions_per_week",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "sessions_per_week")}
                label={`Course ${index + 1} sessions_per_week`}
                type="number"
                min={1}
                step={1}
                value={projectData.courses[index].sessions_per_week}
                error={inputError("courses", index, "sessions_per_week")}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], sessions_per_week: updateNumber(value) })}
              />
            ),
          },
          {
            key: "session_length_slots",
            label: "session_length_slots",
            render: (index) => (
              <FieldInput
                id={inputId("courses", index, "session_length_slots")}
                label={`Course ${index + 1} session_length_slots`}
                type="number"
                min={1}
                step={1}
                value={projectData.courses[index].session_length_slots}
                error={inputError("courses", index, "session_length_slots")}
                onChange={(value) => updateCourse(index, { ...projectData.courses[index], session_length_slots: updateNumber(value) })}
              />
            ),
          },
        ]}
      />
    );
  }

  function renderFaculty() {
    if (!projectData) return null;

    return (
      <EditableTable<Faculty>
        label="Faculty"
        rows={projectData.faculty}
        emptyMessage="No faculty yet."
        onAdd={() =>
          setProjectData({
            ...projectData,
            faculty: [
              ...projectData.faculty,
              { id: "", name: "", preferred_slot_ids: [] },
            ],
          })
        }
        onDelete={(index) =>
          setProjectData({
            ...projectData,
            faculty: projectData.faculty.filter((_, rowIndex) => rowIndex !== index),
          })
        }
        columns={[
          {
            key: "id",
            label: "id",
            render: (index) => (
              <FieldInput
                id={inputId("faculty", index, "id")}
                label={`Faculty ${index + 1} id`}
                value={projectData.faculty[index].id}
                error={inputError("faculty", index, "id")}
                onChange={(value) => updateFaculty(index, { ...projectData.faculty[index], id: value })}
              />
            ),
          },
          {
            key: "name",
            label: "name",
            render: (index) => (
              <FieldInput
                id={inputId("faculty", index, "name")}
                label={`Faculty ${index + 1} name`}
                value={projectData.faculty[index].name}
                onChange={(value) => updateFaculty(index, { ...projectData.faculty[index], name: value })}
              />
            ),
          },
          {
            key: "preferred_slot_ids",
            label: "preferred_slot_ids",
            render: (index) => (
              <FieldInput
                id={inputId("faculty", index, "preferred_slot_ids")}
                label={`Faculty ${index + 1} preferred_slot_ids, comma-separated`}
                value={projectData.faculty[index].preferred_slot_ids.join(", ")}
                placeholder="MON_09, TUE_10"
                onChange={(value) =>
                  updateFaculty(index, {
                    ...projectData.faculty[index],
                    preferred_slot_ids: value
                      .split(",")
                      .map((slotId) => slotId.trim())
                      .filter(Boolean),
                  })
                }
              />
            ),
          },
        ]}
      />
    );
  }

  function renderRooms() {
    if (!projectData) return null;

    return (
      <EditableTable<Room>
        label="Rooms"
        rows={projectData.rooms}
        emptyMessage="No rooms yet."
        onAdd={() =>
          setProjectData({
            ...projectData,
            rooms: [...projectData.rooms, { id: "", name: "", capacity: 0 }],
          })
        }
        onDelete={(index) =>
          setProjectData({
            ...projectData,
            rooms: projectData.rooms.filter((_, rowIndex) => rowIndex !== index),
          })
        }
        columns={[
          {
            key: "id",
            label: "id",
            render: (index) => (
              <FieldInput
                id={inputId("rooms", index, "id")}
                label={`Room ${index + 1} id`}
                value={projectData.rooms[index].id}
                error={inputError("rooms", index, "id")}
                onChange={(value) => updateRoom(index, { ...projectData.rooms[index], id: value })}
              />
            ),
          },
          {
            key: "name",
            label: "name",
            render: (index) => (
              <FieldInput
                id={inputId("rooms", index, "name")}
                label={`Room ${index + 1} name`}
                value={projectData.rooms[index].name}
                onChange={(value) => updateRoom(index, { ...projectData.rooms[index], name: value })}
              />
            ),
          },
          {
            key: "capacity",
            label: "capacity",
            render: (index) => (
              <FieldInput
                id={inputId("rooms", index, "capacity")}
                label={`Room ${index + 1} capacity`}
                type="number"
                min={1}
                step={1}
                value={projectData.rooms[index].capacity}
                error={inputError("rooms", index, "capacity")}
                onChange={(value) => updateRoom(index, { ...projectData.rooms[index], capacity: updateNumber(value) })}
              />
            ),
          },
        ]}
      />
    );
  }

  function renderSlots() {
    if (!projectData) return null;

    return (
      <EditableTable<TimeSlot>
        label="Time slots"
        rows={projectData.slots}
        emptyMessage="No time slots yet."
        onAdd={() =>
          setProjectData({
            ...projectData,
            slots: [
              ...projectData.slots,
              { id: "", day: "Mon", start: "09:00", end: "10:00", label: "" },
            ],
          })
        }
        onDelete={(index) =>
          setProjectData({
            ...projectData,
            slots: projectData.slots.filter((_, rowIndex) => rowIndex !== index),
          })
        }
        columns={[
          {
            key: "id",
            label: "id",
            render: (index) => (
              <FieldInput
                id={inputId("slots", index, "id")}
                label={`Time slot ${index + 1} id`}
                value={projectData.slots[index].id}
                error={inputError("slots", index, "id")}
                onChange={(value) => updateSlot(index, { ...projectData.slots[index], id: value })}
              />
            ),
          },
          {
            key: "day",
            label: "day",
            render: (index) => (
              <DayInput
                id={inputId("slots", index, "day")}
                label={`Time slot ${index + 1} day`}
                value={projectData.slots[index].day}
                onChange={(value) => updateSlot(index, { ...projectData.slots[index], day: value })}
              />
            ),
          },
          {
            key: "start",
            label: "start",
            render: (index) => (
              <FieldInput
                id={inputId("slots", index, "start")}
                label={`Time slot ${index + 1} start`}
                type="time"
                value={projectData.slots[index].start}
                error={inputError("slots", index, "start")}
                onChange={(value) =>
                  updateSlot(index, {
                    ...projectData.slots[index],
                    start: value as Time,
                  })
                }
              />
            ),
          },
          {
            key: "end",
            label: "end",
            render: (index) => (
              <FieldInput
                id={inputId("slots", index, "end")}
                label={`Time slot ${index + 1} end`}
                type="time"
                value={projectData.slots[index].end}
                error={inputError("slots", index, "end")}
                onChange={(value) =>
                  updateSlot(index, {
                    ...projectData.slots[index],
                    end: value as Time,
                  })
                }
              />
            ),
          },
          {
            key: "label",
            label: "label",
            render: (index) => (
              <FieldInput
                id={inputId("slots", index, "label")}
                label={`Time slot ${index + 1} label`}
                value={projectData.slots[index].label}
                onChange={(value) => updateSlot(index, { ...projectData.slots[index], label: value })}
              />
            ),
          },
        ]}
      />
    );
  }

  function renderActiveTable() {
    switch (activeTab) {
      case "courses":
        return renderCourses();
      case "faculty":
        return renderFaculty();
      case "rooms":
        return renderRooms();
      case "slots":
        return renderSlots();
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-accent)]">
          Phase 1 · Data setup
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--brand-accent)]">
          Project data
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--brand-accent)]">
          Create a project, then add the courses, faculty, rooms, and
          time slots used by the scheduler. Changes are saved when you choose
          “Save project data”.
        </p>
      </header>

      {!project && (
        <form
          onSubmit={handleCreateProject}
          className="max-w-2xl rounded-2xl border border-slate-200 bg-[var(--panel-background)] p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-lg font-semibold text-slate-950">Start a project</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Enter a name. The app will create the project and load its data
            through the API.
          </p>
          <label
            htmlFor="project-name"
            className="mt-5 block text-sm font-medium text-slate-800"
          >
            Project name
          </label>
          <input
            id="project-name"
            name="name"
            required
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isLoading ? "Creating project…" : "Create project"}
          </button>
        </form>
      )}

      {isLoading && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          {isWakingUp
            ? "Waking up the server, this can take up to a minute."
            : "Creating the project and loading its data…"}
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">{errorMessage}</p>
          {errorDetails.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {errorDetails.map((detail, index) => (
                <li key={`${detail}-${index}`}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {project && projectData && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[var(--panel-background)] px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">{project.name}</p>
              <p className="text-sm text-slate-600">Project ID: {project.id}</p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || validationCount > 0}
              className="min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save project data"}
            </button>
          </div>

          {isSaving && (
            <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              {isWakingUp
                ? "Waking up the server, this can take up to a minute."
                : "Saving project data…"}
            </p>
          )}
          {statusMessage && (
            <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-900">
              {statusMessage}
            </p>
          )}
          {validationCount > 0 && (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
              Fix {validationCount} data {validationCount === 1 ? "issue" : "issues"} before saving.
              Timetable clashes are checked by the backend in a later phase.
            </p>
          )}

          <div className="border-b border-slate-200">
            <div
              role="tablist"
              aria-label="Project data categories"
              className="flex flex-wrap gap-1"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`${tab.key}-tab`}
                  aria-selected={activeTab === tab.key}
                  aria-controls={`${tab.key}-panel`}
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    activeTab === tab.key
                      ? "border-b-2 border-blue-700 bg-[var(--panel-background)] text-blue-800"
                      : "text-slate-200 hover:bg-[var(--brand-accent)] hover:text-[#0b1d4d]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            id={`${activeTab}-panel`}
            role="tabpanel"
            aria-labelledby={`${activeTab}-tab`}
            className="min-h-40"
          >
            {renderActiveTable()}
          </div>
        </div>
      )}
    </section>
  );
}
