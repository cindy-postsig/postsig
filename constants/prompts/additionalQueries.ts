import { SchemaType } from '@google/generative-ai';
import { lineageQueries } from './lineageQueries';

export const additionalQueries = [
  {
    dbName: 'service_level_agreements',
    query: `Analyze this document & extract all information pertaining to Service Level Agreements (SLAs), Disaster Recovery Plans (DRPs), and uptime guarantees, specifically as they relate to third-party ICT service providers or internal ICT services. Focus on how these elements contribute to, or are assessed for, compliance with the EU's Digital Operational Resilience Act (DORA).Return the whole answer in one paragraph. Don't mention what's not included in the paragraph.
              Specifically:
              - Identify any clauses or sections that define service levels for critical ICT services, and whether these SLAs address DORA's requirements for resilience, recovery, and business continuity.
              - Extract details from the Disaster Recovery Plan related to recovery time objectives (RTOs) and recovery point objectives (RPOs) for key systems, and whether these objectives are aligned with DORA's expectations for minimizing disruption to financial services.
              - Identify any uptime guarantees provided for ICT services and detail how these guarantees contribute to the overall operational resilience required by DORA. Note any penalties for failing to meet those guarantees.
              - Extract any information on how these SLAs, DRPs and guarantees are tested, reviewed and updated in line with DORA's requirement for ongoing resilience assessment.
              - Determine if the document mentions how these elements are used in the selection, monitoring and ongoing management of third-party ICT service providers, in accordance with DORA's third-party risk management requirements.
              - List the name of any section, appendix or document that details the SLAs, DRPs or Uptime Guarantees.
              `,
  },
  {
    dbName: 'cost_mitigation',
    query: `Analyze this document and extract all information related to incident-related cost mitigation strategies, focusing on clauses within Service Level Agreements (SLAs), Disaster Recovery Plans (DRPs), and uptime guarantees that address damages, financial compensation to clients, and accounting for incident-related losses. This analysis should be performed within the framework of the EU's Digital Operational Resilience Act (DORA).Return the whole answer in one paragraph. Don't mention what's not included in the paragraph.
              Specifically, identify and extract the following:
              - SLA Compensation Clauses: Extract any clauses within SLAs that specify financial compensation, service credits, or other forms of restitution to clients in the event of ICT incidents, service disruptions, or failures to meet agreed-upon service levels.
              - DRP Cost Recovery Mechanisms: Identify any sections within the Disaster Recovery Plan (DRP) that outline mechanisms for recovering incident-related costs, including insurance coverage, reserve funds, or other financial resources allocated for incident response and recovery.
              - Uptime Guarantee Penalties: Extract details about any penalties or financial repercussions for failing to meet uptime guarantees, including how these penalties are calculated, applied, and reported to clients and relevant authorities.
              - Incident Cost Accounting: Identify any procedures described in the document for tracking, documenting, and accounting for costs associated with ICT incidents, including costs related to incident response, system recovery, client compensation, and regulatory fines.
              - Liability and Responsibility: Extract any clauses which detail the liabilities and responsibilities of both the organization and its ICT service providers (if applicable) regarding financial losses resulting from ICT incidents.
              - Client Communication Regarding Compensation: Identify any sections describing the process for communicating with clients regarding potential compensation for incident-related damages.
              - DORA Alignment: Assess whether the document explicitly mentions how these cost mitigation strategies and compensation mechanisms align with DORA's requirements for operational resilience and minimizing disruption to financial services.
              - List all documents/sections that contain the above information.`,
  },
  {
    dbName: 'arbitration_and_conflict_resolution',
    query: `Analyze this document and extract all information pertaining to arbitration and conflict resolution mechanisms, with a particular focus on jurisdictional and venue stipulations, especially as they relate to ICT service agreements and compliance with the EU's Digital Operational Resilience Act (DORA).Return the whole answer in one paragraph. Don't mention what's not included in the paragraph.
              Specifically, identify and extract the following:
              - Arbitration Clauses: Extract any clauses that specify the use of arbitration as a method of dispute resolution. Note the specific rules or procedures referenced (e.g., ICC, LCIA, etc).
              - Jurisdictional Stipulations: Identify any clauses that define the legal jurisdiction applicable to disputes arising from ICT service agreements or related to DORA compliance.
              - Venue Stipulations: Extract details about the designated venue (location or forum) for any legal proceedings or arbitration hearings.
              - Governing Law: Identify the governing law that applies to the agreements or disputes. (e.g., English law, German law, etc.)
              - Conflict Resolution Procedures: Extract any detailed procedures for managing disputes that are separate from or in addition to arbitration clauses. This might include escalation processes, mediation requirements or good faith negotiations.
              - DORA Relevance: Determine if the document explicitly references how the chosen jurisdictional or venue stipulations, or the dispute resolution methods, are aligned with DORA's requirements, especially regarding cross-border data flows and the management of risks related to third-party ICT service providers operating across multiple jurisdictions.
              - Third-Party Agreements: Extract details on whether these clauses apply to third-party ICT service agreements, noting the name and nature of these third parties.
              - Cross-Border Considerations: Identify whether the clauses take into account potential disputes involving parties or ICT services that are located in different countries.
              - List the names of all sections, appendices or documents that include the above information.`,
  },
  {
    dbName: 'security_awareness',
    query: `Analyze this document and extract all information regarding security awareness and training programs offered or described by the vendor or organization within the document, focusing specifically on the educational resources they make available. This analysis should be performed in the context of the EU's Digital Operational Resilience Act (DORA).Return the whole answer in one paragraph. Don't mention what's not included in the paragraph.
              Specifically, identify and extract the following:
              - Training Program Descriptions: Extract descriptions of any security awareness training programs offered or mentioned in the document.
              - Training Content: Identify the topics covered in the security training programs. List the specific training modules, subject matter, or educational materials provided to personnel.
              - Training Methods: Identify methods used to deliver the training, including e-learning platforms, in-person workshops, webinars, or other mediums.
              - Target Audience: Determine for which roles or employees the training programs are designed or required.
              - Training Frequency: Identify how often training is conducted and if refresher courses are included.
              - Resource Availability: Detail what types of resources are provided, such as training materials, guides, presentations, videos, or interactive modules. Include details on how employees can access these resources.
              - DORA Alignment: Determine if the document explicitly mentions how the security awareness and training programs contribute to DORA compliance, particularly in the context of managing ICT risks, or if they comply with DORA's requirements for employee training and awareness.
              - Vendor Responsibility: Identify any statements that specify the vendor's responsibility to provide training materials, modules or courses.
              - Access to training: Identify any specific processes or rules regarding employees' access to these trainings.
              - Record Keeping: Extract any details on how training records are maintained or tracked, for regulatory purposes.
              - List the names of all sections, appendices or documents that include the above information.`,
  },
  ...lineageQueries,
  {
    dbName: 'amended_clauses',
    query: `
       Goal is to identify *specifically* which clauses in the *original* contract are being *amended* by this addendum, and to extract the *full, amended text* of those clauses. The output *must* be valid, well-formed JSON, suitable for direct parsing by a computer program.  Incorrect JSON or failure to identify the amended clauses will render the output unusable.
       CRITICAL: Do this only if this document type is an addendum to a contract.

        **Task:**

        1.  **Clause Identification and Extraction:**
            *   Carefully analyze the addendum text.
            *   Identify each clause that *amends* an existing clause in the original (unprovided) contract.  This requires understanding phrases like "Section 3.2 is hereby amended to read as follows:", "Paragraph 5(a) is replaced in its entirety with:", "The definition of 'Confidential Information' in Section 1 is amended by adding...", or similar language indicating modification.
            *   For *each* amended clause, determine:
                *   "original_clause_identifier":  The identifier (e.g., section number, paragraph number, title) of the clause in the *original* contract that is being modified.  If the identifier cannot be definitively determined from the addendum text alone, use the value "unknown".  However, strive to be as specific as possible (e.g., "3.2(a)" is better than "3.2" which is better than "unknown").
                *   "amended_clause_text": The *complete, final text* of the clause *after* the amendment from the addendum is applied.  This should be the full, revised text, not just the changed portion.  Include any surrounding text necessary to make the clause self-contained and understandable.  Do *not* include the introductory phrasing (like "is amended to read as follows").
                *   "amendment_type": A short description, from a fixed list of options, indicating the type of amendment. Choose *one* of the following:
                    *   "replacement": The original clause is completely replaced.
                    *   "addition": Text is added to the original clause.
                    *   "deletion": Text is removed from the original clause.
                    *   "modification": The original clause is changed, but not fully replaced (e.g., a specific word or phrase is changed).
                    *   "other":  If the type of amendment cannot be determined.

        2.  **JSON Output:**

            *   The output *must* be a single, valid JSON object.
            *   The JSON object *must* have a single top-level key: "amended_clauses".
            *   The value of "amended_clauses" *must* be a JSON array.
            *   Each element in the array *must* be a JSON object representing a single amended clause.
            *   Each clause object *must* have the following keys, and *only* these keys:
                *   "original_clause_identifier": (string, as described above)
                *   "amended_clause_text": (string, as described above)
                *   "amendment_type": (string, as described above)

        **Example (Illustrative - Do NOT assume this structure in the input):**

        Let's say the Addendum text is:


        ADDENDUM TO AGREEMENT

        1.  Section 2.1 of the Agreement is hereby amended to read as follows:  "The term of this Agreement shall be for a period of five (5) years, commencing on the Effective Date."
        2.  The definition of "Party" in Section 1 is amended by adding the following sentence: "A 'Party' may also include any subsidiary or affiliate of the named entity."
        3.  Section 4.5 is deleted in its entirety.

        The expected JSON output would be:

        {
          "amended_clauses": [
            {
              "original_clause_identifier": "2.1",
              "amended_clause_text": "The term of this Agreement shall be for a period of five (5) years, commencing on the Effective Date.",
              "amendment_type": "replacement"
            },
            {
              "original_clause_identifier": "1",
              "amended_clause_text": "A 'Party' may also include any subsidiary or affiliate of the named entity.",
              "amendment_type": "addition"
            },
            {
              "original_clause_identifier": "4.5",
              "amended_clause_text": "",
              "amendment_type": "deletion"
            }
          ]
        }

        **Critical Requirements and Error Handling:**

        *   **JSON Validity:**  The output *must* be perfectly valid JSON.  Any deviation (e.g., missing commas, incorrect quotes, unescaped characters) will cause failure. Use a JSON validator to check your output *before* providing it.
        *   **Completeness:**  Capture *all* amended clauses.  Missing a clause is a critical error.
        *   **Accuracy:**  The original_clause_identifier and amended_clause_text must be accurate.  Incorrect identification or extraction is a critical error.
        *   **Ambiguity:** If the addendum is ambiguous and the original_clause_identifier cannot be *definitively* determined, use "unknown" for that field.  Do *not* guess.  However, provide the extracted text that *relates* to the amendment in amended_clause_text, even if the original clause identifier is unknown.
        * **Empty Amended Text:** If the amendment type is deletion, make sure the "amended_clause_text" is an empty string.
        *   **No Extraneous Information:** Do not include any comments, explanations, or extra fields in the JSON output.  Only the specified structure is permitted.
        * **Consistency:** Be extremely strict about following the format. A single misplaced character will break the parser.
        * **Assumptions:** If any parts of the task are unclear, state any reasonable assumptions you are making *very clearly* as internal comments *within your thought process*, but *not* in the JSON output.
    `,
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        referenced_section: {
          type: SchemaType.STRING,
        },
        amendment_type: {
          type: SchemaType.STRING,
        },
        amended_clause_text: {
          type: SchemaType.STRING,
        },
      },
    },
  },
  {
    dbName: 'cpi',
    query: `Can prices in this contract be increased by a value that is related to CPI? Answer either Yes or No`,
  },
];
