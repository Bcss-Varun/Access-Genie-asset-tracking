import { useMemo } from 'react';
import type { ReportResult, ReportVisualization } from '@access-genie/shared';
import { BarList, DonutChart, NoData, TrendChart } from './charts';
import { SEQUENTIAL_HEX, formatByFieldType, formatExact } from './tokens';
import { formatMoney } from '@/lib/utils';

/**
 * A report result, drawn the way its definition asked for.
 *
 * Every visualization here reads the *same* `ReportResult` the API returned —
 * the table and the chart are two renderings of one payload, so switching
 * between them can never show two different sets of numbers. The chart plots
 * the first dimension against the first measure, which is the pair the builder
 * names when it says "the first measure drives the chart".
 *
 * A grouped table always sits under a chart rather than replacing it. That is
 * the table view the accessibility pass requires, and it is also just useful:
 * a chart answers "what is the shape", a table answers "what exactly".
 */
export function ReportResultView({
  result,
  visualization,
  showTable = true,
}: {
  result: ReportResult;
  /** Overrides the definition's own choice — the builder's preview toggle. */
  visualization?: ReportVisualization;
  showTable?: boolean;
}) {
  const kind = visualization ?? result.visualization;
  const dimension = result.columns.find((c) => c.kind === 'dimension');
  const measure = result.columns.find((c) => c.kind === 'measure');

  const chartData = useMemo(() => {
    if (!dimension || !measure) return [];
    return result.rows.map((row) => ({
      key: String(row[dimension.key] ?? 'Unspecified'),
      label: String(row[dimension.key] ?? 'Unspecified'),
      value: Number(row[measure.key] ?? 0),
    }));
  }, [result.rows, dimension, measure]);

  const format = useMemo(() => {
    if (!measure) return formatExact;
    if (measure.type === 'currency') return formatMoney;
    if (measure.type === 'percent') return (n: number) => `${Math.round(n * 10) / 10}%`;
    return formatExact;
  }, [measure]);

  if (result.rows.length === 0) {
    return (
      <NoData
        message={
          result.notes[0] ??
          'No data available for this report. Nothing in the selected source matches these filters yet.'
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {kind !== 'table' && dimension && measure && (
        <div>
          {kind === 'bar' && (
            <BarList data={chartData} format={format} color={SEQUENTIAL_HEX} emptyMessage="Nothing to plot" />
          )}
          {kind === 'line' && (
            <TrendChart
              // A line implies an ordered axis, so the categories are put back
              // in their natural order rather than left in the value ordering
              // the server sorted them into.
              labels={[...chartData].sort((a, b) => a.label.localeCompare(b.label)).map((d) => d.label)}
              series={[
                {
                  key: measure.key,
                  label: measure.label,
                  points: [...chartData].sort((a, b) => a.label.localeCompare(b.label)).map((d) => d.value),
                  fill: true,
                },
              ]}
              format={format}
            />
          )}
          {(kind === 'pie' || kind === 'donut') && (
            <DonutChart
              data={chartData.map((d, i) => ({ ...d, color: shade(i, chartData.length) }))}
              totalLabel={measure.label}
            />
          )}
        </div>
      )}

      {(kind === 'table' || showTable) && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {result.columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                      column.kind === 'measure' ? 'text-right' : ''
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  {result.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2 ${
                        column.kind === 'measure' ? 'text-right tabular-nums text-slate-700' : 'text-slate-900'
                      }`}
                    >
                      {formatByFieldType(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {Object.keys(result.totals).length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  {result.columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2 ${column.kind === 'measure' ? 'text-right tabular-nums' : ''} text-slate-900`}
                    >
                      {index === 0
                        ? 'Total'
                        : column.key in result.totals
                          ? formatByFieldType(result.totals[column.key], column.type)
                          : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        {result.rows.length} of {result.rowCount} row{result.rowCount === 1 ? '' : 's'} · aggregated from{' '}
        {result.recordsScanned} record{result.recordsScanned === 1 ? '' : 's'} in {result.scope.name}
        {result.notes.length > 0 && ` · ${result.notes.join(' ')}`}
      </p>
    </div>
  );
}

/** One hue stepped by position — a report's categories have no fixed identity
 *  across runs, so a categorical palette would repaint on every filter change. */
function shade(index: number, total: number): string {
  const shades = ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'];
  if (total <= 1) return shades[3] as string;
  return shades[Math.round((index / (total - 1)) * (shades.length - 1))] as string;
}
