import { z, ZodTypeAny } from 'zod';
import logger from '@/utils/pino';
import type { MfdWithPrompt } from '@/data/mfd';

interface MfdSettings {
  is_array?: boolean;
  items_type?: string;
  enum_values?: string[];
}

function snakeToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseMfdSettings(settings: unknown): MfdSettings {
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as MfdSettings;
  }
  return {};
}

function parseSelectOptions(options: unknown): string[] | null {
  if (Array.isArray(options)) {
    return options.filter((o): o is string => typeof o === 'string');
  }
  return null;
}

/**
 * Maps an MFD default_data_type (+ settings overrides) to a Zod schema type.
 */
function dataTypeToZod(
  dataType: string,
  selectOptions: unknown,
  settings: MfdSettings,
): ZodTypeAny {
  // Settings can override with enum_values
  if (settings.enum_values && settings.enum_values.length > 0) {
    const [first, ...rest] = settings.enum_values;
    return z.enum([first, ...rest]);
  }

  switch (dataType) {
    case 'text':
      return z.string();
    case 'number':
    case 'currency':
    case 'percentage':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string();
    case 'select': {
      const opts = parseSelectOptions(selectOptions);
      if (opts && opts.length > 0) {
        const [first, ...rest] = opts;
        return z.enum([first, ...rest]);
      }
      return z.string();
    }
    case 'json':
      return z.unknown();
    default:
      logger.warn({ dataType }, 'Unknown MFD data type, defaulting to string');
      return z.string();
  }
}

/**
 * Build a single Zod field schema from an MFD row
 */
function buildFieldSchema(mfd: MfdWithPrompt): ZodTypeAny {
  const settings = parseMfdSettings(mfd.settings);
  let baseType: ZodTypeAny;

  if (settings.is_array) {
    const itemType = dataTypeToZod(
      settings.items_type ?? mfd.default_data_type,
      mfd.default_select_options,
      {},
    );
    baseType = z.array(itemType);
  } else {
    baseType = dataTypeToZod(
      mfd.default_data_type,
      mfd.default_select_options,
      settings,
    );
  }

  const description = mfd.prompt_template_content ?? mfd.default_label;

  return baseType.nullable().describe(description);
}

export function buildSchemaFromMfdFields(
  mfdFields: MfdWithPrompt[],
): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const mfd of mfdFields) {
    const camelKey = snakeToCamelCase(mfd.field_key);
    shape[camelKey] = buildFieldSchema(mfd);
  }

  return z.object(shape);
}
