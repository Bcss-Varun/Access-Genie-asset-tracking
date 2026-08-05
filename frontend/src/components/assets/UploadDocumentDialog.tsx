import { useRef, useState } from 'react';
import { DOC_TYPES, type DocType } from '@access-genie/shared';
import { FormDialog, Field, Select } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { documentsApi, MAX_UPLOAD_BYTES, type AssetDocument as AssetDocumentRecord } from '@/api/documents';
import { cn } from '@/lib/utils';

/**
 * Attach a real file to an asset.
 *
 * This replaces two different fictions. The Documents tab had an "Upload
 * Document" button that raised a toast and attached nothing, and the
 * registration flow's Commercial card wrote rows with invented filenames like
 * "Tax Invoice — Dell PowerEdge (GST).pdf" and a size derived from how many
 * documents were already in the list. Both produced records that looked like
 * evidence and were not — the worst possible outcome for the one tab an auditor
 * opens.
 *
 * The name, size and MIME type here are the browser's own, read off the file
 * the user picked.
 */

const prettySize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A reasonable default so the common case needs one fewer decision. */
function guessType(file: File): DocType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'Image';
  if (/invoice|bill|receipt|gst/.test(name)) return 'Invoice';
  if (/warrant/.test(name)) return 'Warranty';
  if (/cert|compliance|iso/.test(name)) return 'Certificate';
  if (/manual|guide|handbook/.test(name)) return 'Manual';
  if (/\.(dwg|dxf|step|stp|iges)$/.test(name)) return 'CAD';
  return 'Report';
}

export function UploadDocumentDialog({
  assetId,
  defaultType,
  onUploaded,
  onClose,
}: {
  assetId: string;
  /** Preselects the type when opened from a checklist row that wants one. */
  defaultType?: DocType;
  /** For callers that keep their own copy — the registration gate, notably. */
  onUploaded?: (doc: AssetDocumentRecord) => void;
  onClose: () => void;
}) {
  const { run, isPending } = useMutate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocType>(defaultType ?? 'Invoice');
  const [dragging, setDragging] = useState(false);

  // Checked here as well as on the server so an oversized file is refused
  // before it is read into memory and base64'd.
  const tooBig = file != null && file.size > MAX_UPLOAD_BYTES;

  const take = (picked: File | null | undefined) => {
    if (!picked) return;
    setFile(picked);
    if (!defaultType) setType(guessType(picked));
  };

  const submit = async () => {
    if (!file || tooBig) return;
    const saved = await run(documentsApi.upload(assetId, file, type), {
      success: `${file.name} attached`,
      successDetail: `${type} · ${prettySize(file.size)} — stored against ${assetId}.`,
      describe: 'attach that document',
    });
    if (saved) {
      onUploaded?.(saved);
      onClose();
    }
  };

  return (
    <FormDialog
      icon="📎"
      title="Attach a document"
      description={`Stored against ${assetId} and listed on its Documents tab. Up to ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`}
      submitLabel={file ? `Upload ${prettySize(file.size)}` : 'Choose a file first'}
      busy={isPending}
      disabled={!file || tooBig}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="File" hint="The name and size are taken from the file itself.">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-primary-400 bg-primary-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => take(e.target.files?.[0])}
          />
          {file ? (
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-slate-800 break-all">{file.name}</div>
              <div className="text-xs text-slate-500">
                {prettySize(file.size)}
                {file.type && <> · {file.type}</>}
              </div>
              <div className="text-xs text-primary-600">Click to choose a different file</div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-2xl">📄</div>
              <div className="text-sm text-slate-600">Drop a file here, or click to browse</div>
            </div>
          )}
        </div>
      </Field>

      {tooBig && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {file?.name} is {prettySize(file?.size ?? 0)} — the limit is {MAX_UPLOAD_BYTES / 1024 / 1024}MB. Files are
          stored in the database rather than an object store, which is what sets the ceiling.
        </p>
      )}

      <Field label="Type" hint="Decides where it is counted — the warranty card reads Warranty and Certificate.">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as DocType)}
          options={DOC_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </Field>
    </FormDialog>
  );
}
