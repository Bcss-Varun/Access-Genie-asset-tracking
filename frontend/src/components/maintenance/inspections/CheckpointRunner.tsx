import { useState } from 'react';
import type { Inspection, InspectionResponse } from '@access-genie/shared';
import type { AnswerInput } from '@/api/inspections';
import { cn } from '@/lib/utils';
import { QUESTION_EMOJI, RESULT_PILL } from './tokens';

/**
 * Answer one checkpoint.
 *
 * The control follows the question's type, and the *result* is never rendered
 * from a local guess — it is whatever came back from the server after the
 * answer was saved. That is why the pill can lag a keystroke: it is showing the
 * graded outcome, not an optimistic one.
 *
 * A failure reveals its finding box and nothing closes the inspection until
 * that box is filled, which is the mechanism behind "failed items must clearly
 * identify the issue".
 */

const OPTION_BTN =
  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function ChoiceButtons({
  options,
  value,
  disabled,
  onPick,
}: {
  options: string[];
  value: string | number | boolean | null;
  disabled: boolean;
  onPick: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = String(value ?? '') === option;
        // Green for the good answer, red for the bad one — but only once
        // chosen, so an unanswered question does not look pre-judged.
        const tone =
          option === 'Fail' || option === 'No'
            ? 'border-red-300 bg-red-50 text-red-700'
            : option === 'N/A'
              ? 'border-slate-300 bg-slate-100 text-slate-600'
              : 'border-emerald-300 bg-emerald-50 text-emerald-700';

        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option)}
            aria-pressed={on}
            className={cn(OPTION_BTN, on ? tone : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function CheckpointRunner({
  inspection,
  readOnly,
  saving,
  onAnswer,
}: {
  inspection: Inspection;
  readOnly: boolean;
  saving: string | null;
  onAnswer: (answer: AnswerInput) => void;
}) {
  return (
    <ol className="divide-y divide-slate-100">
      {inspection.responses.map((response, index) => (
        <CheckpointRow
          key={response.key}
          index={index}
          response={response}
          readOnly={readOnly}
          saving={saving === response.key}
          onAnswer={onAnswer}
        />
      ))}
    </ol>
  );
}

function CheckpointRow({
  index,
  response,
  readOnly,
  saving,
  onAnswer,
}: {
  index: number;
  response: InspectionResponse;
  readOnly: boolean;
  saving: boolean;
  onAnswer: (answer: AnswerInput) => void;
}) {
  // Text and number inputs are local until blur: sending on every keystroke
  // would be a round trip per character, and the answer is not meaningful
  // half-typed.
  const [draft, setDraft] = useState(response.value === null ? '' : String(response.value));
  const [finding, setFinding] = useState(response.finding ?? '');
  const [note, setNote] = useState(response.note ?? '');

  const failed = response.result === 'Fail';

  return (
    <li className={cn('px-5 py-4', failed && 'bg-red-50/40')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{index + 1}</span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{response.label}</span>
            {response.required && <span className="text-[10px] font-semibold uppercase text-slate-400">required</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', RESULT_PILL[response.result])}>
              {saving ? 'Saving…' : response.result}
            </span>
          </div>

          <p className="mt-0.5 text-[11px] text-slate-400">
            {QUESTION_EMOJI[response.type]} {response.type}
            {response.min !== undefined || response.max !== undefined
              ? ` · acceptable ${response.min ?? '−∞'}–${response.max ?? '∞'}${response.unit ? ` ${response.unit}` : ''}`
              : ''}
            {response.failWhen ? ` · fails on "${response.failWhen}"` : ''}
          </p>

          {response.helpText && <p className="mt-1 text-xs text-slate-500">{response.helpText}</p>}

          <div className="mt-2.5 space-y-2">
            {response.type === 'Pass/Fail' && (
              <ChoiceButtons
                options={['Pass', 'Fail', 'N/A']}
                value={response.value}
                disabled={readOnly}
                onPick={(value) => onAnswer({ key: response.key, value })}
              />
            )}

            {response.type === 'Yes/No' && (
              <ChoiceButtons
                options={['Yes', 'No', 'N/A']}
                value={response.value}
                disabled={readOnly}
                onPick={(value) => onAnswer({ key: response.key, value })}
              />
            )}

            {response.type === 'Number' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={draft}
                  disabled={readOnly}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => onAnswer({ key: response.key, value: draft === '' ? null : Number(draft) })}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 disabled:bg-slate-50"
                />
                {response.unit && <span className="text-xs text-slate-400">{response.unit}</span>}
              </div>
            )}

            {(response.type === 'Text' || response.type === 'Note') && (
              <textarea
                rows={response.type === 'Note' ? 3 : 1}
                value={draft}
                disabled={readOnly}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => onAnswer({ key: response.key, value: draft.trim() === '' ? null : draft })}
                placeholder={response.type === 'Note' ? 'Observations…' : 'Answer…'}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 disabled:bg-slate-50"
              />
            )}

            {/* The finding is what turns "this failed" into something a work
                order can be raised from. Required by the server to close. */}
            {failed && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-health-critical">
                  What is wrong? (required)
                </label>
                <textarea
                  rows={2}
                  value={finding}
                  disabled={readOnly}
                  onChange={(e) => setFinding(e.target.value)}
                  onBlur={() => onAnswer({ key: response.key, value: response.value, finding })}
                  placeholder="Describe the defect — this becomes the corrective work order."
                  className={cn(
                    'w-full resize-none rounded-lg border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50',
                    finding.trim()
                      ? 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/25'
                      : 'border-red-300 focus:border-red-500 focus:ring-red-500/25',
                  )}
                />
              </div>
            )}

            {!readOnly && response.type !== 'Note' && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => onAnswer({ key: response.key, value: response.value, note })}
                placeholder="Add a note (optional)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 focus:border-primary-500 focus:outline-none"
              />
            )}

            {readOnly && response.note && <p className="text-xs text-slate-500">Note: {response.note}</p>}
            {readOnly && response.finding && (
              <p className="text-xs font-medium text-health-critical">Finding: {response.finding}</p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
