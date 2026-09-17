import { z } from 'zod';

// IRA Registration Rights
export const iraRegistrationRightsSchema = z
  .object({
    demand_registration: z
      .object({
        available: z
          .boolean()
          .describe('Whether demand registration rights exist'),
        initiating_holders_threshold: z
          .string()
          .nullable()
          .describe(
            'Threshold to initiate demand (e.g., "majority of Registrable Securities")',
          ),
        number_of_demands: z
          .number()
          .nullable()
          .describe('Maximum number of demand registrations'),
        lock_up_period: z
          .string()
          .nullable()
          .describe('Lock-up period after IPO'),
      })
      .nullable()
      .describe('Demand registration right details'),
    s3_registration: z
      .object({
        available: z
          .boolean()
          .describe('Whether Form S-3 registration rights exist'),
        minimum_amount: z
          .number()
          .nullable()
          .describe('Minimum offering amount for S-3'),
        frequency_limit: z
          .string()
          .nullable()
          .describe('Frequency limit (e.g., "no more than twice per year")'),
      })
      .nullable()
      .describe('S-3 registration right details'),
    piggyback_registration: z
      .object({
        available: z
          .boolean()
          .describe('Whether piggyback registration rights exist'),
        cutback_priority: z
          .string()
          .nullable()
          .describe(
            'Priority in cutback situations (e.g., "pro rata among investors, after company shares")',
          ),
      })
      .nullable()
      .describe('Piggyback registration right details'),
    expenses: z
      .string()
      .nullable()
      .describe('Which party bears registration expenses'),
  })
  .nullable()
  .describe(
    'Extract registration rights from this Investors\' Rights Agreement. Cover demand registration (threshold, number of demands, lock-up), S-3 registration (minimum amount, frequency), piggyback registration (cutback priority), and expense allocation. Look in "Registration Rights" sections. If not found, return null.',
  );

// IRA Governance Provisions
export const iraGovernanceProvisionsSchema = z
  .object({
    board_seats: z
      .array(
        z.object({
          designator: z.string().describe('Who designates this board seat'),
          seat_type: z
            .string()
            .describe(
              'Type of seat (e.g., "investor", "common", "independent", "CEO")',
            ),
          specific_holder: z
            .string()
            .nullable()
            .describe('Specific holder with designation right if named'),
        }),
      )
      .nullable()
      .describe('Board seat composition'),
    protective_provisions: z
      .array(
        z.object({
          provision: z
            .string()
            .describe('Description of the protective provision'),
          consent_threshold: z
            .string()
            .nullable()
            .describe('Required consent threshold'),
        }),
      )
      .nullable()
      .describe('Protective provisions requiring investor consent'),
    consent_threshold: z
      .string()
      .nullable()
      .describe('Default consent threshold for protective provisions'),
  })
  .nullable()
  .describe(
    'Extract governance provisions from this Investors\' Rights Agreement. Cover board composition (who designates each seat), protective provisions (actions requiring investor consent), and consent thresholds. Look in "Board of Directors", "Protective Provisions", and "Governance" sections. If not found, return null.',
  );

// IRA Drag-Along & Co-Sale
export const iraDragAlongCoSaleSchema = z
  .object({
    drag_along_threshold: z
      .string()
      .nullable()
      .describe(
        'Threshold to trigger drag-along (e.g., "majority of Preferred and Common")',
      ),
    common_required: z
      .boolean()
      .nullable()
      .describe(
        'Whether common stock approval is also required for drag-along',
      ),
    co_sale_holders: z.string().nullable().describe('Who has co-sale rights'),
    notice_period: z
      .string()
      .nullable()
      .describe('Notice period for co-sale exercise'),
    exemptions: z
      .array(z.string())
      .nullable()
      .describe('Transfers exempt from co-sale/drag-along'),
  })
  .nullable()
  .describe(
    'Extract drag-along and co-sale provisions from this Investors\' Rights Agreement. Cover drag-along threshold and whether common approval is required, co-sale right holders, notice period, and exempt transfers. Look in "Drag-Along", "Co-Sale", and "Transfer Restrictions" sections. If not found, return null.',
  );

