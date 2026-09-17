'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_SEPARATOR,
  DERIVED_FIELD_SOURCES,
  FIELD_LABELS,
  IMPORT_TARGET_FIELDS,
  isDerivedField,
  isValueMappable,
  type ColumnDescriptor,
  type EmployeeImportMapping,
  type FieldRule,
  type ImportTargetField,
} from '@/lib/v2/employee-import/types';
import { indexToColumnLetter } from '@/lib/v2/employee-import/column-letters';
import { normalizeValueMapKey } from '@/lib/v2/employee-import/resolve-rows';
import { ValueMapEditor } from './ValueMapEditor';

const NONE = '__none__';
const DERIVE = '__derive__';

type Props = {
  columns: ColumnDescriptor[];
  mapping: EmployeeImportMapping;
  onChange: (mapping: EmployeeImportMapping) => void;
  /** Distinct input values per field, from the server preview. */
  sourceValues: Partial<Record<ImportTargetField, string[]>>;
  /** Input values a lookup could not resolve, from the server preview. */
  unmappedValues: Partial<Record<ImportTargetField, string[]>>;
  orgGroups: Array<{ id: number; name: string }>;
  onGroupCreated: (group: { id: number; name: string }) => void;
};

function columnLabel(column: ColumnDescriptor): string {
  const name = column.header ?? column.letter;
  const sample = column.samples[0];
  return sample ? `${name} — ${sample}` : name;
}

