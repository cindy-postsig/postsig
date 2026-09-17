import {
  mySharesSchema,
  myWarrantSharesSchema,
  myAggregateCostSchema,
  myTotalAggregateCostSchema,
} from '../prompts/investorFieldSchemas/scalarFields';
import { createSchemaForType } from '../prompts/investorQueries';
import { extractionSchemasByType } from '../prompts/investorQueries';

const schemas = [
  { name: 'mySharesSchema', fn: mySharesSchema },
  { name: 'myWarrantSharesSchema', fn: myWarrantSharesSchema },
  { name: 'myAggregateCostSchema', fn: myAggregateCostSchema },
  { name: 'myTotalAggregateCostSchema', fn: myTotalAggregateCostSchema },
] as const;

describe('my_* schemas with investorNames', () => {
  describe.each(schemas)('$name', ({ fn }) => {
    it('should include investor names in description when provided', () => {
      const schema = fn(['Acme Capital', 'Beta Fund LP'], null);
      expect(schema.description).toContain('Acme Capital');
      expect(schema.description).toContain('Beta Fund LP');
    });

    it('should use empty array when investorNames is null', () => {
      const schema = fn(null, null);
      expect(schema.description).toContain('[]');
    });

    it('should remain a nullable number schema', () => {
      const schema = fn(['Acme'], null);
      expect(schema.safeParse(123).success).toBe(true);
      expect(schema.safeParse(null).success).toBe(true);
      expect(schema.safeParse('abc').success).toBe(false);
    });
  });

  describe('end-to-end schema creation', () => {
    it('should propagate investorNames into createSchemaForType spa my_shares', () => {
      const schema = createSchemaForType('spa', ['Acme Capital'], null);
      const mySharesField = schema.shape.my_shares;
      expect(mySharesField.description).toContain('Acme Capital');
    });

    it('should propagate investorNames into extractionSchemasByType', () => {
      const schemas = extractionSchemasByType(['Acme Capital'], null);
      const spaSchema = schemas.spa;
      const mySharesField = spaSchema.shape.my_shares;
      expect(mySharesField.description).toContain('Acme Capital');
    });

    it('should work with null investorNames for static type inference', () => {
      const schemas = extractionSchemasByType(null, null);
      const spaSchema = schemas.spa;
      const mySharesField = spaSchema.shape.my_shares;
      expect(mySharesField.description).toContain('[]');
    });
  });
});