// ROFR Covered Shares
export const rofrCoveredSharesSchema = z
  .object({
    shareholders_subject: z
      .array(z.string())
      .nullable()
      .describe('Shareholders subject to ROFR restrictions'),
    share_classes_covered: z
      .array(z.string())
      .nullable()
      .describe('Share classes covered by ROFR'),
    preferred_included: z
      .boolean()
      .nullable()
      .describe('Whether preferred shares are covered'),
    company_right: z
      .boolean()
      .nullable()
      .describe('Whether the company has a ROFR'),
    investor_right: z
      .boolean()
      .nullable()
      .describe('Whether investors have a ROFR'),
    priority_order: z
      .string()
      .nullable()
      .describe(
        'Priority between company and investor ROFR (e.g., "company first, then investors")',
      ),
  })
  .nullable()
  .describe(
    'Extract the scope of covered shares from this ROFR/Co-Sale Agreement. Identify which shareholders are subject, which share classes are covered, whether preferred is included, whether both company and investors have ROFR rights, and the priority order. Look in "Right of First Refusal", "Covered Shares", and definitions. If not found, return null.',
  );

// ROFR Exercise Mechanics
export const rofrExerciseMechanicsSchema = z
  .object({
    notice_requirements: z
      .string()
      .nullable()
      .describe('Notice requirements for proposed transfers'),
    company_exercise_period: z
      .string()
      .nullable()
      .describe('Period for company to exercise ROFR (e.g., "30 days")'),
    investor_exercise_period: z
      .string()
      .nullable()
      .describe('Period for investors to exercise ROFR'),
    over_allotment: z
      .boolean()
      .nullable()
      .describe(
        'Whether over-allotment rights exist for non-exercising shares',
      ),
    price_matching: z
      .boolean()
      .nullable()
      .describe('Whether ROFR is at the proposed sale price'),
    partial_exercise: z
      .boolean()
      .nullable()
      .describe('Whether partial exercise is permitted'),
  })
  .nullable()
  .describe(
    'Extract ROFR exercise mechanics from this ROFR/Co-Sale Agreement. Cover notice requirements, company and investor exercise periods, over-allotment rights, price matching, and partial exercise. Look in "Exercise of Right", "Procedures", and "Notice" sections. If not found, return null.',
  );

// ROFR Transfer Exemptions
export const rofrTransferExemptionsSchema = z
  .array(
    z.object({
      exemption_type: z
        .string()
        .describe(
          'Type of exempt transfer (e.g., "estate planning", "affiliates", "Rule 144")',
        ),
      conditions: z
        .string()
        .nullable()
        .describe('Conditions for the exemption to apply'),
      transferee_subject_to_rofr: z
        .boolean()
        .nullable()
        .describe('Whether the transferee becomes subject to ROFR'),
      transferee_subject_to_cosale: z
        .boolean()
        .nullable()
        .describe('Whether the transferee becomes subject to co-sale'),
    }),
  )
  .nullable()
  .describe(
    'Extract all transfer exemptions from this ROFR/Co-Sale Agreement. For each exemption, return the type, conditions, and whether the transferee becomes subject to ROFR and co-sale obligations. Look in "Exempt Transfers", "Permitted Transfers", and "Exceptions" sections. If not found, return null.',
  );

// ROFR Co-Sale Provisions
export const rofrCoSaleProvisionsSchema = z
  .object({
    co_sale_holders: z
      .string()
      .nullable()
      .describe('Who has co-sale (tag-along) rights'),
    participation_pct: z
      .string()
      .nullable()
      .describe('Participation percentage for co-sale'),
    pro_rata_basis: z
      .boolean()
      .nullable()
      .describe('Whether co-sale is on a pro rata basis'),
    notice_period: z
      .string()
      .nullable()
      .describe('Notice period for co-sale exercise'),
    obligation_or_right: z
      .enum(['obligation', 'right'])
      .nullable()
      .describe('Whether co-sale is an obligation or a right'),
    remedy_for_violation: z
      .string()
      .nullable()
      .describe('Remedy if seller violates co-sale rights'),
  })
  .nullable()
  .describe(
    'Extract co-sale (tag-along) provisions from this ROFR/Co-Sale Agreement. Cover who has co-sale rights, participation percentage, pro rata basis, notice period, whether it is an obligation or right, and the remedy for violation. Look in "Co-Sale Right", "Tag-Along", and "Participation" sections. If not found, return null.',
  );