export function ColumnMappingStep({
  columns,
  mapping,
  onChange,
  sourceValues,
  unmappedValues,
  orgGroups,
  onGroupCreated,
}: Props) {
  const [valueMapField, setValueMapField] = useState<ImportTargetField | null>(
    null,
  );

  const columnsByIndex = useMemo(
    () => new Map(columns.map((c) => [c.index, c])),
    [columns],
  );

  const setRule = (field: ImportTargetField, rule: FieldRule | undefined) => {
    const fields = { ...mapping.fields };
    if (rule) fields[field] = rule;
    else delete fields[field];
    onChange({ ...mapping, fields });
  };

  const setSourceAt = (
    field: ImportTargetField,
    position: number,
    index: number | null,
  ) => {
    const rule = mapping.fields[field];
    const sources = [...(rule?.sources ?? [])];

    if (index === null) {
      sources.splice(position, 1);
      if (sources.length === 0) return setRule(field, undefined);
    } else if (position >= sources.length) {
      sources.push({ index });
    } else {
      sources[position] = { ...sources[position], index };
    }

    // Choosing a column must drop any derivation: resolveRows gives deriveFrom
    // precedence, so a rule holding both would keep deriving while the UI
    // showed a column.
    const { deriveFrom: _dropped, ...rest } = rule ?? {};
    setRule(field, { ...rest, sources });
  };

  const toggleRequired = (field: ImportTargetField, position: number) => {
    const rule = mapping.fields[field];
    if (!rule) return;
    const sources = rule.sources.map((source, i) =>
      i === position ? { ...source, required: !source.required } : source,
    );
    setRule(field, { ...rule, sources });
  };

  const setDerived = (field: ImportTargetField, derive: boolean) => {
    if (!isDerivedField(field)) return;
    if (!derive) return setRule(field, undefined);
    setRule(field, {
      ...mapping.fields[field],
      sources: [],
      deriveFrom: DERIVED_FIELD_SOURCES[field],
    });
  };

  // Country resolves most values automatically, so its editor only needs the
  // ones the lookup missed plus anything already overridden. Business Group has
  // no automatic source, so it needs every distinct division.
  //
  // Both cases read from sourceValues, which holds the file's own spelling.
  // Mixing in the valueMap's normalized keys would list the same value twice —
  // once as written and once lowercased.
  const valuesToMap = (field: ImportTargetField): string[] => {
    const rule = mapping.fields[field];
    if (!rule) return [];

    const all = sourceValues[field] ?? [];
    if (field !== 'country') return all;

    const overridden = new Set(Object.keys(rule.valueMap ?? {}));
    const unresolved = new Set(unmappedValues[field] ?? []);
    return all.filter(
      (value) =>
        unresolved.has(value) || overridden.has(normalizeValueMapKey(value)),
    );
  };

  return (
    <div className="min-w-0 space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={mapping.hasHeaderRow}
          onCheckedChange={(checked) =>
            onChange({ ...mapping, hasHeaderRow: checked === true })
          }
        />
        The first row contains column headers
      </label>

      <div className="min-w-0 overflow-hidden rounded-md border">
        <div className="grid grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] gap-4 border-b bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">Employee field</p>
          <p className="text-xs text-muted-foreground">Source columns</p>
        </div>

        <div className="divide-y">
          {IMPORT_TARGET_FIELDS.map((field) => {
            const rule = mapping.fields[field];
            const sources = rule?.sources ?? [];
            // One trailing empty picker so a second column can be appended.
            const slots = [...sources.map((s) => s.index), null];
            const derived = !!rule?.deriveFrom;
            const sourceField = isDerivedField(field)
              ? DERIVED_FIELD_SOURCES[field]
              : undefined;
            const deriveLabel = sourceField
              ? `Derive from ${FIELD_LABELS[sourceField]}`
              : '';
            // A derived field produces nothing until the field it reads from is
            // itself mapped, which is otherwise a silent column of blanks.
            const missingSource =
              derived && sourceField && !mapping.fields[sourceField];
            const unmappedCount = unmappedValues[field]?.length ?? 0;

            return (
              <div
                key={field}
                className="grid grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] items-start gap-4 px-3 py-2.5"
              >
                <Label className="font-normal pt-2 text-sm">
                  {FIELD_LABELS[field]}
                </Label>

                <div className="space-y-2">
                  {derived ? (
                    <Select
                      value={DERIVE}
                      onValueChange={(value) => {
                        if (value === DERIVE) return;
                        if (value === NONE) return setDerived(field, false);
                        setSourceAt(field, 0, Number(value));
                      }}
                    >
                      <SelectTrigger className="min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Not imported —</SelectItem>
                        <SelectItem value={DERIVE} className="font-semibold">
                          {deriveLabel}
                        </SelectItem>
                        {columns.map((column) => (
                          <SelectItem
                            key={column.index}
                            value={String(column.index)}
                          >
                            {columnLabel(column)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    slots.map((index, position) => (
                      <div key={position} className="flex items-center gap-2">
                        <Select
                          value={index === null ? NONE : String(index)}
                          onValueChange={(value) => {
                            if (value === DERIVE)
                              return setDerived(field, true);
                            setSourceAt(
                              field,
                              position,
                              value === NONE ? null : Number(value),
                            );
                          }}
                        >
                          <SelectTrigger className="min-w-0 flex-1">
                            <SelectValue
                              placeholder={
                                position === 0 ? 'Not imported' : 'Add a column'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>
                              {position === 0 ? '— Not imported —' : '— None —'}
                            </SelectItem>
                            {position === 0 && isDerivedField(field) && (
                              <SelectItem
                                value={DERIVE}
                                className="font-semibold"
                              >
                                {deriveLabel}
                              </SelectItem>
                            )}
                            {columns.map((column) => (
                              <SelectItem
                                key={column.index}
                                value={String(column.index)}
                              >
                                {columnLabel(column)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* The zero-rule only makes sense for the code half of
                            a code + label pair, so it is offered only once a
                            field joins more than one column. It blanks the
                            field on that row — it never drops the row. */}
                        {index !== null && sources.length > 1 && (
                          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox
                              checked={!!sources[position]?.required}
                              onCheckedChange={() =>
                                toggleRequired(field, position)
                              }
                            />
                            {`Blank ${FIELD_LABELS[field]} when ${indexToColumnLetter(index)} is 0 or empty`}
                          </label>
                        )}
                      </div>
                    ))
                  )}

                  {sources.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">
                        Join with
                      </Label>
                      <Input
                        className="h-8 w-24 font-mono text-xs"
                        value={rule?.separator ?? DEFAULT_SEPARATOR}
                        onChange={(e) =>
                          setRule(field, {
                            ...rule,
                            sources,
                            separator: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}

                  {missingSource && sourceField && (
                    <p className="text-xs text-amber-600">
                      Map {FIELD_LABELS[sourceField]} to a column first —{' '}
                      {FIELD_LABELS[field]} is derived from it.
                    </p>
                  )}

                  {rule && isValueMappable(field) && !missingSource && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setValueMapField(field)}
                      >
                        {field === 'country' ? 'Fix unmatched' : 'Map values'}
                        {rule.valueMap
                          ? ` (${Object.keys(rule.valueMap).length})`
                          : ''}
                      </Button>
                      {unmappedCount > 0 ? (
                        <span className="text-xs text-amber-600">
                          {unmappedCount} value{unmappedCount === 1 ? '' : 's'}{' '}
                          unresolved
                        </span>
                      ) : (
                        field === 'country' && (
                          <span className="text-xs text-muted-foreground">
                            All locations resolved automatically
                          </span>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {valueMapField && (
        <ValueMapEditor
          open
          onOpenChange={(open) => !open && setValueMapField(null)}
          field={valueMapField}
          fieldLabel={FIELD_LABELS[valueMapField]}
          sourceValues={valuesToMap(valueMapField)}
          orgGroups={orgGroups}
          onGroupCreated={onGroupCreated}
          valueMap={mapping.fields[valueMapField]?.valueMap}
          onSave={(valueMap) => {
            const rule = mapping.fields[valueMapField];
            if (!rule) return;
            setRule(valueMapField, { ...rule, valueMap });
          }}
        />
      )}

      {columnsByIndex.size === 0 && (
        <p className="text-sm text-muted-foreground">No columns found.</p>
      )}
    </div>
  );
}
