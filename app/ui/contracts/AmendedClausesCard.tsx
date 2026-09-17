'use client';

import * as React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AmendedClause {
  amendment_type: string;
  referenced_section: string;
  amended_clause_text: string;
}

interface AmendedClausesCardProps {
  amendedClauses: AmendedClause[];
  title?: string;
}

export default function AmendedClausesCard({
  amendedClauses,
  title = 'Amended Clauses',
}: AmendedClausesCardProps) {
  if (!amendedClauses || amendedClauses.length === 0) {
    return null;
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {title}
            <Badge variant="outline" className="ml-2">
              {amendedClauses.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {amendedClauses.map((clause, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger
                  className={`hover:no-underline ${
                    clause.amended_clause_text.length < 100
                      ? 'hide-accordion-icon pointer-events-none'
                      : ''
                  }`}
                >
                  <div className="flex w-full items-center justify-between text-left">
                    <span className="col-span-1 pt-[.4rem] font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                      Section {clause.referenced_section}
                    </span>
                    <Badge
                      variant="outline"
                      className={`ml-3 ${'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700'}`}
                    >
                      {clause.amendment_type.charAt(0).toUpperCase() +
                        clause.amendment_type.slice(1)}
                    </Badge>
                  </div>
                </AccordionTrigger>
                {clause.amended_clause_text.length < 100 ? (
                  clause.amended_clause_text
                ) : (
                  <AccordionContent className="max-h-64 overflow-y-auto whitespace-pre-wrap pr-2 font-serif text-sm leading-relaxed">
                    {clause.amended_clause_text || (
                      <span className="italic text-muted-foreground">
                        No text provided
                      </span>
                    )}
                  </AccordionContent>
                )}
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
