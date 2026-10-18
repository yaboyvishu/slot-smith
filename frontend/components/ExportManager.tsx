"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { exportProjectPdf } from "../lib/api";
import {
  clearPdfs,
  deletePdf,
  getPdf,
  listPdfs,
  savePdf,
  type SavedPdf,
} from "../lib/pdf-store";

const usesMocks = process.env.NEXT_PUBLIC_USE_MOCK === "1";
const maxUploadSize = 10 * 1024 * 1024;
const defaultProjectId = usesMocks ? "demo" : "";

type DeleteRequest =
  | { kind: "one"; pdf: SavedPdf }
  | { kind: "all" };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DeleteConfirmation({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request: DeleteRequest | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (request && !dialog.open) {
      dialog.showModal();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  const deletingAll = request?.kind === "all";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-pdf-title"
      aria-describedby="delete-pdf-description"
      onClose={onCancel}
      onCancel={(event) => {
        if (busy) {
          event.preventDefault();
        }
      }}
      className="w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-0 text-slate-950 shadow-2xl backdrop:bg-black/70"
    >
      <div className="space-y-5 p-6 sm:p-7">
        <div>
          <h2
            id="delete-pdf-title"
            className="text-2xl font-semibold text-[#681638]"
          >
            {deletingAll ? "Delete all saved PDFs?" : "Delete saved PDF?"}
          </h2>
          <p id="delete-pdf-description" className="mt-2 text-sm text-slate-700">
            {deletingAll
              ? "This permanently removes every saved PDF from this browser."
              : `This permanently removes “${request?.kind === "one" ? request.pdf.name : ""}” from this browser.`}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-lg border border-slate-400 px-4 text-slate-900 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#681638] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 rounded-lg border border-red-800 bg-red-800 px-4 font-semibold text-white transition hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function ExportManager() {
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [savedPdfs, setSavedPdfs] = useState<SavedPdf[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    listPdfs()
      .then((pdfs) => {
        if (isMounted) {
          setSavedPdfs(pdfs);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(
            errorMessage(
              loadError,
              "Saved PDFs could not be loaded from this browser.",
            ),
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRetryLoad() {
    setIsLoading(true);
    setError(null);
    try {
      setSavedPdfs(await listPdfs());
    } catch (loadError) {
      setError(
        errorMessage(
          loadError,
          "Saved PDFs could not be loaded from this browser.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportAndSave() {
    const id = projectId.trim();
    if (!id) {
      setError("Enter the project ID before exporting a PDF.");
      return;
    }

    setError(null);
    setStatus(null);
    setIsExporting(true);
    try {
      const blob = await exportProjectPdf(id);
      const fileName = `timetable-${id}.pdf`;
      downloadBlob(blob, fileName);

      try {
        const savedPdf = await savePdf(blob, fileName);
        setSavedPdfs((current) => [
          savedPdf,
          ...current.filter((pdf) => pdf.id !== savedPdf.id),
        ]);
        setStatus("PDF downloaded and saved in this browser.");
      } catch (saveError) {
        setError(
          `The PDF was downloaded, but could not be saved here. ${errorMessage(
            saveError,
            "Check browser storage and try again.",
          )}`,
        );
      }
    } catch (exportError) {
      setError(
        errorMessage(
          exportError,
          "The PDF could not be exported. Check the project ID and server connection.",
        ),
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setStatus(null);

    if (file.type !== "application/pdf") {
      setError("Choose a PDF file. Other file types cannot be saved here.");
      return;
    }
    if (file.size > maxUploadSize) {
      setError("The PDF is over 10 MB. Choose a smaller file.");
      return;
    }

    setIsUploading(true);
    try {
      const savedPdf = await savePdf(file, file.name);
      setSavedPdfs((current) => [
        savedPdf,
        ...current.filter((pdf) => pdf.id !== savedPdf.id),
      ]);
      setStatus("PDF saved in this browser.");
    } catch (saveError) {
      setError(
        errorMessage(saveError, "The PDF could not be saved in this browser."),
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(pdf: SavedPdf) {
    setError(null);
    setStatus(null);
    setDownloadingId(pdf.id);
    try {
      const blob = await getPdf(pdf.id);
      downloadBlob(blob, pdf.name);
      setStatus(`Downloaded ${pdf.name}.`);
    } catch (downloadError) {
      setError(
        errorMessage(
          downloadError,
          "The saved PDF could not be downloaded from this browser.",
        ),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteRequest) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setStatus(null);
    try {
      if (deleteRequest.kind === "all") {
        await clearPdfs();
        setSavedPdfs([]);
        setStatus("All saved PDFs were deleted from this browser.");
      } else {
        await deletePdf(deleteRequest.pdf.id);
        setSavedPdfs((current) =>
          current.filter((pdf) => pdf.id !== deleteRequest.pdf.id),
        );
        setStatus(`${deleteRequest.pdf.name} was deleted from this browser.`);
      }
      setDeleteRequest(null);
    } catch (deleteError) {
      setError(
        errorMessage(deleteError, "The saved PDF could not be deleted."),
      );
      setDeleteRequest(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-[var(--panel-background)] p-6 text-slate-950 shadow-lg sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#681638]">
        Phase 6 · Export
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        Export
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-700">
        Export a timetable PDF from the server or keep PDFs you choose in this
        browser.
      </p>

      <section
        aria-labelledby="saved-pdfs-heading"
        className="mt-7 space-y-5 rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6"
      >
        <div>
          <h2
            id="saved-pdfs-heading"
            className="text-2xl font-semibold text-slate-950"
          >
            Saved PDFs
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Saved PDFs stay in this browser only.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end">
          <div>
            <label
              htmlFor="pdf-project-id"
              className="mb-1 block text-sm font-medium text-slate-800"
            >
              Project ID
            </label>
            <input
              id="pdf-project-id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={usesMocks}
              placeholder="Enter the project ID"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 disabled:bg-slate-100 disabled:text-slate-600"
            />
          </div>
          <button
            type="button"
            onClick={handleExportAndSave}
            disabled={usesMocks || isExporting || !projectId.trim()}
            className="min-h-11 rounded-lg bg-[var(--brand-accent)] px-5 font-semibold text-[#111111] transition hover:bg-[#f3a9c9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#681638] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting PDF…" : "Export and save PDF"}
          </button>
        </div>
        {usesMocks && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Needs the real server. Turn off mock mode to use it.
          </p>
        )}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            aria-label="Choose a PDF from your computer"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="min-h-11 rounded-lg border border-[#8a204f] px-5 font-semibold text-[#681638] transition hover:bg-[#f8c8dc] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#681638] disabled:cursor-wait disabled:opacity-60"
          >
            {isUploading ? "Saving PDF…" : "Add a PDF from my computer"}
          </button>
          <p className="mt-2 text-sm text-slate-600">
            PDF files only, up to 10 MB.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            Error: {error}
          </p>
        )}
        {status && (
          <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-950">
            Success: {status}
          </p>
        )}

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-slate-950">
              Your saved files
            </h3>
            {savedPdfs.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteRequest({ kind: "all" })}
                disabled={isDeleting}
                className="min-h-10 rounded-lg border border-red-800 px-4 text-sm font-semibold text-red-900 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
              >
                Delete all
              </button>
            )}
          </div>

          {isLoading ? (
            <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm text-slate-800">
              Loading saved PDFs…
            </p>
          ) : error && savedPdfs.length === 0 ? (
            <div className="space-y-3 rounded-lg bg-slate-100 p-4">
              <p className="text-sm text-slate-800">
                Saved PDFs could not be loaded.
              </p>
              <button
                type="button"
                onClick={() => void handleRetryLoad()}
                className="min-h-10 rounded-lg border border-[#8a204f] px-4 text-sm font-semibold text-[#681638] hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#681638]"
              >
                Try again
              </button>
            </div>
          ) : savedPdfs.length === 0 ? (
            <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-800">
              No saved PDFs yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {savedPdfs.map((pdf) => (
                <li
                  key={pdf.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-[var(--panel-background)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-950">
                      {pdf.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      Saved {new Date(pdf.saved_at).toLocaleString()} ·{" "}
                      {formatSize(pdf.size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDownload(pdf)}
                      disabled={downloadingId !== null || isDeleting}
                      className="min-h-10 rounded-lg border border-[#8a204f] px-4 text-sm font-semibold text-[#681638] transition hover:bg-[#f8c8dc] hover:text-[#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#681638] disabled:opacity-60"
                    >
                      {downloadingId === pdf.id ? "Downloading…" : "Download"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteRequest({ kind: "one", pdf })}
                      disabled={isDeleting || downloadingId !== null}
                      className="min-h-10 rounded-lg border border-red-800 px-4 text-sm font-semibold text-red-900 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DeleteConfirmation
        request={deleteRequest}
        busy={isDeleting}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={() => void handleDeleteConfirmed()}
      />
    </section>
  );
}