// ROFR Termination
export const rofrTerminationSchema = z
  .object({
    terminates_on_ipo: z
      .boolean()
      .nullable()
      .describe('Whether the agreement terminates upon IPO'),
    terminates_on_coc: z
      .boolean()
      .nullable()
      .describe('Whether the agreement terminates upon change of control'),
    terminates_on_date: z
      .string()
      .nullable()
      .describe('Specific termination date if any (ISO 8601)'),
    surviving_obligations: z
      .array(z.string())
      .nullable()
      .describe('Obligations that survive termination'),
    amendment_threshold: z
      .string()
      .nullable()
      .describe('Threshold required to amend the agreement'),
  })
  .nullable()
  .describe(
    'Extract termination provisions from this ROFR/Co-Sale Agreement. Determine if the agreement terminates on IPO, change of control, or a specific date, which obligations survive, and the amendment threshold. Look in "Termination", "Amendment", and "Miscellaneous" sections. If not found, return null.',
  );

// ---------------------------------------------------------------------------
// Voting Agreement (va_) schemas
// ---------------------------------------------------------------------------

// VA Parties & Scope
export const vaPartiesScopeSchema = z
  .object({
    all_parties: z
      .array(
        z.object({
          name: z.string().describe('Legal name of the stockholder party'),
          entity_type: z
            .string()
            .describe(
              'Entity type (e.g., "Fund", "Individual", "Corporation")',
            ),
        }),
      )
      .nullable()
      .describe('All stockholder parties to the voting agreement'),
    share_classes_subject_to_agreement: z
      .array(z.string())
      .nullable()
      .describe('Share classes bound by the voting agreement'),
    company_is_party: z
      .boolean()
      .nullable()
      .describe('Whether the company is a party to the voting agreement'),
    effective_date: z
      .string()
      .nullable()
      .describe('Effective date of the voting agreement (ISO 8601)'),
    governing_law: z
      .string()
      .nullable()
      .describe('Jurisdiction whose law governs the agreement'),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract: all_parties (list each stockholder name and entity type), share_classes_subject_to_agreement (list), company_is_party (boolean), effective_date, governing_law. Cross-reference the party list against the cap table and flag any stockholder holding more than 5% who is not a party. If not found, return null.',
  );

// VA Board Composition
export const vaBoardCompositionSchema = z
  .object({
    total_board_seats: z
      .number()
      .nullable()
      .describe('Total number of board seats'),
    seats_designated_by_each_preferred_series: z
      .array(
        z.object({
          series_name: z.string().describe('Name of the preferred series'),
          seats: z
            .number()
            .describe('Number of seats designated by this series'),
        }),
      )
      .nullable()
      .describe('Board seats designated by each preferred series'),
    seats_designated_by_common_stockholders: z
      .number()
      .nullable()
      .describe('Number of seats designated by common stockholders'),
    independent_director_seats: z
      .number()
      .nullable()
      .describe('Number of independent director seats'),
    observer_rights_granted: z
      .array(z.string())
      .nullable()
      .describe('Parties granted board observer rights'),
    vacancy_filling_mechanics: z
      .string()
      .nullable()
      .describe('How board vacancies are filled under the voting agreement'),
    removal_mechanics: z
      .string()
      .nullable()
      .describe('Process for removing directors under the voting agreement'),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract the full board composition structure. Return: total_board_seats, seats_designated_by_each_preferred_series (list), seats_designated_by_common_stockholders, independent_director_seats, observer_rights_granted (list), vacancy_filling_mechanics, removal_mechanics. If not found, return null.',
  );

// VA Drag-Along
export const vaDragAlongSchema = z
  .object({
    drag_along_threshold: z
      .string()
      .nullable()
      .describe(
        'Threshold required to trigger drag-along (e.g., "majority of Preferred and Common voting together")',
      ),
    matters_subject_to_drag_along: z
      .array(z.string())
      .nullable()
      .describe('Corporate actions that can be forced via drag-along'),
    stockholder_obligations_on_drag_along: z
      .string()
      .nullable()
      .describe(
        'Actions stockholders are obligated to take when drag-along is triggered',
      ),
    minimum_price_condition: z
      .boolean()
      .nullable()
      .describe('Whether drag-along requires a minimum price to be met'),
    pro_rata_proceeds_condition: z
      .boolean()
      .nullable()
      .describe(
        'Whether drag-along requires proceeds to be distributed pro rata',
      ),
    exemptions_from_drag_along: z
      .array(
        z.object({
          exemption_type: z.string().describe('Type of exempted transfer'),
          conditions: z
            .string()
            .nullable()
            .describe('Conditions for the exemption to apply'),
        }),
      )
      .nullable()
      .describe('Transfer types exempt from drag-along obligations'),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract all drag-along provisions. Return: drag_along_threshold (describe fully), matters_subject_to_drag_along (list), stockholder_obligations_on_drag_along, minimum_price_condition (boolean), pro_rata_proceeds_condition (boolean), exemptions_from_drag_along (list). If not found, return null.',
  );

// VA Voting Obligations
export const vaVotingObligationsSchema = z
  .object({
    specific_matters_requiring_directed_vote: z
      .array(
        z.object({
          matter: z
            .string()
            .describe(
              'Matter on which stockholders must vote in a specified way',
            ),
          required_vote: z.string().describe('How the vote must be cast'),
        }),
      )
      .nullable()
      .describe(
        'Specific matters requiring stockholders to vote a certain way',
      ),
    proxy_granted: z
      .boolean()
      .nullable()
      .describe('Whether a proxy is granted under the voting agreement'),
    proxy_holder_name: z
      .string()
      .nullable()
      .describe('Name and title of the proxy holder'),
    proxy_scope: z.string().nullable().describe('Matters covered by the proxy'),
    proxy_irrevocable: z
      .boolean()
      .nullable()
      .describe('Whether the proxy is irrevocable'),
    written_consent_obligations: z
      .boolean()
      .nullable()
      .describe('Whether parties have obligations to act by written consent'),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract all voting obligations. Return: specific_matters_requiring_directed_vote (list), proxy_granted (boolean), proxy_holder_name, proxy_scope, proxy_irrevocable (boolean), written_consent_obligations (boolean). Flag any obligation that could conflict with fiduciary duties. If not found, return null.',
  );

// VA Transfer Restrictions
export const vaTransferRestrictionsSchema = z
  .object({
    shares_remain_subject_on_transfer: z
      .boolean()
      .nullable()
      .describe(
        'Whether transferred shares remain subject to the voting agreement',
      ),
    joinder_required_for_transferees: z
      .boolean()
      .nullable()
      .describe(
        'Whether transferees must sign a joinder to the voting agreement',
      ),
    permitted_transfers_without_joinder: z
      .array(
        z.object({
          transfer_type: z
            .string()
            .describe('Type of transfer that does not require joinder'),
          conditions: z
            .string()
            .nullable()
            .describe('Conditions applicable to this permitted transfer'),
        }),
      )
      .nullable()
      .describe(
        'Transfer types that do not require the transferee to join the voting agreement',
      ),
    legend_required_on_certificates: z
      .boolean()
      .nullable()
      .describe(
        'Whether stock certificates must bear a reference to the voting agreement',
      ),
    enforcement_mechanism_for_unauthorized_transfer: z
      .string()
      .nullable()
      .describe(
        'Remedy available when a transfer occurs without required joinder',
      ),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract all transfer-related provisions. Return: shares_remain_subject_on_transfer (boolean), joinder_required_for_transferees (boolean), permitted_transfers_without_joinder (list), legend_required_on_certificates (boolean), enforcement_mechanism_for_unauthorized_transfer. If not found, return null.',
  );

// VA Termination
export const vaTerminationSchema = z
  .object({
    termination_triggers: z
      .array(z.string())
      .nullable()
      .describe('Events that cause the voting agreement to terminate'),
    post_termination_surviving_obligations: z
      .array(z.string())
      .nullable()
      .describe('Obligations that survive termination of the voting agreement'),
    amendment_threshold_required: z
      .string()
      .nullable()
      .describe('Threshold or process required to amend the voting agreement'),
    amendment_requires_company_consent: z
      .boolean()
      .nullable()
      .describe('Whether amendments require the company\u2019s consent'),
  })
  .nullable()
  .describe(
    'From this voting agreement, extract termination and amendment provisions. Return: termination_triggers (list), post_termination_surviving_obligations (list), amendment_threshold_required, amendment_requires_company_consent (boolean). If not found, return null.',
  );
