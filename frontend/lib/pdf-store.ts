export interface SavedPdf {
  id: string;
  name: string;
  saved_at: string;
  size: number;
}

interface StoredPdf extends SavedPdf {
  blob: Blob;
}

const databaseName = "slotsmith-saved-pdfs";
const databaseVersion = 1;
const storeName = "pdfs";

export class PdfStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PdfStoreError";
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("This browser does not provide IndexedDB storage."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };

    request.onerror = () => {
      if (!settled) {
        settled = true;
        reject(request.error ?? new Error("Could not open browser storage."));
      }
    };

    request.onblocked = () => {
      if (!settled) {
        settled = true;
        reject(new Error("Browser storage is blocked by another open tab."));
      }
    };
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    let requestResult: T;
    let requestSucceeded = false;
    let settled = false;
    let request: IDBRequest<T>;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      database.close();
      reject(error);
    };

    try {
      const transaction = database.transaction(storeName, mode);
      transaction.oncomplete = () => {
        if (requestSucceeded && !settled) {
          settled = true;
          database.close();
          resolve(requestResult);
        } else {
          fail(new Error("The browser storage transaction did not complete."));
        }
      };
      transaction.onerror = () => {
        fail(
          transaction.error ??
            new Error("The browser storage transaction failed."),
        );
      };
      transaction.onabort = () => {
        fail(
          transaction.error ??
            new Error("The browser storage transaction was cancelled."),
        );
      };

      request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => {
        requestSucceeded = true;
        requestResult = request.result;
      };
      request.onerror = () => {
        fail(request.error ?? new Error("The browser storage request failed."));
      };
    } catch (error) {
      fail(error);
    }
  });
}

async function withStorageError<T>(
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new PdfStoreError(message, error);
  }
}

export function savePdf(blob: Blob, name: string): Promise<SavedPdf> {
  return withStorageError(
    "The PDF could not be saved. Check that browser storage is available and has free space.",
    async () => {
      const record: StoredPdf = {
        id: crypto.randomUUID(),
        name,
        saved_at: new Date().toISOString(),
        size: blob.size,
        blob,
      };

      await runTransaction("readwrite", (store) => store.add(record));
      return {
        id: record.id,
        name: record.name,
        saved_at: record.saved_at,
        size: record.size,
      };
    },
  );
}

export function listPdfs(): Promise<SavedPdf[]> {
  return withStorageError(
    "Saved PDFs could not be loaded from this browser. Check your browser storage settings.",
    async () => {
      const records = await runTransaction<StoredPdf[]>("readonly", (store) =>
        store.getAll(),
      );

      return records
        .map((record) => ({
          id: record.id,
          name: record.name,
          saved_at: record.saved_at,
          size: record.size,
        }))
        .sort((left, right) => right.saved_at.localeCompare(left.saved_at));
    },
  );
}

export function getPdf(id: string): Promise<Blob> {
  return withStorageError(
    "This saved PDF could not be opened from browser storage.",
    async () => {
      const record = await runTransaction<StoredPdf | undefined>(
        "readonly",
        (store) => store.get(id),
      );
      if (!record) {
        throw new Error("The saved PDF was not found.");
      }
      return record.blob;
    },
  );
}

export function deletePdf(id: string): Promise<void> {
  return withStorageError(
    "The saved PDF could not be deleted from this browser.",
    () => runTransaction("readwrite", (store) => store.delete(id)),
  );
}

export function clearPdfs(): Promise<void> {
  return withStorageError(
    "Saved PDFs could not be deleted from this browser.",
    () => runTransaction("readwrite", (store) => store.clear()),
  );
}
